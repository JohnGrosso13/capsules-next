import type { DurableObjectStub, MessageBatch } from "@cloudflare/workers-types";

import { UploadCoordinator } from "./upload-coordinator";
import {
  CoordinatorState,
  DerivedAssetRecord,
  Env,
  ProcessingTask,
  ProcessingTaskMessage,
  UploadEventMessage,
} from "./types";
export { UploadCoordinator };

const PLACEHOLDER_POSTER_BASE64 =
  "/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAEBAQEB" +
  "AQEBAQEBBQIBAQICAQUFAgICAwUDAwMDAwYGBQUFBQYGBgYGBgcICAgICQcKCgoKCgwMDAwMDAwMDAz/" +
  "wAALCAAaABoBAREA/8QAFwAAAwEAAAAAAAAAAAAAAAAAAAIDBf/EABQBAQAAAAAAAAAAAAAAAAAAAAD/" +
  "xAAUAQEAAAAAAAAAAAAAAAAAAAAC/8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAwDAQACEQMRAD8AygD/" +
  "2Q==";

const worker = {
  async fetch(request: Request, _env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/health") {
      return new Response("ok", { headers: { "content-type": "text/plain" } });
    }
    return new Response("Not found", { status: 404 });
  },

  async queue(batch: MessageBatch<unknown>, env: Env): Promise<void> {
    if ((batch as MessageBatch<UploadEventMessage>).queue === "r2-upload-events") {
      await handleUploadEvents(batch as MessageBatch<UploadEventMessage>, env);
      return;
    }
    await handleProcessingTasks(batch as MessageBatch<ProcessingTaskMessage>, env);
  },
};

async function handleUploadEvents(batch: MessageBatch<UploadEventMessage>, env: Env): Promise<void> {
  for (const message of batch.messages) {
    try {
      const baseEvent = message.body;
      let mergedEvent: UploadEventMessage = baseEvent;
      if (baseEvent.sessionId) {
        try {
          const kvRecord = await env.UPLOAD_SESSIONS_KV.get(`session:${baseEvent.sessionId}`, { type: "json" });
          if (kvRecord && typeof kvRecord === "object") {
            const record = kvRecord as Record<string, unknown>;
            mergedEvent = {
              ...baseEvent,
              ownerId: (record.ownerId as string | null | undefined) ?? baseEvent.ownerId ?? null,
              bucket: (record.bucket as string | undefined) ?? baseEvent.bucket,
              contentType:
                (record.contentType as string | null | undefined) ?? baseEvent.contentType ?? null,
              metadata:
                (record.metadata as Record<string, unknown> | null | undefined) ??
                baseEvent.metadata ??
                null,
            };
          }
        } catch (kvError) {
          console.warn("upload event kv lookup failed", kvError);
        }
      }

      const stub = getCoordinatorStub(env, mergedEvent.sessionId, mergedEvent.uploadId, mergedEvent.key);
      const response = await stub.fetch("https://do/process", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ event: mergedEvent }),
      });
      if (!response.ok) {
        throw new Error(`Coordinator process failed: ${response.status}`);
      }
      const data = (await response.json()) as { tasks: ProcessingTaskMessage[] };
      if (data.tasks?.length) {
        await env.PROCESSING_QUEUE.sendBatch(
          data.tasks.map((task) => ({ body: task })),
        );
      }
      message.ack();
    } catch (error) {
      console.error("upload event error", error);
      message.retry({ delaySeconds: 30 });
    }
  }
}

async function handleProcessingTasks(
  batch: MessageBatch<ProcessingTaskMessage>,
  env: Env,
): Promise<void> {
  for (const message of batch.messages) {
    const taskMessage = message.body;
    const stub = getCoordinatorStub(env, taskMessage.sessionId, taskMessage.uploadId, taskMessage.key);
    try {
      const derived = await runTask(env, stub, taskMessage);
      await stub.fetch("https://do/task-complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ task: taskMessage.task, derived }),
      });
      message.ack();
    } catch (error) {
      console.error("task processing failed", error);
      await stub.fetch("https://do/task-complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          task: taskMessage.task,
          error: error instanceof Error ? error.message : String(error),
        }),
      });
      message.retry({ delaySeconds: 60 });
    }
  }
}

function getCoordinatorStub(env: Env, sessionId: string | null, uploadId: string, key: string) {
  const name = sessionId ?? uploadId ?? key;
  const id = env.UPLOAD_COORDINATOR.idFromName(name);
  return env.UPLOAD_COORDINATOR.get(id);
}

async function runTask(
  env: Env,
  stub: DurableObjectStub,
  message: ProcessingTaskMessage,
): Promise<DerivedAssetRecord | null> {
  const task = message.task;
  switch (task.kind) {
    case "image.thumbnail":
    case "image.preview":
      return processImageVariant(env, message, task);
    case "video.transcode":
      return processVideoTranscode(env, message);
    case "video.thumbnail":
      return processVideoThumbnail(env, message);
    case "video.audio":
      return processAudioExtract(env, message);
    case "video.transcript":
      return processTranscript(env, message, stub);
    case "safety.scan":
      return processSafetyScan(env, message);
    default:
      return null;
  }
}

function buildPublicUrl(env: Env, key: string): string {
  const base = env.PUBLIC_MEDIA_BASE_URL.replace(/\/$/, "");
  return `${base}/${encodeURI(key)}`;
}

async function processImageVariant(
  env: Env,
  message: ProcessingTaskMessage,
  task: Extract<ProcessingTask, { kind: "image.thumbnail" | "image.preview" }>,
): Promise<DerivedAssetRecord> {
  if (!env.IMAGE_RESIZE_BASE_URL) {
    throw new Error("IMAGE_RESIZE_BASE_URL not configured");
  }
  const sourceUrl = buildPublicUrl(env, message.key);
  const ops = [`width=${task.width}`];
  if (task.height) ops.push(`height=${task.height}`);
  ops.push("quality=85", "format=webp");
  const resizeUrl = `${env.IMAGE_RESIZE_BASE_URL.replace(/\/$/, "")}/${ops.join(",")}/${encodeURIComponent(sourceUrl)}`;
  const response = await fetch(resizeUrl);
  if (!response.ok) {
    throw new Error(`Image resize failed (${response.status})`);
  }
  const buffer = await response.arrayBuffer();
  const derivedKey = `${stripExtension(message.key)}__${task.kind.replace(".", "_")}_${task.width}.webp`;
  await env.R2_BUCKET.put(derivedKey, buffer, {
    httpMetadata: {
      contentType: "image/webp",
    },
  });
  return {
    type: task.kind,
    key: derivedKey,
    url: buildPublicUrl(env, derivedKey),
    metadata: {
      width: task.width,
      height: task.height ?? null,
      note: "Generated via Cloudflare Image Resizing",
    },
  };
}

async function processVideoTranscode(env: Env, message: ProcessingTaskMessage): Promise<DerivedAssetRecord> {
  const object = await env.R2_BUCKET.get(message.key);
  if (!object) {
    throw new Error("Source video not found in R2");
  }
  const buffer = await object.arrayBuffer();
  const derivedKey = `${stripExtension(message.key)}__stream.mp4`;
  await env.R2_BUCKET.put(derivedKey, buffer, {
    httpMetadata: {
      contentType: message.contentType ?? "video/mp4",
    },
  });
  return {
    type: "video.transcode",
    key: derivedKey,
    url: buildPublicUrl(env, derivedKey),
    metadata: {
      note: "Placeholder transcode. Replace with Cloudflare Stream integration.",
    },
  };
}

async function processVideoThumbnail(env: Env, message: ProcessingTaskMessage): Promise<DerivedAssetRecord> {
  const derivedKey = `${stripExtension(message.key)}__poster.jpg`;
  const bytes = decodeBase64(PLACEHOLDER_POSTER_BASE64);
  await env.R2_BUCKET.put(derivedKey, bytes, {
    httpMetadata: {
      contentType: "image/jpeg",
    },
  });
  return {
    type: "video.thumbnail",
    key: derivedKey,
    url: buildPublicUrl(env, derivedKey),
    metadata: {
      note: "Placeholder poster frame. Replace with actual frame extraction.",
    },
  };
}

async function processAudioExtract(env: Env, message: ProcessingTaskMessage): Promise<DerivedAssetRecord> {
  const object = await env.R2_BUCKET.get(message.key);
  if (!object) throw new Error("Source media missing");
  const buffer = await object.arrayBuffer();
  const derivedKey = `${stripExtension(message.key)}__audio-source.bin`;
  await env.R2_BUCKET.put(derivedKey, buffer, {
    httpMetadata: { contentType: "application/octet-stream" },
  });
  return {
    type: "video.audio",
    key: derivedKey,
    url: buildPublicUrl(env, derivedKey),
    metadata: {
      note: "Placeholder audio extract. Integrate with a real demuxer.",
    },
  };
}

async function processTranscript(
  env: Env,
  message: ProcessingTaskMessage,
  stub: DurableObjectStub,
): Promise<DerivedAssetRecord> {
  const state = await getCoordinatorState(stub);
  const transcript = `Transcript placeholder for ${state?.uploadId ?? "unknown"}`;
  const derivedKey = `${stripExtension(message.key)}__transcript.txt`;
  await env.R2_BUCKET.put(derivedKey, transcript, {
    httpMetadata: { contentType: "text/plain; charset=utf-8" },
  });
  return {
    type: "video.transcript",
    key: derivedKey,
    url: buildPublicUrl(env, derivedKey),
    metadata: {
      note: "Placeholder transcript. Connect to Workers AI or external service.",
    },
  };
}

async function processSafetyScan(env: Env, message: ProcessingTaskMessage): Promise<DerivedAssetRecord> {
  const derivedKey = `${stripExtension(message.key)}__safety.json`;
  const payload = {
    status: "pending",
    note: "Safety scan placeholder. Integrate with Cloudflare AI or third-party scanner.",
  };
  await env.R2_BUCKET.put(derivedKey, JSON.stringify(payload, null, 2), {
    httpMetadata: { contentType: "application/json" },
  });
  return {
    type: "safety.scan",
    key: derivedKey,
    url: buildPublicUrl(env, derivedKey),
    metadata: payload,
  };
}

async function getCoordinatorState(stub: DurableObjectStub): Promise<CoordinatorState | null> {
  const res = await stub.fetch("https://do/state");
  if (!res.ok) return null;
  return (await res.json()) as CoordinatorState;
}

function stripExtension(key: string): string {
  const idx = key.lastIndexOf(".");
  if (idx <= 0) return key;
  return key.slice(0, idx);
}

function decodeBase64(value: string): ArrayBuffer {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}



export default worker;
