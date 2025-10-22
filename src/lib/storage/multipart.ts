import "server-only";

import { getStorageProvider } from "@/config/storage";
import type {
  StorageMultipartAbortParams,
  StorageMultipartCompleteParams,
  StorageMultipartInitParams,
  StorageMultipartInitResult,
} from "@/ports/storage";

export type {
  StorageMultipartAbortParams,
  StorageMultipartCompleteParams,
  StorageMultipartInitParams,
  StorageMultipartInitResult,
} from "@/ports/storage";

export async function createMultipartUpload(
  params: StorageMultipartInitParams,
): Promise<StorageMultipartInitResult> {
  return getStorageProvider().createMultipartUpload(params);
}

export async function completeMultipartUpload(
  params: StorageMultipartCompleteParams,
): Promise<void> {
  await getStorageProvider().completeMultipartUpload(params);
}

export async function abortMultipartUpload(params: StorageMultipartAbortParams): Promise<void> {
  await getStorageProvider().abortMultipartUpload(params);
}

export function getStorageObjectUrl(key: string): string {
  return getStorageProvider().getPublicUrl(key);
}
