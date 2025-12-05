import type { DurableObjectStub, MessageBatch, R2ObjectBody } from "@cloudflare/workers-types";

import { UploadCoordinator } from "./upload-coordinator";
import {
  type CoordinatorState,
  type DerivedAssetRecord,
  type Env,
  type ProcessingTask,
  type ProcessingTaskMessage,
  type UploadEventMessage,
} from "./types";
export { UploadCoordinator };

const PLACEHOLDER_POSTER_BASE64 =
  "/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAEBAQEB" +
  "AQEBAQEBBQIBAQICAQUFAgICAwUDAwMDAwYGBQUFBQYGBgYGBgcICAgICQcKCgoKCgwMDAwMDAwMDAz/" +
  "wAALCAAaABoBAREA/8QAFwAAAwEAAAAAAAAAAAAAAAAAAAIDBf/EABQBAQAAAAAAAAAAAAAAAAAAAAD/" +
  "xAAUAQEAAAAAAAAAAAAAAAAAAAAC/8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAwDAQACEQMRAD8AygD/" +
  "2Q==";

const MAX_DOCUMENT_TEXT_CHARS = 20_000;
const MAX_IMAGE_BYTES = 4_500_000;
const MAX_TEXT_BYTES = 500_000;
const MAX_AUDIO_BYTES = 25_000_000;
const SAFETY_JSON_INDENT = 2;
const EXECUTABLE_EXTENSIONS = new Set([
  "exe",
  "dll",
  "msi",
  "com",
  "bat",
  "cmd",
  "scr",
  "pif",
  "ps1",
  "psm1",
  "vbs",
  "js",
  "jar",
  "sh",
  "run",
]);
const ARCHIVE_EXTENSIONS = new Set(["zip", "rar", "7z", "tar", "gz", "tgz", "bz2", "xz", "zst", "iso"]);
const EXECUTABLE_MIME_HINTS = ["x-msdownload", "x-msdos-program", "x-msinstaller", "x-executable", "x-dosexec", "x-elf"];
const ARCHIVE_MIME_HINTS = ["zip", "compressed", "x-7z-compressed", "x-rar-compressed", "x-tar", "x-gtar", "x-bzip2", "x-xz"];

type SafetyDecision = "allow" | "review" | "block";
type SafetySeverity = "none" | "low" | "medium" | "high";
type SafetyLabelScore = { score: number; severity: SafetySeverity; rationale?: string | null };
type SafetyPayload = {
  status: "succeeded" | "error";
  decision: SafetyDecision;
  kind: "image" | "video" | "audio" | "text" | "document" | "unknown";
  model: string | null;
  labels: Record<string, SafetyLabelScore>;
  scanned_at: string;
  source: "openai";
  notes?: string[];
  reason?: string | null;
  raw_id?: string | null;
  input_bytes?: number | null;
  truncated?: boolean;
};

const OPENAI_DEFAULT_BASE_URL = "https://api.openai.com/v1";

const IMAGE_SAFETY_SYSTEM_PROMPT =
  "You are a strict content safety classifier. Return JSON only. Evaluate the attached image for these categories: " +
  "sexual, sexual/minors, violence, violence/graphic, hate, hate/threatening, harassment, harassment/threatening, self-harm, self-harm/intent, self-harm/instructions, weapons, drugs. " +
  "Return {\"labels\": {<category>: <0-1 float>}, \"notes\": [\"...optional notes...\"]}. Do not include any other text.";

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

function resolveOpenAIBaseUrl(env: Env): string {
  const raw = (env.OPENAI_BASE_URL ?? "").trim();
  const base = raw.length ? raw : OPENAI_DEFAULT_BASE_URL;
  return base.replace(/\/+$/, "");
}

function requireOpenAIKey(env: Env): string {
  const key = (env.OPENAI_API_KEY ?? "").trim();
  if (!key) {
    throw new Error("OPENAI_API_KEY not configured for safety scanning");
  }
  return key;
}

async function postOpenAIJson<T>(
  env: Env,
  path: string,
  body: unknown,
  init: RequestInit = {},
): Promise<{ response: Response; data: T | null; rawBody: string }> {
  const apiKey = requireOpenAIKey(env);
  const url = path.startsWith("http") ? path : `${resolveOpenAIBaseUrl(env).replace(/\/+$/, "")}${path.startsWith("/") ? path : `/${path}`}`;
  const payload = typeof body === "string" ? body : JSON.stringify(body);
  const headers = new Headers(init.headers ?? {});
  headers.set("Authorization", `Bearer ${apiKey}`);
  if (env.OPENAI_ORGANIZATION && !headers.has("OpenAI-Organization")) {
    headers.set("OpenAI-Organization", env.OPENAI_ORGANIZATION);
  }
  if (env.OPENAI_PROJECT && !headers.has("OpenAI-Project")) {
    headers.set("OpenAI-Project", env.OPENAI_PROJECT);
  }
  if (!headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(url, {
    method: "POST",
    ...init,
    headers,
    body: payload,
  });
  const rawBody = await response.text();
  let data: T | null = null;
  try {
    data = rawBody ? (JSON.parse(rawBody) as T) : null;
  } catch {
    data = null;
  }
  return { response, data, rawBody };
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i += 1) {
    binary += String.fromCharCode(bytes[i] ?? 0);
  }
  // btoa is available in Workers runtime
  return btoa(binary);
}

function scoreToSeverity(score: number): SafetySeverity {
  if (!Number.isFinite(score) || score <= 0.05) return "none";
  if (score >= 0.85) return "high";
  if (score >= 0.6) return "medium";
  if (score >= 0.25) return "low";
  return "none";
}

function decideFromLabels(labels: Record<string, SafetyLabelScore>): SafetyDecision {
  const score = (key: string) => labels[key]?.score ?? 0;
  if (score("sexual/minors") >= 0.2) return "block";
  if (score("violence/graphic") >= 0.6) return "block";
  if (score("hate/threatening") >= 0.6 || score("harassment/threatening") >= 0.6) return "block";
  if (score("self-harm/instructions") >= 0.5) return "block";

  if (
    score("sexual") >= 0.85 ||
    score("violence") >= 0.7 ||
    score("hate") >= 0.5 ||
    score("harassment") >= 0.5 ||
    score("self-harm") >= 0.5 ||
    score("self-harm/intent") >= 0.5 ||
    score("weapons") >= 0.7 ||
    score("drugs") >= 0.7
  ) {
    return "review";
  }

  const anyMedium = Object.values(labels).some((entry) => {
    const severity = entry?.severity ?? "none";
    return severity === "medium" || severity === "high";
  });
  if (anyMedium) return "review";
  return "allow";
}

async function readR2Object(
  env: Env,
  key: string,
  maxBytes: number,
): Promise<{ buffer: ArrayBuffer; contentType: string | null; truncated: boolean }> {
  const object = await env.R2_BUCKET.get(key, { range: { offset: 0, length: maxBytes } });
  if (!object) {
    throw new Error("Source object missing for safety scan");
  }
  const buffer = await object.arrayBuffer();
  const contentType =
    normalizeContentType(object.httpMetadata?.contentType ?? null) ?? guessMimeFromKey(key);
  const truncated = typeof object.size === "number" ? object.size > buffer.byteLength : false;
  return { buffer, contentType, truncated };
}

function buildSafetyPayloadBase(
  kind: SafetyPayload["kind"],
  model: string | null,
  labels: Record<string, SafetyLabelScore>,
  notes: string[],
  metadata?: Partial<SafetyPayload>,
): SafetyPayload {
  const decision = decideFromLabels(labels);
  const payload: SafetyPayload = {
    status: "succeeded",
    decision,
    kind,
    model,
    labels,
    scanned_at: new Date().toISOString(),
    source: "openai",
    ...metadata,
  };
  if (notes.length) {
    payload.notes = notes;
  }
  return payload;
}

async function runTextModeration(
  env: Env,
  text: string,
  kind: SafetyPayload["kind"],
): Promise<SafetyPayload> {
  const input = text.trim().slice(0, MAX_DOCUMENT_TEXT_CHARS);
  const { data } = await postOpenAIJson<{
    id?: string;
    model?: string;
    results?: Array<{
      category_scores: Record<string, number>;
    }>;
  }>(env, "/moderations", {
    model: "omni-moderation-latest",
    input,
  });

  const scores = data?.results?.[0]?.category_scores ?? {};
  const labels: Record<string, SafetyLabelScore> = {};
  Object.entries(scores).forEach(([key, value]) => {
    const numeric = Number(value ?? 0);
    labels[key] = { score: numeric, severity: scoreToSeverity(numeric) };
  });
  const notes: string[] = [];
  if (input.length < text.length) notes.push("text truncated for moderation");

  return buildSafetyPayloadBase(kind, data?.model ?? "omni-moderation-latest", labels, notes, {
    raw_id: data?.id ?? null,
    truncated: input.length < text.length,
    input_bytes: input.length,
  });
}

async function runImageModeration(
  env: Env,
  buffer: ArrayBuffer,
  contentType: string,
  metadata: { truncated: boolean },
): Promise<SafetyPayload> {
  const model = "gpt-4o-mini";
  const base64 = arrayBufferToBase64(buffer);
  const { data } = await postOpenAIJson<{
    id?: string;
    model?: string;
    choices?: Array<{ message?: { content?: string } }>;
  }>(env, "/chat/completions", {
    model,
    temperature: 0,
    max_tokens: 200,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: IMAGE_SAFETY_SYSTEM_PROMPT },
      {
        role: "user",
        content: [
          { type: "text", text: "Classify this image for safety risks. Return JSON only." },
          { type: "image_url", image_url: { url: `data:${contentType};base64,${base64}` } },
        ],
      },
    ],
  });

  const rawContent = data?.choices?.[0]?.message?.content ?? "{}";
  let parsed: { labels?: Record<string, number>; notes?: string[] } = {};
  try {
    parsed = JSON.parse(rawContent);
  } catch {
    parsed = {};
  }
  const labels: Record<string, SafetyLabelScore> = {};
  Object.entries(parsed.labels ?? {}).forEach(([key, value]) => {
    const numeric = Number(value ?? 0);
    labels[key] = { score: numeric, severity: scoreToSeverity(numeric) };
  });
  const notes = Array.isArray(parsed.notes)
    ? parsed.notes.filter((n): n is string => typeof n === "string" && n.trim().length > 0)
    : [];
  if (metadata.truncated) notes.push("image truncated for moderation (byte cap)");
  return buildSafetyPayloadBase("image", data?.model ?? model, labels, notes, {
    raw_id: data?.id ?? null,
    input_bytes: buffer.byteLength,
    truncated: metadata.truncated,
  });
}

async function transcribeForModeration(
  env: Env,
  buffer: ArrayBuffer,
  contentType: string | null,
  filename: string,
): Promise<string> {
  const form = new FormData();
  const file = new File([buffer], filename || "clip", { type: contentType ?? "application/octet-stream" });
  form.append("file", file);
  form.append("model", "whisper-1");
  form.append("temperature", "0");

  const apiKey = requireOpenAIKey(env);
  const headers = new Headers();
  headers.set("Authorization", `Bearer ${apiKey}`);
  if (env.OPENAI_ORGANIZATION) headers.set("OpenAI-Organization", env.OPENAI_ORGANIZATION);
  if (env.OPENAI_PROJECT) headers.set("OpenAI-Project", env.OPENAI_PROJECT);

  const response = await fetch(`${resolveOpenAIBaseUrl(env)}/audio/transcriptions`, {
    method: "POST",
    headers,
    body: form,
  });
  const rawBody = await response.text();
  if (!response.ok) {
    throw new Error(`Transcription failed (${response.status}): ${rawBody.slice(0, 200)}`);
  }
  try {
    const parsed = JSON.parse(rawBody) as { text?: string };
    return typeof parsed.text === "string" ? parsed.text : "";
  } catch {
    return "";
  }
}

async function runAudioModeration(
  env: Env,
  buffer: ArrayBuffer,
  contentType: string | null,
  kind: SafetyPayload["kind"],
  truncated: boolean,
  filename: string,
): Promise<SafetyPayload> {
  const transcript = await transcribeForModeration(env, buffer, contentType, filename);
  if (!transcript.trim().length) {
    return {
      status: "error",
      decision: "review",
      kind,
      model: null,
      labels: {},
      scanned_at: new Date().toISOString(),
      source: "openai",
      notes: ["Audio transcription empty; manual review"],
      truncated,
      input_bytes: buffer.byteLength,
    };
  }
  const textResult = await runTextModeration(env, transcript, kind);
  textResult.notes = [...(textResult.notes ?? []), "Transcribed audio used for safety"];
  textResult.truncated = truncated || Boolean(textResult.truncated);
  textResult.input_bytes = buffer.byteLength;
  return textResult;
}

async function classifyUploadSafety(
  env: Env,
  message: ProcessingTaskMessage,
): Promise<SafetyPayload> {
  const contentType = resolveOriginalContentType(message);
  if (isExecutableLike(message.key, contentType)) {
    return {
      status: "succeeded",
      decision: "block",
      kind: "unknown",
      model: null,
      labels: {},
      scanned_at: new Date().toISOString(),
      source: "openai",
      notes: ["Executable or script file blocked pending malware scan"],
      reason: "Executable upload blocked",
      input_bytes: null,
    };
  }
  if (isArchiveLike(message.key, contentType)) {
    return {
      status: "succeeded",
      decision: "review",
      kind: "unknown",
      model: null,
      labels: {},
      scanned_at: new Date().toISOString(),
      source: "openai",
      notes: ["Archive file requires malware scan; defaulting to review"],
      reason: "Archive upload requires manual review",
      input_bytes: null,
    };
  }
  const normalizedKind = (() => {
    if (contentType?.startsWith("image/")) return "image";
    if (contentType?.startsWith("video/")) return "video";
    if (contentType?.startsWith("audio/")) return "audio";
    if (contentType?.startsWith("text/")) return "text";
    if (contentType?.includes("json") || contentType?.includes("xml")) return "text";
    if (contentType?.includes("pdf") || contentType?.includes("document") || contentType?.includes("msword")) {
      return "document";
    }
    if (isProcessingTextLike(message.metadata as Record<string, unknown> | null)) return "text";
    return "unknown";
  })() as SafetyPayload["kind"];

  switch (normalizedKind) {
    case "image": {
      const { buffer, contentType: detectedContentType, truncated } = await readR2Object(
        env,
        message.key,
        MAX_IMAGE_BYTES,
      );
      const effectiveType = detectedContentType ?? contentType ?? "image/jpeg";
      return runImageModeration(env, buffer, effectiveType, { truncated });
    }
    case "text":
    case "document": {
      const { buffer, truncated } = await readR2Object(env, message.key, MAX_TEXT_BYTES);
      const text = new TextDecoder("utf-8").decode(buffer);
      const result = await runTextModeration(env, text, normalizedKind);
      result.truncated = truncated || Boolean(result.truncated);
      result.input_bytes = buffer.byteLength;
      return result;
    }
    case "audio":
    case "video": {
      const { buffer, contentType: detectedContentType, truncated } = await readR2Object(
        env,
        message.key,
        MAX_AUDIO_BYTES,
      );
      return runAudioModeration(
        env,
        buffer,
        detectedContentType ?? contentType ?? null,
        normalizedKind,
        truncated,
        message.key.split("/").pop() ?? "clip",
      );
    }
    default: {
      return {
        status: "error",
        decision: "review",
        kind: "unknown",
        model: null,
        labels: {},
        scanned_at: new Date().toISOString(),
        source: "openai",
        notes: ["Unsupported content type for safety scan"],
        input_bytes: null,
      };
    }
  }
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
      return processVideoTranscode(env, message, stub);
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
  const originalContentType = resolveOriginalContentType(message);
  const preferredFormats = buildFormatCandidates(originalContentType, message.key);
  const errors: Error[] = [];
  const rawPreviewAvailable =
    typeof env.RAW_PREVIEW_BASE_URL === "string" && env.RAW_PREVIEW_BASE_URL.trim().length > 0;
  const rawLikeSource = isRawLikeSource(originalContentType, message.key);

  if (rawLikeSource && rawPreviewAvailable) {
    try {
      return await generateRawPreviewVariant(env, message, task, originalContentType);
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      errors.push(err);
      console.warn("raw preview variant generation failed", { error: err.message });
    }
  }

  if (!env.IMAGE_RESIZE_BASE_URL) {
    if (errors.length) {
      throw errors[errors.length - 1];
    }
    throw new Error("IMAGE_RESIZE_BASE_URL not configured");
  }

  for (const format of preferredFormats) {
    try {
      return await generateImageVariant(env, message, task, format, originalContentType);
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      errors.push(err);
      console.warn("image variant generation failed", { format, error: err.message });
    }
  }

  if (!rawLikeSource && rawPreviewAvailable) {
    try {
      return await generateRawPreviewVariant(env, message, task, originalContentType);
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      errors.push(err);
      console.warn("raw preview fallback failed", { error: err.message });
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

type RawPreviewSize = "thumb" | "feed" | "full";

const RAW_PREVIEW_SIZE_BY_TASK: Record<
  Extract<ProcessingTask, { kind: "image.thumbnail" | "image.preview" }>["kind"],
  RawPreviewSize
> = {
  "image.thumbnail": "thumb",
  "image.preview": "feed",
};

async function generateRawPreviewVariant(
  env: Env,
  message: ProcessingTaskMessage,
  task: Extract<ProcessingTask, { kind: "image.thumbnail" | "image.preview" }>,
  originalContentType: string | null,
): Promise<DerivedAssetRecord> {
  const baseUrl = env.RAW_PREVIEW_BASE_URL?.trim();
  if (!baseUrl) {
    throw new Error("RAW_PREVIEW_BASE_URL not configured");
  }

  const size = RAW_PREVIEW_SIZE_BY_TASK[task.kind] ?? "feed";
  let requestUrl: string;
  try {
    const url = new URL(baseUrl);
    url.searchParams.set("key", message.key);
    url.searchParams.set("size", size);
    requestUrl = url.toString();
  } catch (error) {
    throw new Error(
      `Invalid RAW_PREVIEW_BASE_URL: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  const response = await fetch(requestUrl, {
    headers: {
      Accept: "image/avif,image/webp,image/jpeg,image/*",
    },
  });
  if (!response.ok) {
    throw new Error(`Raw preview request failed (${response.status})`);
  }

  const buffer = await response.arrayBuffer();
  const derivedKey = `${stripExtension(message.key)}__${task.kind.replace(".", "_")}_${task.width}.jpg`;

  await env.R2_BUCKET.put(derivedKey, buffer, {
    httpMetadata: { contentType: "image/jpeg" },
  });

  return {
    type: task.kind,
    key: derivedKey,
    url: buildPublicUrl(env, derivedKey),
    metadata: {
      width: task.width,
      height: task.height ?? null,
      format: "jpeg",
      content_type: "image/jpeg",
      source_content_type: originalContentType ?? null,
      raw_preview_size: size,
      note: "Generated via raw-preview fallback",
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

function isRawLikeSource(contentType: string | null, key: string): boolean {
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

function shouldPreferJpeg(contentType: string | null, key: string): boolean {
  return isRawLikeSource(contentType, key);
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
  stub: DurableObjectStub,
): Promise<DerivedAssetRecord> {
  const state = await getCoordinatorState(stub);
  const existingDerived =
    state?.derived?.find((entry) => entry.type === "video.transcode") ?? null;
  if (existingDerived) {
    const provider =
      existingDerived.metadata && typeof existingDerived.metadata === "object"
        ? ((existingDerived.metadata as { provider?: unknown }).provider as string | undefined)
        : undefined;
    if (provider === "mux") {
      return existingDerived;
    }
  }

  const muxCredentials = readMuxCredentials(env);
  if (!muxCredentials) {
    return legacyProcessVideoTranscode(env, message);
  }

  try {
    const object = await env.R2_BUCKET.get(message.key);
    if (!object) {
      throw new Error("Source video not found in R2");
    }

    const directUpload = await createMuxDirectUpload(env, muxCredentials, message);
    const contentType =
      normalizeContentType(message.contentType) ??
      object.httpMetadata?.contentType ??
      guessMimeFromKey(message.key) ??
      "application/octet-stream";

    await uploadObjectToMux(directUpload.url, object, contentType);
    const assetId = await waitForMuxUploadAssetId(muxCredentials, directUpload.id);
    const asset = await waitForMuxAssetReady(muxCredentials, assetId);
    const derived = buildMuxDerivedAsset(env, message, asset);
    return derived;
  } catch (error) {
    console.warn("mux transcode job failed, using passthrough video", error);
    return legacyProcessVideoTranscode(env, message);
  }
}

type MuxCredentials = { tokenId: string; tokenSecret: string };

type MuxPlaybackId = {
  id: string;
  policy: string;
};

type MuxAsset = {
  id: string;
  status: string;
  playback_ids?: MuxPlaybackId[];
  mp4_support?: "none" | "standard" | "capped-1080p";
  duration?: number;
  aspect_ratio?: string | null;
  max_stored_resolution?: string | null;
  max_stored_frame_rate?: number | null;
  created_at?: string | null;
  updated_at?: string | null;
  passthrough?: string | null;
};

type MuxDirectUpload = {
  id: string;
  status: string;
  url: string;
  asset_id?: string | null;
};

type MuxUploadResponse = { data: MuxDirectUpload };
type MuxAssetResponse = { data: MuxAsset };

const MUX_API_BASE_URL = "https://api.mux.com";
const DEFAULT_MUX_POLL_INTERVAL_MS = 3_000;
const DEFAULT_MUX_POLL_TIMEOUT_MS = 5 * 60 * 1_000;

function readMuxCredentials(env: Env): MuxCredentials | null {
  const tokenId = (env.MUX_TOKEN_ID ?? "").trim();
  const tokenSecret = (env.MUX_TOKEN_SECRET ?? "").trim();
  if (!tokenId || !tokenSecret) {
    return null;
  }
  return { tokenId, tokenSecret };
}

async function legacyProcessVideoTranscode(
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
      contentType: normalizeContentType(message.contentType) ?? "video/mp4",
    },
  });
  return {
    type: "video.transcode",
    key: derivedKey,
    url: buildPublicUrl(env, derivedKey),
    metadata: {
      provider: "passthrough",
      note: "Video copied without transcoding. Configure Mux credentials to enable adaptive playback.",
      mime_type: normalizeContentType(message.contentType) ?? "video/mp4",
    },
  };
}

async function createMuxDirectUpload(
  env: Env,
  credentials: MuxCredentials,
  message: ProcessingTaskMessage,
): Promise<MuxDirectUpload> {
  const response = await muxApiRequest<MuxUploadResponse>(credentials, "/video/v1/uploads", {
    method: "POST",
    body: JSON.stringify({
      new_asset_settings: {
        playback_policy: ["public"],
        mp4_support: "capped-1080p",
        passthrough: message.uploadId ?? message.key ?? null,
      },
      test: (env.MUX_ENVIRONMENT ?? "").toLowerCase() === "test",
    }),
  });
  return response.data;
}

async function uploadObjectToMux(
  url: string,
  object: R2ObjectBody,
  contentType: string,
): Promise<void> {
  const headers: Record<string, string> = {
    "Content-Type": contentType,
  };
  if (typeof object.size === "number") {
    headers["Content-Length"] = String(object.size);
  }
  const stream = object.body ? ((object.body as unknown) as BodyInit) : null;
  const response = await fetch(url, {
    method: "PUT",
    headers,
    body: stream ?? null,
  });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(
      `Mux upload failed (${response.status})${text ? `: ${text.slice(0, 200)}` : ""}`,
    );
  }
}

async function waitForMuxUploadAssetId(
  credentials: MuxCredentials,
  uploadId: string,
  timeoutMs = DEFAULT_MUX_POLL_TIMEOUT_MS,
  intervalMs = DEFAULT_MUX_POLL_INTERVAL_MS,
): Promise<string> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const upload = await fetchMuxUpload(credentials, uploadId);
    if (upload.asset_id && upload.asset_id.trim().length) {
      return upload.asset_id;
    }
    if (upload.status === "errored") {
      throw new Error(`Mux direct upload ${uploadId} reported an error`);
    }
    await sleep(intervalMs);
  }
  throw new Error(`Mux direct upload ${uploadId} timed out waiting for asset creation`);
}

async function waitForMuxAssetReady(
  credentials: MuxCredentials,
  assetId: string,
  timeoutMs = DEFAULT_MUX_POLL_TIMEOUT_MS,
  intervalMs = DEFAULT_MUX_POLL_INTERVAL_MS,
): Promise<MuxAsset> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const asset = await fetchMuxAsset(credentials, assetId);
    if (asset.status === "ready") {
      return asset;
    }
    if (asset.status === "errored") {
      throw new Error(`Mux asset ${assetId} failed during processing`);
    }
    await sleep(intervalMs);
  }
  throw new Error(`Mux asset ${assetId} was not ready before timeout`);
}

async function fetchMuxUpload(
  credentials: MuxCredentials,
  uploadId: string,
): Promise<MuxDirectUpload> {
  const response = await muxApiRequest<MuxUploadResponse>(
    credentials,
    `/video/v1/uploads/${encodeURIComponent(uploadId)}`,
  );
  return response.data;
}

async function fetchMuxAsset(
  credentials: MuxCredentials,
  assetId: string,
): Promise<MuxAsset> {
  const response = await muxApiRequest<MuxAssetResponse>(
    credentials,
    `/video/v1/assets/${encodeURIComponent(assetId)}`,
  );
  return response.data;
}

async function muxApiRequest<T>(
  credentials: MuxCredentials,
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const headers = new Headers(init.headers ?? {});
  headers.set("Authorization", buildMuxAuthHeader(credentials));
  if (init.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  const response = await fetch(`${MUX_API_BASE_URL}${path}`, {
    ...init,
    headers,
  });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(
      `Mux request to ${path} failed (${response.status})${
        text ? `: ${text.slice(0, 200)}` : ""
      }`,
    );
  }
  if (response.status === 204) {
    return undefined as T;
  }
  return (await response.json()) as T;
}

function buildMuxAuthHeader(credentials: MuxCredentials): string {
  return `Basic ${btoa(`${credentials.tokenId}:${credentials.tokenSecret}`)}`;
}

function buildMuxDerivedAsset(
  env: Env,
  message: ProcessingTaskMessage,
  asset: MuxAsset,
): DerivedAssetRecord {
  const playback = asset.playback_ids?.find((entry) => typeof entry?.id === "string");
  if (!playback) {
    throw new Error(`Mux asset ${asset.id} missing playback ID`);
  }
  const base = buildMuxPlaybackBase(env, playback.id);
  const hlsUrl = `${base}.m3u8`;
  const mp4Url =
    asset.mp4_support && asset.mp4_support !== "none" ? `${base}/medium.mp4` : null;
  const posterUrl = buildMuxPosterUrl(base);
  const mimeType = mp4Url ? "video/mp4" : "application/x-mpegURL";
  return {
    type: "video.transcode",
    key: `mux:${asset.id}`,
    url: mp4Url ?? hlsUrl,
    metadata: {
      provider: "mux",
      asset_id: asset.id,
      playback_id: playback.id,
      playback_ids: asset.playback_ids ?? null,
      status: asset.status ?? null,
      duration: typeof asset.duration === "number" ? asset.duration : null,
      aspect_ratio: asset.aspect_ratio ?? null,
      mp4_support: asset.mp4_support ?? null,
      mp4_url: mp4Url,
      hls_url: hlsUrl,
      poster_url: posterUrl,
      created_at: asset.created_at ?? null,
      updated_at: asset.updated_at ?? null,
      passthrough: asset.passthrough ?? null,
      source_key: message.key,
      source_bucket: message.bucket,
      mime_type: mimeType,
    },
  };
}

function buildMuxPlaybackBase(env: Env, playbackId: string): string {
  const configured = (env.MUX_PLAYBACK_DOMAIN ?? "").trim();
  if (!configured) {
    return `https://stream.mux.com/${playbackId}`;
  }
  const normalized = configured.startsWith("http://") || configured.startsWith("https://")
    ? configured
    : `https://${configured}`;
  return `${normalized.replace(/\/$/, "")}/${playbackId}`;
}

function buildMuxPosterUrl(basePlaybackUrl: string): string {
  return `${basePlaybackUrl}/thumbnail.jpg?time=1&fit_mode=preserve&width=1280`;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
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
  let payload: SafetyPayload;
  try {
    payload = await classifyUploadSafety(env, message);
  } catch (error) {
    payload = {
      status: "error",
      decision: "review",
      kind: "unknown",
      model: null,
      labels: {},
      scanned_at: new Date().toISOString(),
      source: "openai",
      reason: error instanceof Error ? error.message : String(error),
      notes: ["Safety scan failed; defaulting to review"],
    };
  }
  await env.R2_BUCKET.put(derivedKey, JSON.stringify(payload, null, SAFETY_JSON_INDENT), {
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

function guessExtensionFromKey(key: string): string | null {
  const lastDot = key.lastIndexOf(".");
  if (lastDot === -1) return null;
  const ext = key.slice(lastDot + 1).toLowerCase();
  return ext || null;
}

function isExecutableLike(key: string, contentType: string | null): boolean {
  const ext = guessExtensionFromKey(key);
  if (ext && EXECUTABLE_EXTENSIONS.has(ext)) return true;
  const type = (contentType ?? "").toLowerCase();
  if (!type) return false;
  return EXECUTABLE_MIME_HINTS.some((hint) => type.includes(hint));
}

function isArchiveLike(key: string, contentType: string | null): boolean {
  const ext = guessExtensionFromKey(key);
  if (ext && ARCHIVE_EXTENSIONS.has(ext)) return true;
  const type = (contentType ?? "").toLowerCase();
  if (!type) return false;
  return ARCHIVE_MIME_HINTS.some((hint) => type.includes(hint));
}

export default worker;
