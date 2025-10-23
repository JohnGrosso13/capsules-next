export type ProcessingTaskKind =
  | "image.thumbnail"
  | "image.preview"
  | "video.transcode"
  | "video.thumbnail"
  | "video.audio"
  | "video.transcript"
  | "document.extract-text"
  | "document.preview"
  | "safety.scan";

export type UploadProcessingPlan = {
  primary: "image" | "video" | "audio" | "text" | "document" | "archive" | "binary" | "unknown";
  extension: string | null;
  textLike: boolean;
  requiresProcessing: boolean;
  tasks: ProcessingTaskKind[];
  reason?: string | null;
};

const TEXT_MIME_PREFIXES = ["text/", "application/json", "application/xml", "application/yaml"];
const DOCUMENT_MIME_HINTS = [
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument",
  "application/vnd.ms-powerpoint",
  "application/vnd.ms-excel",
  "application/vnd.apple.keynote",
  "application/vnd.oasis.opendocument",
];

const TEXT_EXTENSIONS = new Set([
  "txt",
  "md",
  "markdown",
  "csv",
  "tsv",
  "json",
  "yaml",
  "yml",
  "xml",
  "log",
  "ini",
  "env",
]);

const DOCUMENT_EXTENSIONS = new Set([
  "pdf",
  "doc",
  "docx",
  "ppt",
  "pptx",
  "ppsx",
  "xls",
  "xlsx",
  "key",
  "pages",
  "numbers",
  "rtf",
  "odt",
  "odp",
  "ods",
  "odg",
  "rtfd",
]);

const ARCHIVE_EXTENSIONS = new Set([
  "zip",
  "rar",
  "7z",
  "tar",
  "gz",
  "tgz",
  "bz2",
  "xz",
  "lz",
  "zst",
  "cab",
  "iso",
]);

const AUDIO_PREFIX = "audio/";
const VIDEO_PREFIX = "video/";
const IMAGE_PREFIX = "image/";

function coerceString(value: unknown): string | null {
  if (typeof value === "string" && value.trim().length) return value.trim();
  return null;
}

function normalizeContentType(contentType: string | null | undefined): string | null {
  const value = coerceString(contentType);
  return value ? value.toLowerCase() : null;
}

export function guessExtensionFromFilename(filename: string | null | undefined): string | null {
  const value = coerceString(filename);
  if (!value) return null;
  const base = value.split(/[?#]/)[0] ?? value;
  const parts = base.split(".");
  if (parts.length <= 1) return null;
  const ext = parts.pop();
  return ext ? ext.toLowerCase() : null;
}

function primaryFromContentType(contentType: string | null, extension: string | null): UploadProcessingPlan["primary"] {
  if (contentType) {
    if (contentType.startsWith(IMAGE_PREFIX)) return "image";
    if (contentType.startsWith(VIDEO_PREFIX)) return "video";
    if (contentType.startsWith(AUDIO_PREFIX)) return "audio";
    if (TEXT_MIME_PREFIXES.some((prefix) => contentType.startsWith(prefix))) {
      return "text";
    }
    if (DOCUMENT_MIME_HINTS.some((hint) => contentType.includes(hint))) {
      return "document";
    }
    if (contentType.includes("zip") || contentType.includes("compressed")) {
      return "archive";
    }
  }

  if (extension) {
    if (TEXT_EXTENSIONS.has(extension)) return "text";
    if (DOCUMENT_EXTENSIONS.has(extension)) return "document";
    if (ARCHIVE_EXTENSIONS.has(extension)) return "archive";
    if (["mp3", "wav", "aac", "flac", "ogg", "m4a"].includes(extension)) return "audio";
    if (["mp4", "mov", "m4v", "webm", "mkv"].includes(extension)) return "video";
    if (["png", "jpg", "jpeg", "gif", "webp", "avif", "heic", "heif", "bmp", "svg"].includes(extension))
      return "image";
  }

  return "unknown";
}

function isTextLike(primary: UploadProcessingPlan["primary"], contentType: string | null, extension: string | null): boolean {
  if (primary === "text") return true;
  if (primary === "document" && extension && TEXT_EXTENSIONS.has(extension)) return true;
  if (contentType) {
    if (contentType.startsWith("text/")) return true;
    if (contentType.endsWith("json") || contentType.endsWith("csv") || contentType.endsWith("yaml")) return true;
  }
  return false;
}

export function computeProcessingPlan(params: {
  filename?: string | null;
  contentType?: string | null;
}): UploadProcessingPlan {
  const extension = guessExtensionFromFilename(params.filename);
  const normalizedContentType = normalizeContentType(params.contentType);
  const primary = primaryFromContentType(normalizedContentType, extension);
  const textLike = isTextLike(primary, normalizedContentType, extension);

  const tasks: ProcessingTaskKind[] = [];
  let requiresProcessing = false;
  let reason: string | null = null;

  if (primary === "document" || primary === "text") {
    tasks.push("document.extract-text");
    if (!textLike) {
      tasks.push("document.preview");
      reason = "document requires preview generation";
    } else {
      reason = "document text extraction";
    }
    requiresProcessing = true;
    tasks.push("safety.scan");
  }

  if (!requiresProcessing && (primary === "image" || primary === "video" || primary === "audio")) {
    // Leave processing decisions for downstream handlers (existing pipeline).
    tasks.push("safety.scan");
    reason = "baseline safety scan";
    requiresProcessing = false;
  }

  if (!tasks.includes("safety.scan")) {
    tasks.push("safety.scan");
  }

  return {
    primary,
    extension,
    textLike,
    requiresProcessing,
    tasks: Array.from(new Set(tasks)),
    reason,
  };
}

export function deriveUploadMetadata(params: {
  filename?: string | null;
  contentType?: string | null;
  sizeBytes?: number | null;
  stage: "initial" | "uploaded";
  clock?: () => string;
}): { metadata: Record<string, unknown>; plan: UploadProcessingPlan } {
  const clock = params.clock ?? (() => new Date().toISOString());
  const plan = computeProcessingPlan({
    filename: params.filename ?? null,
    contentType: params.contentType ?? null,
  });

  const metadata: Record<string, unknown> = {
    file_original_name: coerceString(params.filename),
    file_extension: plan.extension,
    file_size_bytes:
      typeof params.sizeBytes === "number" && Number.isFinite(params.sizeBytes)
        ? Math.max(0, Math.floor(params.sizeBytes))
        : null,
    mime_type: coerceString(params.contentType)?.toLowerCase() ?? null,
    mime_primary: plan.primary,
    processing: {
      required: plan.requiresProcessing,
      text_like: plan.textLike,
      category: plan.primary,
      tasks: plan.tasks,
      status: params.stage === "initial" ? "pending_upload" : plan.requiresProcessing ? "queued" : "skipped",
      queued_at: params.stage === "uploaded" && plan.requiresProcessing ? clock() : null,
      reason: plan.reason ?? null,
    },
  };

  if (!plan.requiresProcessing && params.stage === "uploaded") {
    const processing = metadata.processing as Record<string, unknown>;
    processing.completed_at = clock();
  }

  return { metadata, plan };
}

export function mergeUploadMetadata(
  base: Record<string, unknown> | null | undefined,
  updates: Record<string, unknown>,
): Record<string, unknown> {
  const target: Record<string, unknown> =
    base && typeof base === "object" && !Array.isArray(base) ? { ...base } : {};

  for (const [key, value] of Object.entries(updates)) {
    if (value === undefined) continue;
    const existing = target[key];
    if (
      value &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      existing &&
      typeof existing === "object" &&
      !Array.isArray(existing)
    ) {
      target[key] = mergeUploadMetadata(existing as Record<string, unknown>, value as Record<string, unknown>);
    } else {
      target[key] = value;
    }
  }
  return target;
}

export function readProcessingMetadata(
  metadata: Record<string, unknown> | null | undefined,
): Record<string, unknown> | null {
  if (!metadata || typeof metadata !== "object") return null;
  const raw = (metadata as { processing?: unknown }).processing;
  if (!raw || typeof raw !== "object") return null;
  return raw as Record<string, unknown>;
}

export function extractProcessingTasks(
  metadata: Record<string, unknown> | null | undefined,
): ProcessingTaskKind[] {
  const processing = readProcessingMetadata(metadata);
  if (!processing) return [];
  const candidate = (processing.tasks ?? null) as unknown;
  if (Array.isArray(candidate)) {
    return candidate
      .map((entry) => (typeof entry === "string" ? entry.trim() : ""))
      .filter((entry): entry is ProcessingTaskKind => Boolean(entry));
  }
  return [];
}

export function resetProcessingForMissingQueue(
  metadata: Record<string, unknown>,
  clock: () => string = () => new Date().toISOString(),
): Record<string, unknown> {
  const processing = readProcessingMetadata(metadata);
  if (!processing) return metadata;
  const updated = mergeUploadMetadata(metadata, {
    processing: {
      status: "skipped",
      queued_at: null,
      completed_at: clock(),
      reason: "processing queue unavailable in this environment",
      required: false,
      tasks: [],
    },
  });
  return updated;
}

export function safeParseMetadata(value: unknown): Record<string, unknown> | null {
  if (!value) return null;
  if (typeof value === "object") return value as Record<string, unknown>;
  if (typeof value === "string") {
    return safeJsonParse(value);
  }
  return null;
}

function safeJsonParse(value: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(value);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
    return null;
  } catch {
    return null;
  }
}
