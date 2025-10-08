"use client";

import { getTurnstileToken } from "@/lib/turnstile-client";

export type DirectUploadProgressEvent = {
  uploadedBytes: number;
  totalBytes: number;
  partNumber: number;
  totalParts: number;
};

export type DirectUploadResult = {
  url: string;
  key: string;
  sessionId: string | null;
  uploadId: string;
};

type CreateUploadResponse = {
  sessionId: string;
  uploadId: string;
  key: string;
  bucket: string;
  partSize: number;
  parts: Array<{
    partNumber: number;
    url: string;
  }>;
};

async function requestUploadSession({
  file,
  token,
  kind,
  metadata,
}: {
  file: File;
  token: string;
  kind?: string;
  metadata?: Record<string, unknown> | null;
}): Promise<CreateUploadResponse> {
  const response = await fetch("/api/uploads/r2/create", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      filename: file.name,
      contentType: file.type || "application/octet-stream",
      contentLength: file.size,
      kind,
      metadata,
      turnstileToken: token,
    }),
  });
  if (!response.ok) {
    const message = await response.text().catch(() => "");
    throw new Error(message || "Failed to create upload session");
  }
  const payload = (await response.json()) as CreateUploadResponse;
  if (!payload?.uploadId || !payload?.parts?.length) {
    throw new Error("Invalid upload session response");
  }
  return payload;
}

async function finalizeUpload({
  sessionId,
  uploadId,
  key,
  parts,
  metadata,
}: {
  sessionId: string | null;
  uploadId: string;
  key: string;
  parts: Array<{ partNumber: number; etag: string }>;
  metadata?: Record<string, unknown> | null;
}): Promise<DirectUploadResult> {
  const response = await fetch("/api/uploads/r2/complete", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      sessionId,
      uploadId,
      key,
      parts,
      metadata,
    }),
  });
  if (!response.ok) {
    const message = await response.text().catch(() => "");
    throw new Error(message || "Failed to finalize upload");
  }

  const payload = (await response.json()) as { sessionId?: string | null; key: string; url: string };
  return {
    sessionId: payload.sessionId ?? sessionId,
    key: payload.key ?? key,
    url: payload.url,
    uploadId,
  };
}

export async function uploadFileDirect(
  file: File,
  {
    kind = "attachment",
    metadata = null,
    signal,
    onProgress,
  }: {
    kind?: string;
    metadata?: Record<string, unknown> | null;
    signal?: AbortSignal;
    onProgress?: (event: DirectUploadProgressEvent) => void;
  } = {},
): Promise<DirectUploadResult> {
  if (!(file instanceof File)) {
    throw new Error("A File object is required");
  }
  const token = await getTurnstileToken("upload");
  const session = await requestUploadSession({ file, token, kind, metadata });

  const etags: Array<{ partNumber: number; etag: string }> = [];
  const totalParts = session.parts.length;
  const totalBytes = file.size;

  for (const part of session.parts) {
    if (signal?.aborted) {
      throw new DOMException("Upload aborted", "AbortError");
    }
    const partSize = session.partSize;
    const start = (part.partNumber - 1) * partSize;
    const end = Math.min(start + partSize, totalBytes);
    const chunk = file.slice(start, end);
    const requestInit: RequestInit = {
      method: "PUT",
      body: chunk,
    };
    if (signal) {
      requestInit.signal = signal;
    }
    const response = await fetch(part.url, requestInit);
    if (!response.ok) {
      const message = await response.text().catch(() => "");
      throw new Error(message || `Failed to upload part ${part.partNumber}`);
    }
    const etag = response.headers.get("etag") || response.headers.get("ETag") || "";
    if (!etag) {
      throw new Error(`Missing ETag for part ${part.partNumber}`);
    }
    etags.push({ partNumber: part.partNumber, etag });
    if (onProgress) {
      onProgress({
        uploadedBytes: Math.min(end, totalBytes),
        totalBytes,
        partNumber: part.partNumber,
        totalParts,
      });
    }
  }

  return finalizeUpload({
    sessionId: session.sessionId,
    uploadId: session.uploadId,
    key: session.key,
    parts: etags,
    metadata,
  });
}
