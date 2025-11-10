import "server-only";

import { getStorageService } from "@/config/storage";
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
  return getStorageService().createMultipartUpload(params);
}

export async function completeMultipartUpload(
  params: StorageMultipartCompleteParams,
): Promise<void> {
  await getStorageService().completeMultipartUpload(params);
}

export async function abortMultipartUpload(params: StorageMultipartAbortParams): Promise<void> {
  await getStorageService().abortMultipartUpload(params);
}

export function getStorageObjectUrl(key: string): string {
  return getStorageService().getPublicUrl(key);
}
