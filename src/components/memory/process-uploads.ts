import { resolveToAbsoluteUrl } from "@/lib/url";
import { buildCloudflareImageUrl } from "@/lib/cloudflare/images";
import { getUploadExtension } from "./upload-helpers";

import type { DisplayMemoryUpload, MemoryUploadItem } from "./uploads-types";

type TransformOptions = {
  origin: string | null;
  cloudflareEnabled: boolean;
};

const FALLBACK_THUMB_SIZE = 240;

const THUMB_META_KEYS = [
  "thumbnail_url",
  "thumbnailUrl",
  "poster_url",
  "posterUrl",
  "thumb",
  "preview_url",
  "previewUrl",
  "image_thumb",
  "imageThumb",
];

function selectMetaThumbnail(meta: Record<string, unknown> | null | undefined): string | null {
  if (!meta || typeof meta !== "object") return null;
  for (const key of THUMB_META_KEYS) {
    const value = (meta as Record<string, unknown>)[key];
    if (typeof value === "string" && value.trim().length) {
      return value.trim();
    }
  }
  return null;
}

function selectDerivedAsset(meta: Record<string, unknown> | null | undefined): string | null {
  if (!meta || typeof meta !== "object") return null;
  const derived = (meta as { derived_assets?: unknown }).derived_assets;
  if (!Array.isArray(derived)) return null;
  for (const entry of derived) {
    if (typeof entry === "string" && entry.trim().length) return entry.trim();
    if (entry && typeof entry === "object" && !Array.isArray(entry)) {
      const url = (entry as { url?: unknown }).url;
      if (typeof url === "string" && url.trim().length) return url.trim();
    }
  }
  return null;
}

function toAbsolute(url: string | null | undefined, origin: string | null): string | null {
  if (!url || typeof url !== "string") return null;
  return resolveToAbsoluteUrl(url, origin);
}

function canOptimizeWithCloudflare(url: string | null, origin: string | null): boolean {
  if (!url) return false;
  if (url.startsWith("/")) return true;
  try {
    const parsed = new URL(url);
    if (/imagedelivery\.net/i.test(parsed.hostname)) return true;
    if (origin) {
      const current = new URL(origin);
      if (parsed.hostname === current.hostname) return true;
    }
  } catch {
    return false;
  }
  return false;
}

function deriveMimeFromExtension(ext: string | null | undefined): string | null {
  if (!ext) return null;
  const value = ext.toUpperCase();
  if (value === "MOV" || value === "MP4" || value === "M4V" || value === "WEBM") return "video/mp4";
  if (value === "MKV") return "video/x-matroska";
  if (value === "AVI") return "video/x-msvideo";
  if (value === "WMV") return "video/x-ms-wmv";
  if (value === "3GP") return "video/3gpp";
  if (value === "GIF") return "image/gif";
  if (value === "PNG") return "image/png";
  if (value === "JPG" || value === "JPEG") return "image/jpeg";
  if (value === "WEBP") return "image/webp";
  if (value === "HEIC" || value === "HEIF") return "image/heic";
  if (value === "AVIF") return "image/avif";
  if (value === "BMP") return "image/bmp";
  if (value === "TIFF" || value === "TIF") return "image/tiff";
  if (value === "DNG") return "image/x-adobe-dng";
  return null;
}

export function computeDisplayUploads(
  items: MemoryUploadItem[],
  { origin, cloudflareEnabled }: TransformOptions,
): DisplayMemoryUpload[] {
  if (!Array.isArray(items) || !items.length) return [];
  const effectiveOrigin = origin ?? (typeof window !== "undefined" ? window.location.origin : null);
  const allowCloudflare = cloudflareEnabled;

  const results: DisplayMemoryUpload[] = [];

  items.forEach((item) => {
    const rawUrl = typeof item.media_url === "string" ? item.media_url.trim() : "";
    const absoluteFull = toAbsolute(rawUrl, effectiveOrigin);
    const normalizedFull = typeof absoluteFull === "string" ? absoluteFull.trim() : "";

    const meta = item.meta as Record<string, unknown> | null | undefined;
    const metaThumb = selectMetaThumbnail(meta);
    const derivedAsset = selectDerivedAsset(meta);

    const absoluteThumb = toAbsolute(metaThumb ?? derivedAsset, effectiveOrigin);
    const normalizedThumb = typeof absoluteThumb === "string" ? absoluteThumb.trim() : "";

    const baseDisplay = normalizedThumb.length ? normalizedThumb : normalizedFull;
    if (!baseDisplay.length) {
      return;
    }

    let displayUrl = baseDisplay;
    if (allowCloudflare && canOptimizeWithCloudflare(baseDisplay, effectiveOrigin)) {
      const optimized = buildCloudflareImageUrl(baseDisplay, {
        width: FALLBACK_THUMB_SIZE,
        height: FALLBACK_THUMB_SIZE,
        fit: "cover",
        gravity: "faces",
        quality: 82,
        format: "auto",
        sharpen: 1,
      });
      if (optimized) {
        displayUrl = optimized;
      }
    }

    const extension = getUploadExtension({
      ...item,
      fullUrl: normalizedFull.length ? normalizedFull : baseDisplay,
      displayUrl,
    } as DisplayMemoryUpload);
    const inferredMime = item.media_type ?? deriveMimeFromExtension(extension);

    results.push({
      ...item,
      media_type: inferredMime ?? item.media_type ?? null,
      displayUrl,
      fullUrl: normalizedFull.length ? normalizedFull : baseDisplay,
    });
  });

  return results;
}
