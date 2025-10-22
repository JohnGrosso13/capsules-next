import "server-only";

import {
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  CreateMultipartUploadCommand,
  GetObjectCommand,
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
  for (const [key, value] of Object.entries(metadata)) {
    if (value === undefined || value === null) continue;
    const normalizedKey = key.toLowerCase();
    entries[normalizedKey] = String(value).slice(0, 1024);
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

  async createMultipartUpload(
    params: StorageMultipartInitParams,
  ): Promise<StorageMultipartInitResult> {
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
