"use client";

import { getTurnstileToken } from "@/lib/turnstile-client";

export type DirectUploadProgressEvent = {
  uploadedBytes: number;
  totalBytes: number;
  partNumber: number;
  totalParts: number;
  phase?: "uploading" | "finalizing" | "retrying" | "completed";
  attempt?: number;
};

export type DirectUploadResult = {
  url: string;
  key: string;
  sessionId: string | null;
  uploadId: string;
};

type ProgressPayload = DirectUploadProgressEvent;

function emitProgress(
  callback: ((event: DirectUploadProgressEvent) => void) | undefined,
  payload: ProgressPayload,
): void {
  if (!callback) return;
  const event: DirectUploadProgressEvent = {
    uploadedBytes: payload.uploadedBytes,
    totalBytes: payload.totalBytes,
    partNumber: payload.partNumber,
    totalParts: payload.totalParts,
  };
  if (payload.phase) {
    event.phase = payload.phase;
  }
  if (typeof payload.attempt === "number") {
    event.attempt = payload.attempt;
  }
  callback(event);
}

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

type FinalizeUploadParams = {
  sessionId: string | null;
  uploadId: string;
  key: string;
  parts: Array<{ partNumber: number; etag: string }>;
  metadata?: Record<string, unknown> | null;
};

type FinalizeUploadOptions = {
  signal?: AbortSignal;
};

function createChainedAbortController(parent?: AbortSignal): {
  controller: AbortController;
  dispose: () => void;
} {
  const controller = new AbortController();
  if (!parent) {
    return {
      controller,
      dispose: () => {
        // no-op
      },
    };
  }
  if (parent.aborted) {
    controller.abort();
    return {
      controller,
      dispose: () => {
        // no-op
      },
    };
  }
  const abortHandler = () => controller.abort();
  parent.addEventListener("abort", abortHandler, { once: true });
  return {
    controller,
    dispose: () => parent.removeEventListener("abort", abortHandler),
  };
}

function createTimeoutSignal(
  timeoutMs: number,
  parent?: AbortSignal,
): { signal: AbortSignal; dispose: () => void } {
  const { controller, dispose: disposeParent } = createChainedAbortController(parent);
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    return {
      signal: controller.signal,
      dispose: disposeParent,
    };
  }
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  return {
    signal: controller.signal,
    dispose: () => {
      clearTimeout(timeoutId);
      disposeParent();
    },
  };
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  if (!Number.isFinite(ms) || ms <= 0) {
    return Promise.resolve();
  }
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException("Aborted", "AbortError"));
      return;
    }
    const timeoutId = setTimeout(() => {
      cleanup();
      resolve();
    }, ms);
    const cleanup = () => {
      clearTimeout(timeoutId);
      if (signal) {
        signal.removeEventListener("abort", onAbort);
      }
    };
    const onAbort = () => {
      cleanup();
      reject(new DOMException("Aborted", "AbortError"));
    };
    if (signal) {
      signal.addEventListener("abort", onAbort, { once: true });
    }
  });
}

async function finalizeUpload(
  { sessionId, uploadId, key, parts, metadata }: FinalizeUploadParams,
  options: FinalizeUploadOptions = {},
): Promise<DirectUploadResult> {
  const requestInit: RequestInit = {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      sessionId,
      uploadId,
      key,
      parts,
      metadata,
    }),
  };
  if (options.signal) {
    requestInit.signal = options.signal;
  }
  const response = await fetch("/api/uploads/r2/complete", requestInit);
  if (!response.ok) {
    const message = await response.text().catch(() => "");
    throw new Error(message || "Failed to finalize upload");
  }

  const payload = (await response.json()) as {
    sessionId?: string | null;
    key: string;
    url: string;
  };
  return {
    sessionId: payload.sessionId ?? sessionId,
    key: payload.key ?? key,
    url: payload.url,
    uploadId,
  };
}

async function finalizeUploadWithRetry(
  params: FinalizeUploadParams & { totalBytes: number; totalParts: number },
  options: {
    signal?: AbortSignal;
    onProgress?: (event: DirectUploadProgressEvent) => void;
    maxAttempts?: number;
    attemptTimeoutMs?: number;
    retryDelayMs?: number;
  } = {},
): Promise<DirectUploadResult> {
  const {
    signal,
    onProgress,
    maxAttempts = 3,
    attemptTimeoutMs = 45_000,
    retryDelayMs = 1_500,
  } = options;

  let attempt = 0;
  let lastError: unknown = null;

  while (attempt < maxAttempts) {
    if (signal?.aborted) {
      throw new DOMException("Upload aborted", "AbortError");
    }

    attempt += 1;

    emitProgress(onProgress, {
      uploadedBytes: params.totalBytes,
      totalBytes: params.totalBytes,
      partNumber: params.totalParts,
      totalParts: params.totalParts,
      phase: attempt === 1 ? "finalizing" : "retrying",
      attempt,
    });

    const { signal: attemptSignal, dispose } = createTimeoutSignal(attemptTimeoutMs, signal);

    try {
      return await finalizeUpload(params, { signal: attemptSignal });
    } catch (error) {
      lastError = error;

      if (signal?.aborted || attemptSignal.aborted) {
        throw error instanceof Error ? error : new Error("Upload aborted");
      }

      if (attempt >= maxAttempts) {
        break;
      }

      const backoffMs = Math.min(retryDelayMs * attempt, 5_000);
      try {
        await sleep(backoffMs, signal);
      } catch (sleepError) {
        throw sleepError instanceof Error ? sleepError : new Error(String(sleepError));
      }
    } finally {
      dispose();
    }
  }

  if (lastError instanceof Error) {
    throw lastError;
  }
  throw new Error("Failed to finalize upload");
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
    emitProgress(onProgress, {
      uploadedBytes: Math.min(end, totalBytes),
      totalBytes,
      partNumber: part.partNumber,
      totalParts,
      phase: "uploading",
    });
  }

  const finalizeOptions: {
    signal?: AbortSignal;
    onProgress?: (event: DirectUploadProgressEvent) => void;
  } = {};
  if (signal) {
    finalizeOptions.signal = signal;
  }
  if (onProgress) {
    finalizeOptions.onProgress = onProgress;
  }

  const result = await finalizeUploadWithRetry(
    {
      sessionId: session.sessionId,
      uploadId: session.uploadId,
      key: session.key,
      parts: etags,
      metadata,
      totalBytes,
      totalParts,
    },
    finalizeOptions,
  );

  emitProgress(onProgress, {
    uploadedBytes: totalBytes,
    totalBytes,
    partNumber: totalParts,
    totalParts,
    phase: "completed",
  });

  return result;
}
