import type { DisplayMemoryUpload } from "./uploads-types";

const VIDEO_EXTS = new Set([
  "MP4",
  "MOV",
  "M4V",
  "WEBM",
  "MKV",
  "AVI",
  "WMV",
  "3GP",
]);

const IMAGE_EXTS = new Set([
  "JPG",
  "JPEG",
  "PNG",
  "GIF",
  "WEBP",
  "HEIC",
  "HEIF",
  "AVIF",
  "BMP",
  "TIFF",
  "TIF",
  "SVG",
  "DNG",
]);

export function isVideo(mime: string | null | undefined, extension?: string | null): boolean {
  if (typeof mime === "string" && mime.toLowerCase().startsWith("video/")) return true;
  if (extension) {
    const upper = extension.toUpperCase();
    if (VIDEO_EXTS.has(upper)) return true;
  }
  return false;
}

export function isImage(mime: string | null | undefined, extension?: string | null): boolean {
  if (typeof mime === "string" && mime.toLowerCase().startsWith("image/")) return true;
  if (extension) {
    const upper = extension.toUpperCase();
    if (IMAGE_EXTS.has(upper)) return true;
  }
  return false;
}

function toExtension(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed.length) return null;
  const normalized = trimmed.slice(0, 8).toUpperCase();
  return normalized.length ? normalized : null;
}

function extractExtensionFromPath(source: string | null | undefined): string | null {
  if (!source) return null;
  try {
    const url = new URL(source);
    source = url.pathname;
  } catch {
    // treat as plain path
  }
  const clean = source.split(/[?#]/)[0] ?? "";
  const parts = clean.split(".");
  if (parts.length <= 1) return null;
  const ext = parts.pop();
  if (!ext) return null;
  return toExtension(ext);
}

export function getUploadExtension(item: DisplayMemoryUpload): string | null {
  const meta = (item.meta ?? null) as Record<string, unknown> | null;
  const metaCandidates = [
    meta?.file_extension,
    meta?.fileExtension,
    meta?.extension,
    meta?.ext,
    meta?.format,
    meta?.type,
  ];

  for (const candidate of metaCandidates) {
    const extension = toExtension(candidate);
    if (extension) return extension;
  }

  const fromTitle = extractExtensionFromPath(item.title);
  if (fromTitle) return fromTitle;

  const fromUrl = extractExtensionFromPath(item.fullUrl ?? item.displayUrl ?? item.media_url);
  if (fromUrl) return fromUrl;

  const fromName = extractExtensionFromPath(
    typeof meta?.original_filename === "string" ? (meta.original_filename as string) : null,
  );
  if (fromName) return fromName;

  if (typeof item.media_type === "string" && item.media_type.includes("/")) {
    const subtype = item.media_type.split("/")[1] ?? "";
    if (subtype) {
      const normalized = subtype.split("+")[0]?.split(".")[0] ?? "";
      if (normalized) return toExtension(normalized);
    }
  }

  return null;
}
