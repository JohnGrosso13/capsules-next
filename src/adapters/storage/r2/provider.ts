import "server-only";

import "@/lib/polyfills/dom-parser";

import {
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  CreateMultipartUploadCommand,
  GetObjectCommand,
  PutBucketCorsCommand,
  PutObjectCommand,
  S3Client,
  UploadPartCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

import { serverEnv } from "@/lib/env/server";
import { generateStorageObjectKey } from "@/lib/storage/keys";
import type {
  StorageMultipartAbortParams,
  StorageMultipartCompleteParams,
  StorageMultipartInitParams,
  StorageMultipartInitResult,
  StorageProvider,
  StorageUploadBufferParams,
  StorageUploadBufferResult,
} from "@/ports/storage";

const MAX_PARTS = 10_000;
const MIN_PART_SIZE_BYTES = 8 * 1024 * 1024; // 8 MB
const MAX_PART_SIZE_BYTES = 5 * 1024 * 1024 * 1024; // 5 GB

function sanitizePrefix(value: string): string {
  const trimmed = value.replace(/\/$/, "").trim();
  return trimmed.length ? trimmed : "uploads";
}

function sanitizeMetadata(
  metadata: Record<string, unknown> | null | undefined,
): Record<string, string> | undefined {
  if (!metadata) return undefined;
  const entries: Record<string, string> = {};
  const sanitizeKey = (rawKey: string): string | null => {
    const normalized = rawKey
      .toLowerCase()
      .replace(/[^a-z0-9._-]+/g, "_")
      .replace(/^_+|_+$/g, "");
    return normalized.length ? normalized : null;
  };
  const sanitizeValue = (rawValue: unknown): string | null => {
    if (rawValue === undefined || rawValue === null) return null;
    const text = String(rawValue);
    if (!text.length) return null;
    let buffer = "";
    for (const char of text) {
      const code = char.charCodeAt(0);
      if (code <= 31 || code === 127) {
        continue;
      }
      if (code > 126) {
        buffer += encodeURIComponent(char);
      } else {
        buffer += char;
      }
    }
    buffer = buffer.trim();
    if (!buffer.length) return null;
    if (buffer.length > 1024) {
      let truncated = buffer.slice(0, 1024);
      const percentIndex = truncated.lastIndexOf("%");
      if (percentIndex !== -1 && percentIndex > truncated.length - 3) {
        truncated = truncated.slice(0, percentIndex);
      }
      buffer = truncated;
    }
    return buffer.length ? buffer : null;
  };
  for (const [key, value] of Object.entries(metadata)) {
    const normalizedKey = sanitizeKey(key);
    if (!normalizedKey) continue;
    const sanitizedValue = sanitizeValue(value);
    if (sanitizedValue === null) continue;
    entries[normalizedKey] = sanitizedValue;
  }
  return Object.keys(entries).length ? entries : undefined;
}

function resolvePartSize(fileSize: number | null | undefined): number {
  if (!fileSize || fileSize <= 0) {
    return 16 * 1024 * 1024; // default 16 MB
  }
  const raw = Math.ceil(fileSize / MAX_PARTS);
  const bounded = Math.max(raw, MIN_PART_SIZE_BYTES);
  return Math.min(bounded, MAX_PART_SIZE_BYTES);
}

class R2StorageProvider implements StorageProvider {
  readonly name = "r2";

  private client: S3Client | null = null;
  private readonly endpoint: string;
  private readonly bucket: string;
  private readonly uploadPrefix: string;
  private corsConfigured = false;
  private corsPromise: Promise<void> | null = null;

  constructor() {
    this.bucket = serverEnv.R2_BUCKET;
    this.endpoint = `https://${serverEnv.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`;
    this.uploadPrefix = sanitizePrefix(serverEnv.R2_UPLOAD_PREFIX);
  }

  private getClient(): S3Client {
    if (!this.client) {
      this.client = new S3Client({
        region: "auto",
        endpoint: this.endpoint,
        credentials: {
          accessKeyId: serverEnv.R2_ACCESS_KEY_ID,
          secretAccessKey: serverEnv.R2_SECRET_ACCESS_KEY,
        },
      });
    }
    return this.client;
  }

  getUploadPrefix(): string {
    return this.uploadPrefix;
  }

  private async ensureCors(): Promise<void> {
    if (this.corsConfigured) return;
    if (this.corsPromise) {
      try {
        await this.corsPromise;
      } catch {
        // ignore - handled below
      }
      return;
    }

    const resolveOrigin = (candidate: string | null | undefined): string | null => {
      if (!candidate) return null;
      try {
        return new URL(candidate).origin;
      } catch {
        return null;
      }
    };

    const origins = new Set<string>();
    const siteOrigin = resolveOrigin(serverEnv.SITE_URL);
    if (siteOrigin) origins.add(siteOrigin);
    const publicOrigin = resolveOrigin(serverEnv.R2_PUBLIC_BASE_URL);
    if (publicOrigin) origins.add(publicOrigin);

    const extraOriginsRaw =
      process.env.UPLOAD_CORS_ORIGINS || process.env.R2_UPLOAD_CORS_ORIGINS || "";
    extraOriginsRaw
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean)
      .forEach((entry) => {
        const origin = resolveOrigin(entry) ?? entry;
        if (origin) origins.add(origin);
      });

    if (process.env.NODE_ENV !== "production") {
      origins.add("*");
    }

    const hasWildcard = origins.has("*");
    if (hasWildcard) origins.delete("*");
    let allowedOrigins = Array.from(origins).filter((origin) => {
      if (!origin) return false;
      return /^[a-z][a-z0-9+.-]*:\/\//i.test(origin) || origin === "*";
    });
    if (!allowedOrigins.length || hasWildcard) {
      allowedOrigins = ["*"];
    }

    const command = new PutBucketCorsCommand({
      Bucket: this.bucket,
      CORSConfiguration: {
        CORSRules: [
          {
            AllowedOrigins: allowedOrigins,
            AllowedMethods: ["GET", "PUT", "POST"],
            AllowedHeaders: ["*"],
            // Expose ETag so browsers can read it after multipart uploads.
            ExposeHeaders: ["ETag"],
            MaxAgeSeconds: 60 * 60,
          },
        ],
      },
    });

    const client = this.getClient();
    this.corsPromise = client
      .send(command)
      .then(() => {
        this.corsConfigured = true;
      })
      .catch((error) => {
        console.warn("R2 CORS configuration failed", error);
      })
      .finally(() => {
        this.corsPromise = null;
      });

    await this.corsPromise;
  }

  async createMultipartUpload(
    params: StorageMultipartInitParams,
  ): Promise<StorageMultipartInitResult> {
    await this.ensureCors();
    const client = this.getClient();
    const key = generateStorageObjectKey({
      prefix: this.uploadPrefix,
      ownerId: params.ownerId,
      filename: params.filename,
      contentType: params.contentType,
      kind: params.kind ?? null,
    });

    const sanitizedMetadata = sanitizeMetadata(params.metadata);

    const upload = await client.send(
      new CreateMultipartUploadCommand({
        Bucket: this.bucket,
        Key: key,
        ContentType: params.contentType ?? undefined,
        Metadata: sanitizedMetadata,
      }),
    );

    if (!upload.UploadId) {
      throw new Error("Failed to initialize multipart upload");
    }

    const uploadId = upload.UploadId;
    const partSize = resolvePartSize(params.fileSize);
    const effectiveParts =
      params.totalParts && params.totalParts > 0
        ? params.totalParts
        : Math.ceil((params.fileSize ?? partSize) / partSize);
    const count = Math.max(1, Math.min(effectiveParts, MAX_PARTS));
    const expires = new Date(Date.now() + 1000 * 60 * 30);

    const parts = await Promise.all(
      Array.from({ length: count }, async (_, index) => {
        const partNumber = index + 1;
        const command = new UploadPartCommand({
          Bucket: this.bucket,
          Key: key,
          UploadId: uploadId,
          PartNumber: partNumber,
        });
        const url = await getSignedUrl(client, command, { expiresIn: 60 * 30 });
        return { partNumber, url, expiresAt: expires.toISOString() };
      }),
    );

    // Prefer a usable public URL even in local dev. If a placeholder base
    // URL (e.g. *.local.example) is configured, fall back to a proxy or
    // direct R2 URL via getPublicUrl().
    const absoluteUrl = this.getPublicUrl(key);

    return {
      uploadId,
      key,
      bucket: this.bucket,
      partSize,
      parts,
      absoluteUrl,
    };
  }

  async completeMultipartUpload(params: StorageMultipartCompleteParams): Promise<void> {
    if (!params.parts.length) {
      throw new Error("No parts provided for completion");
    }

    const client = this.getClient();
    const sortedParts = [...params.parts].sort((a, b) => a.partNumber - b.partNumber);

    await client.send(
      new CompleteMultipartUploadCommand({
        Bucket: this.bucket,
        Key: params.key,
        UploadId: params.uploadId,
        MultipartUpload: {
          Parts: sortedParts.map((part) => ({
            PartNumber: part.partNumber,
            ETag: part.etag.replace(/"/g, ""),
          })),
        },
      }),
    );
  }

  async abortMultipartUpload(params: StorageMultipartAbortParams): Promise<void> {
    const client = this.getClient();
    await client.send(
      new AbortMultipartUploadCommand({
        Bucket: this.bucket,
        Key: params.key,
        UploadId: params.uploadId,
      }),
    );
  }

  getPublicUrl(key: string): string {
    const normalizedKey = key.replace(/^\/+/, "");
    const base = serverEnv.R2_PUBLIC_BASE_URL;
    let baseHost = "";
    if (base) {
      try {
        baseHost = new URL(base).host.toLowerCase();
      } catch {
        baseHost = "";
      }
    }
    const isPlaceholder = baseHost.endsWith(".local.example");
    const shouldUseProxy = !base || isPlaceholder;
    if (shouldUseProxy) {
      const encodedKey = normalizedKey.split("/").map(encodeURIComponent).join("/");
      return `/api/uploads/r2/object/${encodedKey}`;
    }

    if (base) {
      return `${base.replace(/\/$/, "")}/${normalizedKey}`;
    }

    try {
      const host = new URL(this.endpoint).host;
      return `https://${this.bucket}.${host}/${normalizedKey}`;
    } catch {
      return `${this.endpoint.replace(/\/$/, "")}/${normalizedKey}`;
    }
  }

  async uploadBuffer(params: StorageUploadBufferParams): Promise<StorageUploadBufferResult> {
    const client = this.getClient();
    const metadata = params.metadata ? sanitizeMetadata(params.metadata) : undefined;

    await client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: params.key,
        Body: params.body,
        ContentType: params.contentType,
        Metadata: metadata,
      }),
    );

    return {
      key: params.key,
      url: this.getPublicUrl(params.key),
    };
  }

  async getSignedObjectUrl(key: string, expiresInSeconds = 3600): Promise<string> {
    const client = this.getClient();
    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: key,
    });
    return getSignedUrl(client, command, { expiresIn: expiresInSeconds });
  }
}

let providerInstance: StorageProvider | null = null;

export function getR2StorageProvider(): StorageProvider {
  if (!providerInstance) {
    providerInstance = new R2StorageProvider();
  }
  return providerInstance;
}

export async function getR2SignedObjectUrl(key: string, expiresInSeconds = 3600): Promise<string> {
  const provider = getR2StorageProvider() as R2StorageProvider;
  return provider.getSignedObjectUrl(key, expiresInSeconds);
}
