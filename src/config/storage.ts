import { getR2StorageProvider } from "@/adapters/storage/r2/provider";
import { serverEnv } from "@/lib/env/server";
import type { StorageProvider } from "@/ports/storage";

const storageVendor = (process.env.STORAGE_VENDOR ?? "r2").trim().toLowerCase();

let provider: StorageProvider | null = null;

switch (storageVendor) {
  case "r2":
  case "":
    provider = getR2StorageProvider();
    break;
  default:
    console.warn(`Unknown storage vendor "${storageVendor}". Falling back to R2.`);
    provider = getR2StorageProvider();
    break;
}

export function getStorageProvider(): StorageProvider {
  if (!provider) {
    provider = getR2StorageProvider();
  }
  return provider;
}

export function getStorageVendor(): string {
  return provider?.name ?? "r2";
}

export function getStorageUploadQueueName(): string | null {
  return serverEnv.R2_UPLOAD_COMPLETIONS_QUEUE;
}

export function getStorageKvNamespaceId(): string | null {
  return serverEnv.R2_KV_NAMESPACE_ID;
}

export function getCloudflareApiToken(): string | null {
  return serverEnv.CLOUDFLARE_API_TOKEN;
}

export function getTurnstileSecretKey(): string | null {
  return serverEnv.TURNSTILE_SECRET_KEY;
}
