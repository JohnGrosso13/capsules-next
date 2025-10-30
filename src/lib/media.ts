const INLINE_IMAGE_MIME_PATTERN =
  /^image\/(png|jpe?g|pjpeg|gif|webp|avif|bmp|svg\+xml|heic|heif|tiff|apng|x-icon|vnd\.microsoft\.icon)$/i;

export const IMAGE_EXTENSION_PATTERN =
  /\.(png|jpe?g|gif|webp|avif|apng|svg|heic|heif|bmp|tiff|dng)(\?|#|$)/i;

export function normalizeMediaUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const lowered = trimmed.toLowerCase();
  if (lowered === "null" || lowered === "undefined") return null;
  return trimmed;
}

export function canRenderInlineImage(
  mimeType: string | null | undefined,
  url: string | null | undefined,
): boolean {
  const normalizedMime = typeof mimeType === "string" ? mimeType.trim().toLowerCase() : "";
  if (normalizedMime.length) {
    if (INLINE_IMAGE_MIME_PATTERN.test(normalizedMime)) {
      return true;
    }
    if (normalizedMime.startsWith("image/")) {
      return false;
    }
  }
  if (typeof url === "string" && url.trim().length) {
    return IMAGE_EXTENSION_PATTERN.test(url.trim().toLowerCase());
  }
  return false;
}
