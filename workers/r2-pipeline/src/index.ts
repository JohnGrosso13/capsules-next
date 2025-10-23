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

const MAX_DOCUMENT_TEXT_CHARS = 20_000;

function readProcessingMetadata(
  metadata: Record<string, unknown> | null | undefined,
): Record<string, unknown> | null {
  if (!metadata || typeof metadata !== "object") return null;
  const processing = (metadata as { processing?: unknown }).processing;
  if (!processing || typeof processing !== "object") return null;
  return processing as Record<string, unknown>;
}

function isProcessingTextLike(metadata: Record<string, unknown> | null | undefined): boolean {
  const processing = readProcessingMetadata(metadata);
  const value = processing?.text_like;
  return typeof value === "boolean" ? value : false;
}

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

async function handleUploadEvents(
  batch: MessageBatch<UploadEventMessage>,
  env: Env,
): Promise<void> {
  for (const message of batch.messages) {
    try {
      const baseEvent = message.body;
      let mergedEvent: UploadEventMessage = baseEvent;
      if (baseEvent.sessionId) {
        try {
          const kvRecord = await env.UPLOAD_SESSIONS_KV.get(`session:${baseEvent.sessionId}`, {
            type: "json",
          });
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

      const stub = getCoordinatorStub(
        env,
        mergedEvent.sessionId,
        mergedEvent.uploadId,
        mergedEvent.key,
      );
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
        await env.PROCESSING_QUEUE.sendBatch(data.tasks.map((task) => ({ body: task })));
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
    const stub = getCoordinatorStub(
      env,
      taskMessage.sessionId,
      taskMessage.uploadId,
      taskMessage.key,
    );
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
    case "document.extract-text":
      return processDocumentExtractText(env, message);
    case "document.preview":
      return processDocumentPreview(env, message);
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

  const originalContentType = resolveOriginalContentType(message);
  const preferredFormats = buildFormatCandidates(originalContentType, message.key);
  const errors: Error[] = [];

  for (const format of preferredFormats) {
    try {
      return await generateImageVariant(env, message, task, format, originalContentType);
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      errors.push(err);
      console.warn("image variant generation failed", { format, error: err.message });
    }
  }

  const fallbackError =
    errors.length > 0 ? errors[errors.length - 1] : new Error("Image variant generation failed");
  throw fallbackError;
}

function resolveOriginalContentType(message: ProcessingTaskMessage): string | null {
  return (
    normalizeContentType(message.contentType) ??
    readContentTypeFromRecord(message.metadata) ??
    guessMimeFromKey(message.key)
  );
}

function buildFormatCandidates(
  originalContentType: string | null,
  key: string,
): Array<"jpeg" | "webp"> {
  const preferJpeg = shouldPreferJpeg(originalContentType, key);
  const formats: Array<"jpeg" | "webp"> = preferJpeg ? ["jpeg", "webp"] : ["webp", "jpeg"];
  return Array.from(new Set(formats));
}

async function generateImageVariant(
  env: Env,
  message: ProcessingTaskMessage,
  task: Extract<ProcessingTask, { kind: "image.thumbnail" | "image.preview" }>,
  format: "jpeg" | "webp",
  originalContentType: string | null,
): Promise<DerivedAssetRecord> {
  const sourceUrl = buildPublicUrl(env, message.key);
  const ops = [`width=${task.width}`];
  if (task.height) ops.push(`height=${task.height}`);
  const quality = format === "jpeg" ? 88 : 85;
  ops.push(`quality=${quality}`, `format=${format}`);
  const resizeUrl = `${env.IMAGE_RESIZE_BASE_URL.replace(/\/$/, "")}/${ops.join(",")}/${encodeURIComponent(sourceUrl)}`;
  const response = await fetch(resizeUrl);
  if (!response.ok) {
    throw new Error(`Image resize failed (${response.status})`);
  }
  const buffer = await response.arrayBuffer();
  const ext = format === "jpeg" ? "jpg" : format;
  const derivedKey = `${stripExtension(message.key)}__${task.kind.replace(".", "_")}_${task.width}.${ext}`;
  const contentType = format === "jpeg" ? "image/jpeg" : `image/${format}`;
  await env.R2_BUCKET.put(derivedKey, buffer, {
    httpMetadata: { contentType },
  });
  return {
    type: task.kind,
    key: derivedKey,
    url: buildPublicUrl(env, derivedKey),
    metadata: {
      width: task.width,
      height: task.height ?? null,
      format,
      content_type: contentType,
      source_content_type: originalContentType ?? null,
      note: "Generated via Cloudflare Image Resizing",
    },
  };
}

const RAW_LIKE_MIME_TYPES = new Set([
  "image/heic",
  "image/heif",
  "image/x-adobe-dng",
  "image/x-dng",
  "image/x-raw",
  "image/x-canon-cr2",
  "image/x-nikon-nef",
  "image/x-sony-arw",
]);

const RAW_LIKE_EXTENSIONS = new Set([
  "heic",
  "heif",
  "dng",
  "nef",
  "cr2",
  "arw",
  "raw",
  "raf",
  "rw2",
]);

function shouldPreferJpeg(contentType: string | null, key: string): boolean {
  const normalized = contentType?.toLowerCase() ?? null;
  if (normalized && RAW_LIKE_MIME_TYPES.has(normalized)) {
    return true;
  }
  const ext = extractExtension(key);
  if (ext && RAW_LIKE_EXTENSIONS.has(ext)) {
    return true;
  }
  return false;
}

function normalizeContentType(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed.toLowerCase() : null;
}

function readContentTypeFromRecord(
  record: Record<string, unknown> | null | undefined,
): string | null {
  if (!record || typeof record !== "object") return null;
  const candidates = [
    (record as { mime_type?: unknown }).mime_type,
    (record as { mimeType?: unknown }).mimeType,
    (record as { content_type?: unknown }).content_type,
    (record as { contentType?: unknown }).contentType,
  ];
  for (const candidate of candidates) {
    const normalized = normalizeContentType(candidate as string | null | undefined);
    if (normalized) return normalized;
  }
  return null;
}

const EXTENSION_MIME_MAP: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  jpe: "image/jpeg",
  png: "image/png",
  gif: "image/gif",
  webp: "image/webp",
  avif: "image/avif",
  heic: "image/heic",
  heif: "image/heif",
  bmp: "image/bmp",
  svg: "image/svg+xml",
  mp4: "video/mp4",
  m4v: "video/mp4",
  mov: "video/quicktime",
  webm: "video/webm",
  ogv: "video/ogg",
  ogg: "video/ogg",
  mkv: "video/x-matroska",
  dng: "image/x-adobe-dng",
  raw: "image/x-raw",
  arw: "image/x-sony-arw",
  cr2: "image/x-canon-cr2",
  nef: "image/x-nikon-nef",
  raf: "image/x-fuji-raf",
  rw2: "image/x-panasonic-rw2",
};

function guessMimeFromKey(key: string): string | null {
  const ext = extractExtension(key);
  if (!ext) return null;
  return EXTENSION_MIME_MAP[ext] ?? null;
}

function extractExtension(key: string): string | null {
  const withoutQuery = key.split(/[?#]/)[0] ?? "";
  const lastDot = withoutQuery.lastIndexOf(".");
  if (lastDot === -1) return null;
  const ext = withoutQuery.slice(lastDot + 1).toLowerCase();
  return ext || null;
}

async function processVideoTranscode(
  env: Env,
  message: ProcessingTaskMessage,
): Promise<DerivedAssetRecord> {
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

async function processVideoThumbnail(
  env: Env,
  message: ProcessingTaskMessage,
): Promise<DerivedAssetRecord> {
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

async function processAudioExtract(
  env: Env,
  message: ProcessingTaskMessage,
): Promise<DerivedAssetRecord> {
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

async function processDocumentExtractText(
  env: Env,
  message: ProcessingTaskMessage,
): Promise<DerivedAssetRecord> {
  const textLike = isProcessingTextLike(message.metadata as Record<string, unknown> | null);
  if (textLike) {
    const object = await env.R2_BUCKET.get(message.key);
    if (!object) throw new Error("Source document not found in R2");
    const text = await object.text();
    const trimmed = text.trim();
    const truncated = trimmed.length > MAX_DOCUMENT_TEXT_CHARS;
    const excerpt = truncated ? trimmed.slice(0, MAX_DOCUMENT_TEXT_CHARS) : trimmed;
    const derivedKey = `${stripExtension(message.key)}__excerpt.txt`;
    await env.R2_BUCKET.put(derivedKey, excerpt, {
      httpMetadata: { contentType: "text/plain; charset=utf-8" },
    });
    return {
      type: "document.extract-text",
      key: derivedKey,
      url: buildPublicUrl(env, derivedKey),
      metadata: {
        truncated,
        max_chars: MAX_DOCUMENT_TEXT_CHARS,
        content_type: message.contentType ?? null,
        note: truncated
          ? "Excerpt truncated for development safeguard."
          : "Full text extracted (development placeholder).",
      },
    };
  }

  const derivedKey = `${stripExtension(message.key)}__extract.json`;
  const payload = {
    status: "pending",
    content_type: message.contentType ?? null,
    generated_at: new Date().toISOString(),
    note: "Binary document extraction requires an external processor.",
  };
  await env.R2_BUCKET.put(derivedKey, JSON.stringify(payload, null, 2), {
    httpMetadata: { contentType: "application/json" },
  });
  return {
    type: "document.extract-text",
    key: derivedKey,
    url: buildPublicUrl(env, derivedKey),
    metadata: payload,
  };
}

async function processDocumentPreview(
  env: Env,
  message: ProcessingTaskMessage,
): Promise<DerivedAssetRecord> {
  const textLike = isProcessingTextLike(message.metadata as Record<string, unknown> | null);
  let snippet: string | null = null;
  if (textLike) {
    const object = await env.R2_BUCKET.get(message.key);
    if (object) {
      const text = await object.text();
      snippet = text.trim().slice(0, 600);
    }
  }

  const derivedKey = `${stripExtension(message.key)}__preview.json`;
  const payload = {
    status: textLike && snippet ? "available" : "pending",
    snippet,
    content_type: message.contentType ?? null,
    generated_at: new Date().toISOString(),
    note: textLike
      ? "Preview generated from document excerpt (development placeholder)."
      : "Preview generation requires an external renderer.",
  };
  await env.R2_BUCKET.put(derivedKey, JSON.stringify(payload, null, 2), {
    httpMetadata: { contentType: "application/json" },
  });

  return {
    type: "document.preview",
    key: derivedKey,
    url: buildPublicUrl(env, derivedKey),
    metadata: payload,
  };
}

async function processSafetyScan(
  env: Env,
  message: ProcessingTaskMessage,
): Promise<DerivedAssetRecord> {
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
