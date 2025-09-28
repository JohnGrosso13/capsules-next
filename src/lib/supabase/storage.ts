import { Buffer } from "node:buffer";

import { getStorageProvider } from "@/config/storage";
import { generateStorageObjectKey } from "@/lib/storage/keys";
import type { StorageMetadataValue } from "@/ports/storage";

function extFromContentType(contentType: string) {
  const map: Record<string, string> = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/gif": "gif",
    "image/webp": "webp",
    "image/svg+xml": "svg",
    "video/mp4": "mp4",
    "video/webm": "webm",
  };

  const normalized = contentType.toLowerCase();
  if (map[normalized]) return map[normalized];
  const parts = normalized.split("/");
  return parts.length > 1 ? parts[1] : "bin";
}

export async function uploadBufferToStorage(
  buffer: Buffer,
  contentType: string,
  filenameHint = "asset",
  options?: {
    ownerId?: string;
    kind?: string | null;
    metadata?: Record<string, string | number | null | undefined>;
  },
) {
  const provider = getStorageProvider();
  const ownerId = options?.ownerId ?? "system";

  const key = generateStorageObjectKey({
    prefix: provider.getUploadPrefix(),
    ownerId,
    filename: `${filenameHint}.${extFromContentType(contentType)}`,
    contentType,
    kind: options?.kind ?? "uploads",
  });

  const metadata: Record<string, StorageMetadataValue> = {
    origin: "server",
  };
  if (options?.metadata) {
    for (const [k, v] of Object.entries(options.metadata)) {
      if (v === undefined || v === null) continue;
      metadata[k.toLowerCase()] = typeof v === "number" || typeof v === "boolean" ? v : String(v);
    }
  }

  const { url } = await provider.uploadBuffer({
    key,
    contentType,
    body: buffer,
    metadata,
  });

  return { url, key };
}

export async function storeImageSrcToSupabase(src: string, filenameHint = "image") {
  if (!src) throw new Error("No image source provided");

  if (/^data:/i.test(src)) {
    const match = src.match(/^data:([^;]+);base64,(.*)$/i);
    if (!match) throw new Error("Invalid data URI");
    const contentType = match[1] || "image/png";
    const base64 = match[2] || "";
    const buffer = Buffer.from(base64, "base64");
    return uploadBufferToStorage(buffer, contentType, filenameHint);
  }

  const response = await fetch(src);
  if (!response.ok) {
    throw new Error(`Failed to fetch remote image (${response.status})`);
  }
  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  const contentType = response.headers.get("content-type") || "image/png";

  return uploadBufferToStorage(buffer, contentType, filenameHint);
}
