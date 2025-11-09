import { safeRandomUUID } from "@/lib/random";
import { uploadFileDirect, type DirectUploadProgressEvent } from "@/lib/uploads/direct-client";

export const ATTACHMENT_DEFAULT_MAX_SIZE = 50 * 1024 * 1024 * 1024; // 50 GB
const BASE64_FALLBACK_MAX_SIZE = 10 * 1024 * 1024; // 10 MB

type AttachmentSetter = (
  value:
    | LocalAttachment
    | null
    | ((previous: LocalAttachment | null) => LocalAttachment | null),
) => void;

export type AttachmentRole = "reference" | "output";

export type LocalAttachment = {
  id: string;
  name: string;
  size: number;
  mimeType: string;
  status: "idle" | "uploading" | "ready" | "error";
  url: string | null;
  thumbUrl?: string | null;
  error?: string;
  progress: number;
  key?: string;
  sessionId?: string | null;
  role: AttachmentRole;
  source?: "upload" | "memory" | "user" | "ai";
  originalFile?: File | null;
  phase?: "uploading" | "finalizing" | "completed";
};

export type RemoteAttachmentOptions = {
  url: string;
  name?: string | null;
  mimeType?: string | null;
  thumbUrl?: string | null;
  size?: number | null;
};

export type AttachmentMetadataInput =
  | Record<string, unknown>
  | ((context: { file: File; mimeType: string; uploadKind: string }) => Record<string, unknown> | null | undefined);

export type AttachmentUploaderState = {
  attachment: LocalAttachment | null;
  readyAttachment: LocalAttachment | null;
  uploading: boolean;
};

export type AttachmentUploader = {
  getState(): AttachmentUploaderState;
  subscribe(listener: () => void): () => void;
  clear(): void;
  handleFile(file: File, metadata?: AttachmentMetadataInput): Promise<void>;
  handleFiles(files: File[], metadata?: AttachmentMetadataInput): Promise<void>;
  attachRemoteAttachment(options: RemoteAttachmentOptions): void;
};

const ALLOWED_TOP_LEVEL_TYPES = new Set([
  "image",
  "video",
  "audio",
  "application",
  "text",
  "font",
  "model",
  "multipart",
]);

const BLOCKED_MIME_TYPES = new Set([
  "application/x-msdownload",
  "application/x-msdos-program",
  "application/x-dosexec",
  "application/x-executable",
  "application/x-sh",
  "application/x-bat",
]);

const BLOCKED_EXTENSIONS = new Set([
  "exe",
  "msi",
  "bat",
  "cmd",
  "sh",
  "com",
  "scr",
  "dll",
  "sys",
  "pkg",
]);

export function createAttachmentUploader(options?: { maxSizeBytes?: number }): AttachmentUploader {
  return new AttachmentUploaderImpl(options?.maxSizeBytes ?? ATTACHMENT_DEFAULT_MAX_SIZE);
}

class AttachmentUploaderImpl implements AttachmentUploader {
  private attachment: LocalAttachment | null = null;
  private state: AttachmentUploaderState = { attachment: null, readyAttachment: null, uploading: false };
  private readonly listeners = new Set<() => void>();
  private abortController: AbortController | null = null;
  private remoteTimers: number[] = [];

  constructor(private readonly maxSizeBytes: number) {}

  getState(): AttachmentUploaderState {
    return this.state;
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  clear(): void {
    this.abortController?.abort();
    this.abortController = null;
    this.cancelRemoteTimers();
    this.setAttachment(null);
  }

  async handleFile(file: File, metadata?: AttachmentMetadataInput): Promise<void> {
    const id = safeRandomUUID();
    const mimeType = file.type || "application/octet-stream";
    const validationError = validateAttachmentFile(file, mimeType, this.maxSizeBytes);
    if (validationError) {
      this.setAttachment(createErrorAttachment(id, file, mimeType, validationError));
      return;
    }

    this.abortController?.abort();
    const controller = new AbortController();
    this.abortController = controller;

    this.setAttachment({
      id,
      name: file.name,
      size: file.size,
      mimeType,
      status: "uploading",
      url: null,
      thumbUrl: null,
      progress: 0,
      role: "reference",
      source: "upload",
      originalFile: file,
      phase: "uploading",
    });

    try {
      const result = await uploadWithFallback({
        file,
        mimeType,
        id,
        ...(metadata ? { metadata } : {}),
        signal: controller.signal,
        setAttachment: (value) => this.setAttachment(value),
      });

      if (mimeType.startsWith("video/")) {
        void maybeCaptureAndUploadThumb(file, mimeType, controller.signal)
          .then((thumbUrl) => {
            if (!thumbUrl) return;
            this.setAttachment((previous) =>
              previous && previous.id === id && previous.status === "ready"
                ? { ...previous, thumbUrl: thumbUrl ?? previous.thumbUrl ?? null }
                : previous,
            );
          })
          .catch(() => {
            // Errors are already logged inside maybeCaptureAndUploadThumb.
          });
      }

      this.setAttachment((previous) =>
        previous && previous.id === id
          ? {
              ...previous,
              status: "ready",
              url: result.url,
              progress: 1,
              key: result.key,
              sessionId: result.sessionId,
              thumbUrl: previous.thumbUrl ?? null,
              originalFile: null,
              phase: "completed",
            }
          : previous,
      );

      if (this.abortController === controller) {
        this.abortController = null;
      }
    } catch (error) {
      if ((error as DOMException)?.name === "AbortError") {
        if (this.abortController === controller) {
          this.abortController = null;
        }
        return;
      }
      console.error("Attachment upload failed", error);
      const message = error instanceof Error ? error.message : "Upload failed";
      this.setAttachment((previous) =>
        previous && previous.id === id
          ? {
              ...previous,
              status: "error",
              url: null,
              error: message,
              progress: 0,
              phase: previous.phase === "completed" ? "completed" : "uploading",
            }
          : previous,
      );
      if (this.abortController === controller) {
        this.abortController = null;
      }
    }
  }

  async handleFiles(files: File[], metadata?: AttachmentMetadataInput): Promise<void> {
    for (const file of files) {
      await this.handleFile(file, metadata);
    }
  }

  attachRemoteAttachment(options: RemoteAttachmentOptions): void {
    const rawUrl = options.url ?? "";
    const trimmedUrl = rawUrl.trim();
    if (!trimmedUrl.length) return;

    const generatedId = safeRandomUUID();
    const providedName = options.name ?? "";
    const displayName = providedName.trim().length ? providedName.trim() : "Memory asset";
    const fallbackMime = options.mimeType?.trim().length ? options.mimeType.trim() : undefined;
    const resolvedMime = inferMimeFromUrl(trimmedUrl, fallbackMime ?? "*/*");

    this.cancelRemoteTimers();

    this.setAttachment({
      id: generatedId,
      name: displayName,
      size: typeof options.size === "number" && options.size > 0 ? options.size : 0,
      mimeType: resolvedMime,
      status: "uploading",
      url: null,
      thumbUrl: options.thumbUrl ?? null,
      progress: 0.05,
      role: "reference",
      source: "memory",
      originalFile: null,
      phase: "uploading",
    });

    if (typeof window === "undefined") {
      this.setAttachment((previous) =>
        previous && previous.id === generatedId
          ? {
              ...previous,
              status: "ready",
              url: trimmedUrl,
              progress: 1,
              mimeType: resolvedMime,
              phase: "completed",
            }
          : previous,
      );
      return;
    }

    const schedule = (handler: () => void, delay: number) => {
      const timerId = window.setTimeout(handler, delay);
      this.remoteTimers.push(timerId);
    };

    schedule(() => {
      this.setAttachment((previous) =>
        previous && previous.id === generatedId
          ? {
              ...previous,
              progress: Math.max(previous.progress, 0.42),
              phase: previous.phase === "completed" ? previous.phase : "uploading",
            }
          : previous,
      );
    }, 220);

    schedule(() => {
      this.setAttachment((previous) =>
        previous && previous.id === generatedId
          ? {
              ...previous,
              progress: Math.max(previous.progress, 0.76),
              phase: previous.phase === "completed" ? previous.phase : "uploading",
            }
          : previous,
      );
    }, 420);

    schedule(() => {
      this.setAttachment((previous) =>
        previous && previous.id === generatedId
          ? {
              ...previous,
              status: "ready",
              url: trimmedUrl,
              progress: 1,
              mimeType: resolvedMime,
              thumbUrl: options.thumbUrl ?? previous.thumbUrl ?? null,
              size:
                typeof options.size === "number" && options.size > 0 ? options.size : previous.size,
              phase: "completed",
            }
          : previous,
      );
      this.cancelRemoteTimers();
    }, 720);
  }

  private setAttachment(
    value:
      | LocalAttachment
      | null
      | ((previous: LocalAttachment | null) => LocalAttachment | null),
  ) {
    const nextValue = typeof value === "function" ? value(this.attachment) : value;
    this.attachment = nextValue;
    this.state = {
      attachment: nextValue,
      readyAttachment:
        nextValue && nextValue.status === "ready" && nextValue.url ? nextValue : null,
      uploading: nextValue?.status === "uploading",
    };
    this.emit();
  }

  private emit() {
    for (const listener of this.listeners) {
      listener();
    }
  }

  private cancelRemoteTimers() {
    if (typeof window === "undefined") {
      this.remoteTimers = [];
      return;
    }
    for (const timer of this.remoteTimers) {
      window.clearTimeout(timer);
    }
    this.remoteTimers = [];
  }
}

function inferMimeFromUrl(url: string | null | undefined, fallback = "*/*"): string {
  if (!url) return fallback;
  const normalized = url.split("?")[0]?.toLowerCase() ?? "";
  if (normalized.endsWith(".mp4") || normalized.endsWith(".mov") || normalized.endsWith(".m4v")) {
    return "video/mp4";
  }
  if (normalized.endsWith(".webm")) return "video/webm";
  if (
    normalized.endsWith(".png") ||
    normalized.endsWith(".apng") ||
    normalized.endsWith(".avif") ||
    normalized.endsWith(".bmp") ||
    normalized.endsWith(".gif") ||
    normalized.endsWith(".jpg") ||
    normalized.endsWith(".jpeg") ||
    normalized.endsWith(".jfif") ||
    normalized.endsWith(".pjpeg") ||
    normalized.endsWith(".pjp") ||
    normalized.endsWith(".svg") ||
    normalized.endsWith(".webp")
  ) {
    if (normalized.endsWith(".svg")) return "image/svg+xml";
    if (normalized.endsWith(".gif")) return "image/gif";
    if (normalized.endsWith(".webp")) return "image/webp";
    if (normalized.endsWith(".png")) return "image/png";
    return "image/jpeg";
  }
  if (normalized.endsWith(".pdf")) return "application/pdf";
  if (normalized.endsWith(".doc") || normalized.endsWith(".docx")) {
    return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  }
  if (normalized.endsWith(".ppt") || normalized.endsWith(".pptx") || normalized.endsWith(".ppsx")) {
    return "application/vnd.openxmlformats-officedocument.presentationml.presentation";
  }
  if (normalized.endsWith(".xls") || normalized.endsWith(".xlsx")) {
    return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  }
  if (normalized.endsWith(".csv")) return "text/csv";
  if (normalized.endsWith(".txt")) return "text/plain";
  if (normalized.endsWith(".json")) return "application/json";
  if (normalized.endsWith(".zip")) return "application/zip";
  if (normalized.endsWith(".rar")) return "application/vnd.rar";
  if (normalized.endsWith(".7z")) return "application/x-7z-compressed";
  if (normalized.endsWith(".tar") || normalized.endsWith(".tgz")) return "application/x-tar";
  if (normalized.endsWith(".mp3")) return "audio/mpeg";
  if (normalized.endsWith(".wav")) return "audio/wav";
  if (normalized.endsWith(".aac")) return "audio/aac";
  if (normalized.endsWith(".flac")) return "audio/flac";
  if (normalized.endsWith(".ogg")) return "audio/ogg";
  return fallback;
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Couldn't read that file."));
    reader.onload = () => {
      const result = reader.result;
      if (typeof result === "string") resolve(result);
      else reject(new Error("Unsupported file format."));
    };
    reader.readAsDataURL(file);
  });
}

function captureVideoThumbnail(file: File, atSeconds = 0.3): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    video.preload = "metadata";
    video.src = url;
    video.muted = true;
    (video as HTMLVideoElement & { playsInline?: boolean }).playsInline = true;
    const cleanup = () => URL.revokeObjectURL(url);
    const onError = () => {
      cleanup();
      reject(new Error("Couldn't read video"));
    };
    video.onerror = onError;
    video.onloadeddata = async () => {
      try {
        if (!Number.isFinite(atSeconds) || atSeconds < 0) atSeconds = 0;
        video.currentTime = Math.min(atSeconds, (video.duration || atSeconds) - 0.01);
      } catch {
        // ignore seek errors
      }
    };
    video.onseeked = () => {
      try {
        const canvas = document.createElement("canvas");
        const w = video.videoWidth || 640;
        const h = video.videoHeight || 360;
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        if (!ctx) throw new Error("Canvas not supported");
        ctx.drawImage(video, 0, 0, w, h);
        const dataUrl = canvas.toDataURL("image/jpeg", 0.8);
        cleanup();
        resolve(dataUrl);
      } catch (err) {
        cleanup();
        reject(err instanceof Error ? err : new Error("Thumbnail failed"));
      }
    };
  });
}

function formatFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = bytes;
  let index = 0;
  while (value >= 1024 && index < units.length - 1) {
    value /= 1024;
    index += 1;
  }
  return `${value.toFixed(index > 1 ? 1 : 0)} ${units[index]}`;
}

function validateAttachmentFile(file: File, mimeType: string, maxSizeBytes: number): string | null {
  if (!file) return "No file selected.";
  if (!mimeType) return "Unknown file type.";

  const topLevelType = mimeType.split("/")[0] ?? "";
  if (!ALLOWED_TOP_LEVEL_TYPES.has(topLevelType)) {
    return "This file type is not supported.";
  }

  if (BLOCKED_MIME_TYPES.has(mimeType)) {
    return "This file type is not allowed.";
  }

  const extension = getFileExtension(file.name);
  if (extension && BLOCKED_EXTENSIONS.has(extension)) {
    return "This file type is not allowed.";
  }

  if (file.size <= 0) {
    return "File appears to be empty.";
  }

  if (file.size > maxSizeBytes) {
    return `File is too large (max ${formatFileSize(maxSizeBytes)}).`;
  }

  return null;
}

function createErrorAttachment(
  id: string,
  file: File,
  mimeType: string,
  message: string,
): LocalAttachment {
  return {
    id,
    name: file.name,
    size: file.size,
    mimeType,
    status: "error",
    url: null,
    error: message,
    progress: 0,
    role: "reference",
    source: "upload",
    originalFile: file,
    phase: "uploading",
  };
}

function getFileExtension(name: string): string | null {
  const dotIndex = name.lastIndexOf(".");
  if (dotIndex === -1 || dotIndex === name.length - 1) return null;
  return name.slice(dotIndex + 1).toLowerCase();
}

function resolveUploadKind(mimeType: string): string {
  const normalized = mimeType.toLowerCase();
  if (normalized.startsWith("video/")) return "video";
  if (normalized.startsWith("image/")) return "image";
  if (normalized.startsWith("audio/")) return "audio";
  if (normalized.startsWith("text/")) return "document";
  if (
    normalized === "application/pdf" ||
    normalized.includes("presentation") ||
    normalized.includes("document") ||
    normalized.includes("msword") ||
    normalized.includes("spreadsheet")
  ) {
    return "document";
  }
  if (normalized.startsWith("application/")) return "file";
  return "file";
}

function mergeAttachmentMetadata(
  target: Record<string, unknown>,
  input: AttachmentMetadataInput | undefined,
  context: { file: File; mimeType: string; uploadKind: string },
) {
  if (!input) return;
  const extra =
    typeof input === "function"
      ? input(context) ?? null
      : input && typeof input === "object"
        ? input
        : null;
  if (!extra) return;
  for (const [key, value] of Object.entries(extra)) {
    if (value === undefined) continue;
    target[key] = value;
  }
}

function shouldUseBase64Fallback(file: File, mimeType: string): boolean {
  return mimeType.startsWith("image/") && file.size <= BASE64_FALLBACK_MAX_SIZE;
}

function updateUploadProgress(
  setAttachment: AttachmentSetter,
  id: string,
  uploadedBytes: number,
  totalBytes: number,
  phase?: DirectUploadProgressEvent["phase"],
) {
  setAttachment((previous) =>
    previous && previous.id === id
      ? {
          ...previous,
          progress: (() => {
            const base = totalBytes ? uploadedBytes / totalBytes : 0;
            if (phase === "completed") {
              return 1;
            }
            if (phase === "finalizing" || phase === "retrying") {
              const floor = previous.progress > 0.95 ? previous.progress : 0.95;
              const clamped = Math.max(base, floor);
              return Math.min(clamped, 0.999);
            }
            return Math.max(0, Math.min(1, base));
          })(),
          phase:
            phase === "completed"
              ? "completed"
              : phase === "finalizing" || phase === "retrying"
                ? "finalizing"
                : previous.phase ?? "uploading",
        }
      : previous,
  );
}

async function uploadWithFallback({
  file,
  mimeType,
  id,
  metadata,
  signal,
  setAttachment,
}: {
  file: File;
  mimeType: string;
  id: string;
  metadata?: AttachmentMetadataInput;
  signal?: AbortSignal;
  setAttachment: AttachmentSetter;
}): Promise<Awaited<ReturnType<typeof uploadFileDirect>>> {
  let directError: Error | null = null;
  let result: Awaited<ReturnType<typeof uploadFileDirect>> | null = null;
  const uploadKind = resolveUploadKind(mimeType);
  const canUseBase64 = shouldUseBase64Fallback(file, mimeType);
  const fileExtension = getFileExtension(file.name);
  const mergedMetadata: Record<string, unknown> = {
    original_filename: file.name,
    mime_type: mimeType,
    file_size: file.size,
    source: "attachment",
    mime_primary: uploadKind,
  };
  if (fileExtension) {
    mergedMetadata.file_extension = fileExtension;
  }
  mergeAttachmentMetadata(mergedMetadata, metadata, { file, mimeType, uploadKind });

  try {
    const uploadOptions: Parameters<typeof uploadFileDirect>[1] = {
      kind: uploadKind,
      metadata: mergedMetadata,
      onProgress: ({ uploadedBytes, totalBytes, phase }) => {
        updateUploadProgress(setAttachment, id, uploadedBytes, totalBytes, phase);
      },
    };
    if (signal) {
      uploadOptions.signal = signal;
    }
    result = await uploadFileDirect(file, uploadOptions);
  } catch (error) {
    directError = error instanceof Error ? error : new Error(String(error));
    const message = canUseBase64
      ? "direct upload failed, falling back to base64"
      : "direct upload failed";
    console.warn(message, directError);
  }

  if (signal?.aborted) {
    throw new DOMException("Upload aborted", "AbortError");
  }

  if (!result && canUseBase64) {
    result = await uploadViaBase64(file, mimeType, id, directError, signal);
  }

  if (!result) {
    throw directError ?? new Error("Upload failed");
  }

  return result;
}

async function uploadViaBase64(
  file: File,
  mimeType: string,
  id: string,
  directError: Error | null,
  signal?: AbortSignal,
): Promise<Awaited<ReturnType<typeof uploadFileDirect>>> {
  if (!mimeType.startsWith("image/")) {
    throw directError ?? new Error("This file type requires the direct uploader. Please try again.");
  }
  if (file.size > BASE64_FALLBACK_MAX_SIZE) {
    throw directError ?? new Error("File is too large for fallback upload. Please retry the upload.");
  }
  if (signal?.aborted) {
    throw new DOMException("Upload aborted", "AbortError");
  }
  const dataUrl = await readFileAsDataUrl(file);
  const base64 = dataUrl.split(",").pop() ?? "";
  const fallbackRequest: RequestInit = {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      filename: file.name,
      content_type: mimeType,
      data_base64: base64,
    }),
  };
  if (signal) {
    fallbackRequest.signal = signal;
  }
  const fallbackResponse = await fetch("/api/upload_base64", fallbackRequest);
  if (!fallbackResponse.ok) {
    const msg = await fallbackResponse.text().catch(() => "");
    throw new Error(msg || directError?.message || "Upload failed");
  }
  const fallbackJson = (await fallbackResponse.json()) as {
    url: string;
    key?: string;
  };
  return {
    url: fallbackJson.url,
    key: fallbackJson.key ?? "",
    sessionId: null,
    uploadId: fallbackJson.key ?? `base64-${id}`,
  };
}

async function maybeCaptureAndUploadThumb(
  file: File,
  mimeType: string,
  signal?: AbortSignal,
): Promise<string | null> {
  if (!mimeType.startsWith("video/")) return null;

  try {
    if (signal?.aborted) {
      throw new DOMException("Upload aborted", "AbortError");
    }
    const thumbDataUrl = await captureVideoThumbnail(file, 0.3);
    if (signal?.aborted) {
      throw new DOMException("Upload aborted", "AbortError");
    }
    const thumbBase64 = thumbDataUrl.split(",").pop() ?? "";
    if (!thumbBase64) return thumbDataUrl;

    const thumbRequest: RequestInit = {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        filename: `thumb-${file.name.replace(/\.[^.]+$/, "")}.jpg`,
        content_type: "image/jpeg",
        data_base64: thumbBase64,
      }),
    };
    if (signal) {
      thumbRequest.signal = signal;
    }
    const thumbRes = await fetch("/api/upload_base64", thumbRequest);

    if (thumbRes.ok) {
      const json = (await thumbRes.json()) as { url?: string };
      return json?.url ?? thumbDataUrl;
    }

    return thumbDataUrl;
  } catch (thumbError) {
    console.warn("thumbnail extract failed", thumbError);
    return null;
  }
}
