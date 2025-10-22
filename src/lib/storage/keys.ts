const EXTENSION_BY_MIME: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/pjpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
  "image/gif": "gif",
  "image/webp": "webp",
  "image/svg+xml": "svg",
  "video/mp4": "mp4",
  "video/quicktime": "mov",
  "video/webm": "webm",
  "audio/mpeg": "mp3",
  "audio/mp3": "mp3",
  "audio/wav": "wav",
  "audio/x-wav": "wav",
  "audio/flac": "flac",
  "application/pdf": "pdf",
};

function slugify(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
}

function extensionFromContentType(contentType: string | null | undefined, fallback: string | null) {
  if (contentType) {
    const normalized = contentType.trim().toLowerCase();
    const mapped = EXTENSION_BY_MIME[normalized];
    if (mapped) {
      return mapped;
    }
    const parts = normalized.split("/");
    const ext = parts.at(-1);
    if (ext && /^[a-z0-9.+-]{2,20}$/i.test(ext)) {
      return ext.replace(/[^a-z0-9]+/gi, "");
    }
  }
  if (fallback && /^[a-z0-9]{1,10}$/i.test(fallback)) {
    return fallback.toLowerCase();
  }
  return "bin";
}

export function generateStorageObjectKey({
  prefix,
  ownerId,
  filename,
  contentType,
  kind,
}: {
  prefix: string;
  ownerId: string;
  filename: string | null;
  contentType: string | null;
  kind?: string | null;
}): string {
  const now = new Date();
  const dateDir = `${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, "0")}/${String(
    now.getUTCDate(),
  ).padStart(2, "0")}`;
  const uid = (globalThis as unknown as { crypto?: Crypto }).crypto?.randomUUID
    ? (globalThis as unknown as { crypto: Crypto }).crypto.randomUUID()
    : `${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
  const sanitizedName = filename ? slugify(filename) : null;
  const base = [kind?.trim() || null, ownerId, dateDir].filter(Boolean).join("/");
  const keyParts = [
    prefix,
    base,
    [sanitizedName && sanitizedName.length ? sanitizedName : "asset", uid]
      .filter(Boolean)
      .join("-"),
  ]
    .filter(Boolean)
    .join("/");
  const fallbackExt = sanitizedName?.split(".").pop() ?? null;
  const extension = extensionFromContentType(contentType, fallbackExt);
  return `${keyParts}.${extension}`;
}
