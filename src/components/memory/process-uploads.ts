import { resolveToAbsoluteUrl } from "@/lib/url";
import { buildCloudflareImageUrl } from "@/lib/cloudflare/images";

import type { DisplayMemoryUpload, MemoryUploadItem } from "./uploads-types";

type TransformOptions = {
  origin: string | null;
  cloudflareEnabled: boolean;
};

const FALLBACK_THUMB_SIZE = 240;

const THUMB_META_KEYS = [
  "thumbnail_url",
  "thumbnailUrl",
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

export function computeDisplayUploads(
  items: MemoryUploadItem[],
  { origin, cloudflareEnabled }: TransformOptions,
): DisplayMemoryUpload[] {
  if (!Array.isArray(items) || !items.length) return [];
  const effectiveOrigin = origin ?? (typeof window !== "undefined" ? window.location.origin : null);
  const allowCloudflare = cloudflareEnabled;

  return items
    .map((item) => {
      const rawUrl = typeof item.media_url === "string" ? item.media_url.trim() : "";
      const absoluteFull = toAbsolute(rawUrl, effectiveOrigin);
      const normalizedFull = typeof absoluteFull === "string" ? absoluteFull.trim() : "";

      const metaThumb = selectMetaThumbnail(item.meta as Record<string, unknown> | null | undefined);
      const absoluteThumb = toAbsolute(metaThumb, effectiveOrigin);
      const normalizedThumb = typeof absoluteThumb === "string" ? absoluteThumb.trim() : "";

      const baseDisplay = normalizedThumb.length ? normalizedThumb : normalizedFull;
      if (!baseDisplay.length) {
        return null;
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

      return {
        ...item,
        displayUrl,
        fullUrl: normalizedFull.length ? normalizedFull : baseDisplay,
      };
    })
    .filter((upload): upload is DisplayMemoryUpload => upload !== null);
}
