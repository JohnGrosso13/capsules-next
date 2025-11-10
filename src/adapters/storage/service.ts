"use server";

import type {
  StorageMetadataValue,
  StorageMultipartAbortParams,
  StorageMultipartCompleteParams,
  StorageMultipartInitParams,
  StorageMultipartInitResult,
  StorageProvider,
  StorageUploadBufferParams,
  StorageUploadBufferResult,
} from "@/ports/storage";

export type StorageServiceOperation =
  | "multipart_init"
  | "multipart_complete"
  | "multipart_abort"
  | "upload_buffer"
  | "public_url"
  | "upload_prefix";

export type StorageTelemetryEvent = {
  operation: StorageServiceOperation;
  status: "success" | "error";
  durationMs: number;
  metadata?: Record<string, unknown>;
  error?: Error;
};

export interface StorageTelemetry {
  record(event: StorageTelemetryEvent): void;
}

export class NoopStorageTelemetry implements StorageTelemetry {
  record(): void {
    // intentionally empty
  }
}

export class ConsoleStorageTelemetry implements StorageTelemetry {
  constructor(private readonly label: string = "storage") {}

  record(event: StorageTelemetryEvent): void {
    const { operation, status, durationMs, metadata, error } = event;
    const payload = {
      label: this.label,
      op: operation,
      status,
      durationMs,
      ...(metadata ?? {}),
      ...(error ? { error: error.message } : {}),
    };
    if (status === "error") {
      console.error("[StorageService]", payload);
    } else {
      console.debug("[StorageService]", payload);
    }
  }
}

export type StorageServiceErrorCode =
  | "PROVIDER_UNAVAILABLE"
  | "MULTIPART_INIT_FAILED"
  | "MULTIPART_COMPLETE_FAILED"
  | "MULTIPART_ABORT_FAILED"
  | "UPLOAD_FAILED"
  | "PUBLIC_URL_UNAVAILABLE";

export class StorageServiceError extends Error {
  readonly code: StorageServiceErrorCode;
  override readonly name = "StorageServiceError";
  override readonly cause?: unknown;

  constructor(code: StorageServiceErrorCode, message: string, cause?: unknown) {
    super(message);
    this.code = code;
    this.cause = cause;
  }
}

type StorageServiceOptions = {
  provider: StorageProvider | null;
  telemetry?: StorageTelemetry | null;
  now?: () => number;
};

export class StorageService {
  private provider: StorageProvider | null;
  private telemetry: StorageTelemetry;
  private readonly now: () => number;

  constructor(options: StorageServiceOptions) {
    this.provider = options.provider ?? null;
    this.telemetry = options.telemetry ?? new NoopStorageTelemetry();
    this.now = options.now ?? Date.now;
  }

  withProvider(provider: StorageProvider): StorageService {
    this.provider = provider;
    return this;
  }

  getUploadPrefix(): string {
    const start = this.now();
    try {
      const prefix = this.ensureProvider().getUploadPrefix();
      this.record("upload_prefix", "success", start, { prefix });
      return prefix;
    } catch (error) {
      this.record("upload_prefix", "error", start, undefined, error);
      throw new StorageServiceError(
        "PROVIDER_UNAVAILABLE",
        "Storage provider does not expose an upload prefix.",
        error,
      );
    }
  }

  async createMultipartUpload(
    params: StorageMultipartInitParams,
  ): Promise<StorageMultipartInitResult> {
    const start = this.now();
    try {
      const result = await this.ensureProvider().createMultipartUpload(params);
      this.record("multipart_init", "success", start, {
        key: result.key,
        partSize: result.partSize,
        vendor: this.provider?.name,
      });
      return result;
    } catch (error) {
      this.record("multipart_init", "error", start, { ownerId: params.ownerId }, error);
      throw new StorageServiceError("MULTIPART_INIT_FAILED", "Failed to initialize upload.", error);
    }
  }

  async completeMultipartUpload(params: StorageMultipartCompleteParams): Promise<void> {
    const start = this.now();
    try {
      await this.ensureProvider().completeMultipartUpload(params);
      this.record("multipart_complete", "success", start, {
        key: params.key,
        parts: params.parts.length,
      });
    } catch (error) {
      this.record("multipart_complete", "error", start, { key: params.key }, error);
      throw new StorageServiceError("MULTIPART_COMPLETE_FAILED", "Failed to finalize upload.", error);
    }
  }

  async abortMultipartUpload(params: StorageMultipartAbortParams): Promise<void> {
    const start = this.now();
    try {
      await this.ensureProvider().abortMultipartUpload(params);
      this.record("multipart_abort", "success", start, { key: params.key });
    } catch (error) {
      this.record("multipart_abort", "error", start, { key: params.key }, error);
      throw new StorageServiceError("MULTIPART_ABORT_FAILED", "Failed to abort upload.", error);
    }
  }

  getPublicUrl(key: string): string {
    const start = this.now();
    try {
      const url = this.ensureProvider().getPublicUrl(key);
      this.record("public_url", "success", start, { key });
      return url;
    } catch (error) {
      this.record("public_url", "error", start, { key }, error);
      throw new StorageServiceError("PUBLIC_URL_UNAVAILABLE", "Failed to create public URL.", error);
    }
  }

  async uploadBuffer(params: StorageUploadBufferParams): Promise<StorageUploadBufferResult> {
    const start = this.now();
    try {
      const result = await this.ensureProvider().uploadBuffer(params);
      this.record("upload_buffer", "success", start, {
        key: result.key,
        size: this.estimateBodySize(params.body),
        mimeType: params.contentType,
      });
      return result;
    } catch (error) {
      this.record(
        "upload_buffer",
        "error",
        start,
        {
          key: params.key,
          mimeType: params.contentType,
        },
        error,
      );
      throw new StorageServiceError("UPLOAD_FAILED", "Failed to upload buffer.", error);
    }
  }

  private ensureProvider(): StorageProvider {
    if (!this.provider) {
      throw new StorageServiceError(
        "PROVIDER_UNAVAILABLE",
        "Storage provider has not been configured.",
      );
    }
    return this.provider;
  }

  private record(
    operation: StorageServiceOperation,
    status: "success" | "error",
    start: number,
    metadata?: Record<string, unknown>,
    error?: unknown,
  ): void {
    const durationMs = Math.max(0, this.now() - start);
    const normalizedError =
      error instanceof Error ? error : error ? new Error(String(error)) : undefined;
    const event: StorageTelemetryEvent = {
      operation,
      status,
      durationMs,
      ...(metadata ? { metadata } : {}),
      ...(normalizedError ? { error: normalizedError } : {}),
    };
    this.telemetry.record(event);
  }

  private estimateBodySize(body: StorageUploadBufferParams["body"]): number | null {
    if (body instanceof ArrayBuffer) return body.byteLength;
    if (ArrayBuffer.isView(body)) return body.byteLength;
    return null;
  }
}

export function mergeStorageMetadata(
  base: Record<string, StorageMetadataValue> | undefined,
  extra: Record<string, StorageMetadataValue | null | undefined>,
): Record<string, StorageMetadataValue> {
  return {
    ...(base ?? {}),
    ...Object.fromEntries(
      Object.entries(extra)
        .filter(([, value]) => value !== undefined && value !== null)
        .map(([key, value]) => [key, value as StorageMetadataValue]),
    ),
  };
}
