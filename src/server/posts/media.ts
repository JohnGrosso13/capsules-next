import { serverEnv } from "@/lib/env/server";
import { normalizeMediaUrl } from "@/lib/media";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import type { CloudflareImageVariantSet } from "@/lib/cloudflare/images";

export type NormalizedAttachment = {
  id: string;
  url: string;
  mimeType: string | null;
  name: string | null;
  thumbnailUrl: string | null;
  storageKey: string | null;
  uploadSessionId?: string | null;
  variants?: CloudflareImageVariantSet | null;
};

export function parsePublicStorageObject(url: string): { bucket: string; key: string } | null {
  try {
    const u = new URL(url);
    const match = u.pathname.match(/\/storage\/v1\/object\/public\/([^/]+)\/(.+)$/);
    if (!match) return null;
    const bucket = match[1];
    const key = match[2];
    if (!bucket || !key) return null;
    return { bucket: decodeURIComponent(bucket), key: decodeURIComponent(key) };
  } catch {
    return null;
  }
}

export function rewriteR2MediaUrl(url: string): string | null {
  const base = serverEnv.R2_PUBLIC_BASE_URL;
  let baseHost = "";
  let baseUrl: URL | null = null;
  if (base) {
    try {
      baseUrl = new URL(base);
      baseHost = baseUrl.host.toLowerCase();
    } catch {
      baseUrl = null;
      baseHost = "";
    }
  }

  const bucket = serverEnv.R2_BUCKET.trim();
  const account = serverEnv.R2_ACCOUNT_ID.trim();
  if (!bucket || !account) return null;

  try {
    const candidate = new URL(url);
    if (candidate.protocol === "data:" || candidate.protocol === "blob:") {
      return url;
    }
    const suffix = ".r2.cloudflarestorage.com";
    const lowerBucket = bucket.toLowerCase();
    const accountHost = `${account.toLowerCase()}${suffix}`;
    const bucketHost = `${lowerBucket}.${accountHost}`;
    const candidateHost = candidate.host.toLowerCase();

    if (baseUrl && candidateHost === baseUrl.host.toLowerCase()) {
      return url;
    }

    let key: string | null = null;
    if (candidateHost === bucketHost) {
      key = candidate.pathname.replace(/^\/+/, "");
    } else if (candidateHost === accountHost) {
      const parts = candidate.pathname.replace(/^\/+/, "").split("/");
      if (parts.length > 1 && parts[0]?.toLowerCase() === lowerBucket) {
        key = parts.slice(1).join("/");
      }
    }
    if (!key) {
      const fallbackParts = candidate.pathname.replace(/^\/+/, "").split("/");
      if (fallbackParts.length > 1 && fallbackParts[0]?.toLowerCase() === lowerBucket) {
        key = fallbackParts.slice(1).join("/");
      }
    }
    if (!key) return null;
    const normalizedKey = key.replace(/^\/+/, "");

    const isPlaceholder = baseHost.endsWith(".local.example");
    const shouldUseProxy = !baseUrl || isPlaceholder;
    if (shouldUseProxy) {
      const encodedKey = normalizedKey.split("/").map(encodeURIComponent).join("/");
      return `/api/uploads/r2/object/${encodedKey}`;
    }

    if (!baseUrl) {
      return null;
    }
    const baseHref = baseUrl.href.endsWith("/") ? baseUrl.href : `${baseUrl.href}/`;
    return new URL(normalizedKey, baseHref).toString();
  } catch {
    return null;
  }
}

export async function ensureAccessibleMediaUrl(candidate: string | null): Promise<string | null> {
  const value = normalizeMediaUrl(candidate);
  if (!value) return null;
  const r2Url = rewriteR2MediaUrl(value);
  if (r2Url) return r2Url;
  const parsed = parsePublicStorageObject(value);
  if (!parsed) return value;
  try {
    const supabase = getSupabaseAdminClient();
    const signed = await supabase.storage
      .from(parsed.bucket)
      .createSignedUrl(parsed.key, 3600 * 24 * 365);
    return signed.data?.signedUrl ?? value;
  } catch {
    return value;
  }
}

export function isLikelyImage(
  mimeType: string | null | undefined,
  url: string | null | undefined,
): boolean {
  if (typeof mimeType === "string" && mimeType.toLowerCase().startsWith("image/")) {
    return true;
  }
  const normalizedUrl = typeof url === "string" ? url : null;
  if (!normalizedUrl) return false;
  const lower = normalizedUrl.split("?")[0]?.toLowerCase() ?? "";
  if (!lower) return false;
  return /(\.png|\.jpe?g|\.webp|\.gif|\.avif|\.heic|\.heif)$/i.test(lower);
}

export function normalizeContentType(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

export function readContentType(source: Record<string, unknown> | null | undefined): string | null {
  if (!source || typeof source !== "object") return null;
  const candidates = [
    (source as { mime_type?: unknown }).mime_type,
    (source as { mimeType?: unknown }).mimeType,
    (source as { content_type?: unknown }).content_type,
    (source as { contentType?: unknown }).contentType,
  ];
  for (const candidate of candidates) {
    const normalized = normalizeContentType(candidate);
    if (normalized) return normalized;
  }
  return null;
}

const EXTENSION_MIME_MAP: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  jpe: "image/jpeg",
  png: "image/png",
  gif: "image/gif",
  webp: "image/webp",
  avif: "image/avif",
  heic: "image/heic",
  heif: "image/heif",
  bmp: "image/bmp",
  svg: "image/svg+xml",
  mp4: "video/mp4",
  m4v: "video/mp4",
  mov: "video/quicktime",
  webm: "video/webm",
  ogv: "video/ogg",
  ogg: "video/ogg",
  mkv: "video/x-matroska",
};

export function guessMimeFromUrl(candidate: string | null | undefined): string | null {
  if (typeof candidate !== "string") return null;
  const trimmed = candidate.trim();
  if (!trimmed) return null;
  const cleaned = (() => {
    try {
      return decodeURIComponent(trimmed);
    } catch {
      return trimmed;
    }
  })();
  const withoutQuery = cleaned.split(/[?#]/)[0] ?? "";
  const lastDot = withoutQuery.lastIndexOf(".");
  if (lastDot === -1) return null;
  const ext = withoutQuery.slice(lastDot + 1).toLowerCase();
  if (!ext) return null;
  const mapped = EXTENSION_MIME_MAP[ext];
  if (mapped) return mapped;
  if (ext === "jpeg2000") return "image/jp2";
  return null;
}

export function extractUploadSessionId(
  meta: Record<string, unknown> | null | undefined,
): string | null {
  if (!meta || typeof meta !== "object") return null;
  const candidates = [
    (meta as { upload_session_id?: unknown }).upload_session_id,
    (meta as { uploadSessionId?: unknown }).uploadSessionId,
    (meta as { sessionId?: unknown }).sessionId,
    (meta as { session_id?: unknown }).session_id,
  ];
  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim().length) {
      return candidate.trim();
    }
  }
  return null;
}
