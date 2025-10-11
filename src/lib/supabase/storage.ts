import type { Buffer as NodeBuffer } from "node:buffer";
import { getStorageProvider } from "@/config/storage";
import { generateStorageObjectKey } from "@/lib/storage/keys";
import { serverEnv } from "@/lib/env/server";
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

type ByteLike = Uint8Array | ArrayBuffer | NodeBuffer;

function toUploadBuffer(input: ByteLike): NodeBuffer {
  const ctor = (
    globalThis as unknown as {
      Buffer?: { from: (src: ArrayBuffer | Uint8Array) => NodeBuffer };
    }
  ).Buffer;
  if (ctor) {
    if (input instanceof Uint8Array) return ctor.from(input);
    if (input instanceof ArrayBuffer) return ctor.from(input);
    return input as NodeBuffer;
  }
  // Fallback cast (code paths using this run on Node runtime in practice)
  return input as unknown as NodeBuffer;
}

export async function uploadBufferToStorage(
  buffer: ByteLike,
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
    body: toUploadBuffer(buffer),
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
    const ctor = (
      globalThis as unknown as {
        Buffer?: { from: (src: string, encoding: string) => NodeBuffer };
      }
    ).Buffer;
    const bytes: ByteLike = ctor
      ? ctor.from(base64, "base64")
      : new Uint8Array(
          atob(base64)
            .split("")
            .map((c) => c.charCodeAt(0)),
        );
    return uploadBufferToStorage(bytes, contentType, filenameHint);
  }

  const parseUrl = (() => {
    try {
      return new URL(src);
    } catch {
      return null;
    }
  })();

  if (parseUrl) {
    const host = parseUrl.hostname.toLowerCase();
    const isLocalHost =
      host === "localhost" ||
      host === "127.0.0.1" ||
      host === "::1" ||
      host.endsWith(".local") ||
      host.endsWith(".localdomain") ||
      host.endsWith(".test") ||
      host.endsWith(".example");

    const r2Account = (serverEnv.R2_ACCOUNT_ID ?? "").toLowerCase().trim();
    const r2Bucket = (serverEnv.R2_BUCKET ?? "").toLowerCase().trim();
    const r2AccountHost = r2Account ? `${r2Account}.r2.cloudflarestorage.com` : "";
    const r2BucketHost = r2Account && r2Bucket ? `${r2Bucket}.${r2AccountHost}` : "";
    let r2BaseHost = "";
    if (serverEnv.R2_PUBLIC_BASE_URL) {
      try {
        r2BaseHost = new URL(serverEnv.R2_PUBLIC_BASE_URL).hostname.toLowerCase();
      } catch {
        r2BaseHost = "";
      }
    }

    const isAccountHost = r2AccountHost && host === r2AccountHost;
    const isBucketHost = r2BucketHost && host === r2BucketHost;
    const isCustomR2Host = r2BaseHost && host === r2BaseHost;
    const isAccountBucketPath =
      isAccountHost &&
      r2Bucket &&
      parseUrl.pathname.replace(/^\/+/, "").toLowerCase().startsWith(`${r2Bucket}/`);
    const isKnownR2Host = isBucketHost || isCustomR2Host || isAccountBucketPath;

    if (isLocalHost || isKnownR2Host) {
      return { url: src, key: null };
    }
  }

  try {
    const response = await fetch(src);

    if (!response.ok) {
      console.warn(`Failed to fetch remote image (${response.status})`);
      return { url: src, key: null };
    }

    const arrayBuffer = await response.arrayBuffer();
    const ctor = (
      globalThis as unknown as {
        Buffer?: { from: (src: ArrayBuffer) => NodeBuffer };
      }
    ).Buffer;
    const bytes: ByteLike = ctor ? ctor.from(arrayBuffer) : new Uint8Array(arrayBuffer);
    const contentType = response.headers.get("content-type") || "image/png";

    return uploadBufferToStorage(bytes, contentType, filenameHint);
  } catch (error) {
    console.warn("storeImageSrcToSupabase fetch failed", error);
    return { url: src, key: null };
  }
}
