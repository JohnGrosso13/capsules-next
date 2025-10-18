import type { Buffer } from "node:buffer";

export type StorageMetadataValue = string | number | boolean;

export type StorageMultipartPart = {
  partNumber: number;
  url: string;
  expiresAt: string;
};

export type StorageMultipartInitParams = {
  ownerId: string;
  filename: string | null;
  contentType: string | null;
  fileSize: number | null;
  kind?: string | null;
  metadata?: Record<string, StorageMetadataValue | null | undefined>;
  totalParts?: number | null;
};

export type StorageMultipartInitResult = {
  uploadId: string;
  key: string;
  bucket: string;
  partSize: number;
  parts: StorageMultipartPart[];
  absoluteUrl?: string | null | undefined;
};

export type StorageMultipartCompleteParams = {
  uploadId: string;
  key: string;
  parts: Array<{ partNumber: number; etag: string }>;
};

export type StorageMultipartAbortParams = {
  uploadId: string;
  key: string;
};

export type StorageUploadBufferParams = {
  key: string;
  contentType: string;
  body: Buffer;
  metadata?: Record<string, StorageMetadataValue>;
};

export type StorageUploadBufferResult = {
  key: string;
  url: string;
};

export interface StorageProvider {
  readonly name: string;
  getUploadPrefix(): string;
  createMultipartUpload(params: StorageMultipartInitParams): Promise<StorageMultipartInitResult>;
  completeMultipartUpload(params: StorageMultipartCompleteParams): Promise<void>;
  abortMultipartUpload(params: StorageMultipartAbortParams): Promise<void>;
  getPublicUrl(key: string): string;
  uploadBuffer(params: StorageUploadBufferParams): Promise<StorageUploadBufferResult>;
}
