"use client";

import * as React from "react";
import { safeRandomUUID } from "@/lib/random";

import { uploadFileDirect } from "@/lib/uploads/direct-client";

const DEFAULT_MAX_SIZE = 50 * 1024 * 1024 * 1024; // 50 GB
const BASE64_FALLBACK_MAX_SIZE = 10 * 1024 * 1024; // 10 MB

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
};

type DirectUploadResult = Awaited<ReturnType<typeof uploadFileDirect>>;

type RemoteAttachmentOptions = {
  url: string;
  name?: string | null;
  mimeType?: string | null;
  thumbUrl?: string | null;
  size?: number | null;
};

type AttachmentMetadataInput =
  | Record<string, unknown>
  | ((
      context: { file: File; mimeType: string; uploadKind: string },
    ) => Record<string, unknown> | null | undefined);

type UseAttachmentUploadOptions = {
  metadata?: AttachmentMetadataInput;
};

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

async function readFileAsDataUrl(file: File): Promise<string> {
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

async function captureVideoThumbnail(file: File, atSeconds = 0.3): Promise<string> {
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

function formatFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = bytes;
  let index = 0;
  while (value >= 1024 && index < units.length - 1) {
    value /= 1024;
    index += 1;
  }
  const rounded = index === 0 ? value : Math.round(value * 10) / 10;
  return `${rounded.toLocaleString()} ${units[index]}`;
}

function validateAttachmentFile(file: File, mimeType: string, maxSizeBytes: number): string | null {
  const normalizedMime = (mimeType || "application/octet-stream").toLowerCase();
  const [rawTopLevel] = normalizedMime.split("/", 1);
  const topLevel = rawTopLevel || "application";

  if (BLOCKED_MIME_TYPES.has(normalizedMime)) {
    return "Executable files are not supported.";
  }

  const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
  if (extension && BLOCKED_EXTENSIONS.has(extension)) {
    return "Executable files are not supported.";
  }

  if (topLevel && !ALLOWED_TOP_LEVEL_TYPES.has(topLevel)) {
    return "This file type isn't supported yet.";
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
  };
}

function useAttachmentInput(): {
  fileInputRef: React.MutableRefObject<HTMLInputElement | null>;
  handleAttachClick: () => void;
} {
  const fileInputRef = React.useRef<HTMLInputElement | null>(null);

  const handleAttachClick = React.useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  return { fileInputRef, handleAttachClick };
}

function useAttachmentState(fileInputRef: React.MutableRefObject<HTMLInputElement | null>): {
  attachment: LocalAttachment | null;
  setAttachment: React.Dispatch<React.SetStateAction<LocalAttachment | null>>;
  readyAttachment: LocalAttachment | null;
  uploading: boolean;
  clearAttachment: () => void;
} {
  const [attachment, setAttachment] = React.useState<LocalAttachment | null>(null);

  const readyAttachment = React.useMemo(
    () => (attachment && attachment.status === "ready" && attachment.url ? attachment : null),
    [attachment],
  );
  const uploading = attachment?.status === "uploading";

  const clearAttachment = React.useCallback(() => {
    setAttachment(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }, [fileInputRef]);

  return { attachment, setAttachment, readyAttachment, uploading, clearAttachment };
}

function useAttachmentProcessor(
  maxSizeBytes: number,
  setAttachment: React.Dispatch<React.SetStateAction<LocalAttachment | null>>,
  options: UseAttachmentUploadOptions | undefined,
  uploadAbortRef: React.MutableRefObject<AbortController | null>,
): (file: File) => Promise<void> {
  return React.useCallback(
    async (file: File) => {
      const id = safeRandomUUID();
      const mimeType = file.type || "application/octet-stream";

      const validationError = validateAttachmentFile(file, mimeType, maxSizeBytes);
      if (validationError) {
        setAttachment(createErrorAttachment(id, file, mimeType, validationError));
        return;
      }

      uploadAbortRef.current?.abort();
      const controller = new AbortController();
      uploadAbortRef.current = controller;

      setAttachment({
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
      });

      try {
        const result = await uploadWithFallback(file, mimeType, id, setAttachment, options, controller.signal);
        const thumbUrl = await maybeCaptureAndUploadThumb(file, mimeType, controller.signal);

        setAttachment((prev) =>
          prev && prev.id === id
            ? {
                ...prev,
                status: "ready",
                url: result.url,
                thumbUrl: thumbUrl ?? prev.thumbUrl ?? null,
                progress: 1,
                key: result.key,
                sessionId: result.sessionId,
                originalFile: null,
              }
            : prev,
        );
        if (uploadAbortRef.current === controller) {
          uploadAbortRef.current = null;
        }
      } catch (error) {
        if ((error as DOMException)?.name === "AbortError") {
          if (uploadAbortRef.current === controller) {
            uploadAbortRef.current = null;
          }
          return;
        }
        console.error("Attachment upload failed", error);
        const message = error instanceof Error ? error.message : "Upload failed";
        setAttachment((prev) =>
          prev && prev.id === id
            ? { ...prev, status: "error", url: null, error: message, progress: 0 }
            : prev,
        );
        if (uploadAbortRef.current === controller) {
          uploadAbortRef.current = null;
        }
      }
    },
    [maxSizeBytes, options, setAttachment, uploadAbortRef],
  );
}

function updateUploadProgress(
  setAttachment: React.Dispatch<React.SetStateAction<LocalAttachment | null>>,
  id: string,
  uploadedBytes: number,
  totalBytes: number,
) {
  setAttachment((prev) =>
    prev && prev.id === id
      ? { ...prev, progress: totalBytes ? uploadedBytes / totalBytes : 0 }
      : prev,
  );
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

async function uploadWithFallback(
  file: File,
  mimeType: string,
  id: string,
  setAttachment: React.Dispatch<React.SetStateAction<LocalAttachment | null>>,
  options: UseAttachmentUploadOptions | undefined,
  signal?: AbortSignal,
): Promise<DirectUploadResult> {
  let directError: Error | null = null;
  let result: DirectUploadResult | null = null;
  const uploadKind = resolveUploadKind(mimeType);
  const canUseBase64 = shouldUseBase64Fallback(file, mimeType);
  const fileExtension = getFileExtension(file.name);
  const metadata: Record<string, unknown> = {
    original_filename: file.name,
    mime_type: mimeType,
    file_size: file.size,
    source: "attachment",
    mime_primary: uploadKind,
  };
  if (fileExtension) {
    metadata.file_extension = fileExtension;
  }
  mergeAttachmentMetadata(metadata, options?.metadata, { file, mimeType, uploadKind });

  try {
    result = await uploadFileDirect(file, {
      kind: uploadKind,
      metadata,
      signal,
      onProgress: ({ uploadedBytes, totalBytes }) => {
        updateUploadProgress(setAttachment, id, uploadedBytes, totalBytes);
      },
    });
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
): Promise<DirectUploadResult> {
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
  const fallbackResponse = await fetch("/api/upload_base64", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      filename: file.name,
      content_type: mimeType,
      data_base64: base64,
    }),
    signal,
  });
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

    const thumbRes = await fetch("/api/upload_base64", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        filename: `thumb-${file.name.replace(/\.[^.]+$/, "")}.jpg`,
        content_type: "image/jpeg",
        data_base64: thumbBase64,
      }),
      signal,
    });

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

export function useAttachmentUpload(
  maxSizeBytes = DEFAULT_MAX_SIZE,
  options: UseAttachmentUploadOptions = {},
) {
  const { fileInputRef, handleAttachClick } = useAttachmentInput();
  const {
    attachment,
    setAttachment,
    readyAttachment,
    uploading,
    clearAttachment: resetAttachment,
  } = useAttachmentState(fileInputRef);
  const uploadAbortRef = React.useRef<AbortController | null>(null);
  const remoteTimersRef = React.useRef<number[]>([]);
  const cancelRemoteTimers = React.useCallback(() => {
    if (typeof window === "undefined") {
      remoteTimersRef.current = [];
      return;
    }
    for (const timerId of remoteTimersRef.current) {
      window.clearTimeout(timerId);
    }
    remoteTimersRef.current = [];
  }, []);
  const clearAttachment = React.useCallback(() => {
    uploadAbortRef.current?.abort();
    uploadAbortRef.current = null;
    cancelRemoteTimers();
    resetAttachment();
  }, [cancelRemoteTimers, resetAttachment]);
  const processFile = useAttachmentProcessor(maxSizeBytes, setAttachment, options, uploadAbortRef);

  const handleAttachmentSelect = React.useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const files = event.target.files ? Array.from(event.target.files) : [];
      if (event.target.value) event.target.value = "";
      if (!files.length) return;

      for (const file of files) {
        await processFile(file);
      }
    },
    [processFile],
  );

  const handleAttachmentFile = React.useCallback(
    async (file: File | null | undefined) => {
      if (!file) return;
      await processFile(file);
    },
    [processFile],
  );

  const attachRemoteAttachment = React.useCallback(
    (options: RemoteAttachmentOptions) => {
      const rawUrl = options.url ?? "";
      const trimmedUrl = rawUrl.trim();
      if (!trimmedUrl.length) return;

      const generatedId = safeRandomUUID();
      const providedName = options.name ?? "";
      const displayName = providedName.trim().length ? providedName.trim() : "Memory asset";
      const fallbackMime = options.mimeType?.trim().length ? options.mimeType.trim() : undefined;
      const resolvedMime = inferMimeFromUrl(trimmedUrl, fallbackMime ?? "*/*");

      cancelRemoteTimers();

      setAttachment({
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
      });

      if (typeof window === "undefined") {
        setAttachment((previous) =>
          previous && previous.id === generatedId
            ? {
                ...previous,
                status: "ready",
                url: trimmedUrl,
                progress: 1,
                mimeType: resolvedMime,
              }
            : previous,
        );
        return;
      }

      const schedule = (handler: () => void, delay: number) => {
        const timerId = window.setTimeout(handler, delay);
        remoteTimersRef.current.push(timerId);
      };

      schedule(() => {
        setAttachment((previous) =>
          previous && previous.id === generatedId
            ? { ...previous, progress: Math.max(previous.progress, 0.42) }
            : previous,
        );
      }, 220);

      schedule(() => {
        setAttachment((previous) =>
          previous && previous.id === generatedId
            ? { ...previous, progress: Math.max(previous.progress, 0.76) }
            : previous,
        );
      }, 420);

      schedule(() => {
        setAttachment((previous) =>
          previous && previous.id === generatedId
            ? {
                ...previous,
                status: "ready",
                url: trimmedUrl,
                progress: 1,
                mimeType: resolvedMime,
                thumbUrl: options.thumbUrl ?? previous.thumbUrl ?? null,
                size:
                  typeof options.size === "number" && options.size > 0
                    ? options.size
                    : previous.size,
              }
            : previous,
        );
        cancelRemoteTimers();
      }, 720);
    },
    [cancelRemoteTimers, setAttachment],
  );

  return {
    fileInputRef,
    attachment,
    readyAttachment,
    uploading,
    clearAttachment,
    handleAttachClick,
    handleAttachmentSelect,
    handleAttachmentFile,
    attachRemoteAttachment,
  } as const;
}
