type CloudflareImageFit = "cover" | "contain" | "fill" | "outside" | "scale-down";

type CloudflareImageGravity =
  | "auto"
  | "center"
  | "north"
  | "south"
  | "east"
  | "west"
  | "northeast"
  | "northwest"
  | "southeast"
  | "southwest"
  | "faces"
  | "face";

export type CloudflareImageOptions = {
  width?: number | null;
  height?: number | null;
  fit?: CloudflareImageFit | null;
  quality?: number | null;
  format?: "auto" | "webp" | "avif" | "jpeg" | "png" | "gif" | null;
  dpr?: number | null;
  sharpen?: number | null;
  background?: string | null;
  gravity?: CloudflareImageGravity | null;
  namedVariant?: string | null;
};

export type CloudflareImageVariantSet = {
  original: string;
  thumb?: string | null;
  feed?: string | null;
  feedSrcset?: string | null;
  full?: string | null;
  fullSrcset?: string | null;
};

const DEFAULT_RESIZE_BASE = process.env.NEXT_PUBLIC_CLOUDFLARE_IMAGE_BASE?.trim() || "/cdn-cgi/image";
const NAMED_VARIANTS = {
  feed:
    process.env.NEXT_PUBLIC_CLOUDFLARE_IMAGE_VARIANT_FEED?.trim() ||
    process.env.CLOUDFLARE_IMAGE_VARIANT_FEED?.trim() ||
    "",
  full:
    process.env.NEXT_PUBLIC_CLOUDFLARE_IMAGE_VARIANT_FULL?.trim() ||
    process.env.CLOUDFLARE_IMAGE_VARIANT_FULL?.trim() ||
    "",
  thumb:
    process.env.NEXT_PUBLIC_CLOUDFLARE_IMAGE_VARIANT_THUMB?.trim() ||
    process.env.CLOUDFLARE_IMAGE_VARIANT_THUMB?.trim() ||
    "",
} as const;

const FEED_WIDTH_STEPS = [720, 1080, 1440, 1920] as const;
const FEED_DEFAULT_BASE_WIDTH = 1080;
const FULL_WIDTH_STEPS = [1280, 1600, 2048, 2560] as const;
const FULL_DEFAULT_BASE_WIDTH = 2048;

function isDataOrBlobUrl(url: string): boolean {
  return /^data:/i.test(url) || /^blob:/i.test(url);
}

function isAlreadyTransformed(url: string): boolean {
  return /\/cdn-cgi\/image\//.test(url);
}

function isCloudflareImagesDelivery(url: string): boolean {
  return /https?:\/\/[^/]*imagedelivery\.net\//i.test(url);
}

function buildResizeOperations(options: CloudflareImageOptions): string[] {
  const ops: string[] = [];
  if (options.width && options.width > 0) ops.push(`width=${Math.round(options.width)}`);
  if (options.height && options.height > 0) ops.push(`height=${Math.round(options.height)}`);
  if (options.fit) ops.push(`fit=${options.fit}`);
  if (options.quality && options.quality > 0) ops.push(`quality=${Math.min(Math.round(options.quality), 100)}`);
  if (options.dpr && options.dpr > 0 && options.dpr !== 1) ops.push(`dpr=${options.dpr}`);
  if (options.format) ops.push(`format=${options.format}`);
  if (typeof options.sharpen === "number" && Number.isFinite(options.sharpen)) {
    const value = Math.max(0, Math.min(10, Math.round(options.sharpen)));
    if (value > 0) ops.push(`sharpen=${value}`);
  }
  if (options.background && options.background.trim().length) {
    ops.push(`background=${encodeURIComponent(options.background.trim())}`);
  }
  if (options.gravity) ops.push(`gravity=${options.gravity}`);
  return ops;
}

function normalizeBase(base: string | null | undefined): string {
  const value = typeof base === "string" && base.trim().length ? base.trim() : DEFAULT_RESIZE_BASE;
  return value.endsWith("/") ? value.slice(0, -1) : value;
}

function normalizeOrigin(origin: string | null | undefined): string | null {
  if (typeof origin !== "string") return null;
  if (!origin.trim().length) return null;
  try {
    const parsed = new URL(origin.trim());
    return parsed.origin;
  } catch {
    return null;
  }
}

function isLocalOrigin(origin: string | null): boolean {
  if (!origin) return false;
  try {
    const parsed = new URL(origin);
    const host = parsed.hostname.toLowerCase();
    if (host === "localhost" || host === "127.0.0.1" || host === "::1") return true;
    if (host === "0.0.0.0" || host === "[::]") return true;
    if (host.endsWith(".local") || host.endsWith(".localdomain") || host.endsWith(".test")) return true;
    if (/^10\./.test(host)) return true;
    if (/^192\.168\./.test(host)) return true;
    if (/^172\.(1[6-9]|2\d|3[0-1])\./.test(host)) return true;
    if (host.startsWith("fe80:")) return true;
  } catch {
    return false;
  }
  return false;
}

function toAbsoluteSource(url: string, origin: string | null): string {
  if (!origin) return url;
  try {
    // If already absolute, the constructor succeeds.
    const absolute = new URL(url);
    return absolute.toString();
  } catch {
    // Fallback for relative paths.
    const normalizedOrigin = origin.replace(/\/$/, "");
    const normalizedPath = url.startsWith("/") ? url : `/${url}`;
    return `${normalizedOrigin}${normalizedPath}`;
  }
}

export function buildCloudflareImageUrl(
  sourceUrl: string,
  options: CloudflareImageOptions = {},
  base?: string | null,
  origin?: string | null,
): string {
  const url = sourceUrl?.trim();
  if (!url) return sourceUrl;
  if (isDataOrBlobUrl(url)) return sourceUrl;
  if (isAlreadyTransformed(url) && !isCloudflareImagesDelivery(url)) return sourceUrl;

  const namedVariant = options.namedVariant?.trim() || null;

  if (isCloudflareImagesDelivery(url)) {
    try {
      const parsed = new URL(url);
      const segments = parsed.pathname.replace(/^\/+/, "").split("/");
      if (segments.length >= 3 && namedVariant) {
        const account = segments[0];
        const assetId = segments[1];
        parsed.pathname = `/${account}/${assetId}/${namedVariant}`;
        return parsed.toString();
      }
      return url;
    } catch {
      return url;
    }
  }

  const { namedVariant: _ignoredVariant, ...resizeOptions } = options;
  const operations = buildResizeOperations(resizeOptions);
  if (!operations.length) return sourceUrl;

  const resizeBase = normalizeBase(base);
  const absoluteSource = toAbsoluteSource(url, normalizeOrigin(origin));
  const encodedSource = encodeURIComponent(absoluteSource);
  return `${resizeBase}/${operations.join(",")}/${encodedSource}`;
}

type CloudflareSrcSetEntry = {
  url: string;
  width: number;
};

function buildSrcSetEntries(
  originalUrl: string,
  widths: readonly number[],
  builder: (width: number) => CloudflareImageOptions,
  base: string,
  origin?: string | null,
): CloudflareSrcSetEntry[] {
  const seen = new Set<string>();
  const entries: CloudflareSrcSetEntry[] = [];

  for (const candidate of widths) {
    const numericWidth = Number(candidate);
    if (!Number.isFinite(numericWidth) || numericWidth <= 0) continue;
    const roundedWidth = Math.max(1, Math.round(numericWidth));
    const rawOptions = builder(roundedWidth);
    if (!rawOptions) continue;
    const options = { ...rawOptions };
    if (!options.width) {
      options.width = roundedWidth;
    }
    if (options.height && options.height > 0) {
      options.height = Math.max(1, Math.round(options.height));
    }
    const url = buildCloudflareImageUrl(originalUrl, options, base, origin);
    if (!url || seen.has(url)) continue;
    seen.add(url);
    entries.push({ url, width: roundedWidth });
  }

  return entries;
}

function serializeSrcSet(entries: CloudflareSrcSetEntry[]): string | null {
  if (!entries.length) return null;
  return entries.map(({ url, width }) => `${url} ${width}w`).join(', ');
}

function pickPreferredEntry(
  entries: CloudflareSrcSetEntry[],
  targetWidth: number,
): CloudflareSrcSetEntry | null {
  if (!entries.length) return null;
  const sorted = [...entries].sort((a, b) => a.width - b.width);
  for (const entry of sorted) {
    if (entry.width >= targetWidth) {
      return entry;
    }
  }
  return sorted[sorted.length - 1] ?? null;
}
export function buildImageVariants(
  originalUrl: string,
  {
    base,
    thumbnailUrl,
    includeFull = true,
    includeFeed = true,
    origin,
  }: {
    base?: string | null;
    thumbnailUrl?: string | null;
    includeFull?: boolean;
    includeFeed?: boolean;
    origin?: string | null;
  } = {},
): CloudflareImageVariantSet {
  const normalizedOrigin = normalizeOrigin(origin);
  const absoluteOriginal = toAbsoluteSource(originalUrl, normalizedOrigin);
  const variants: CloudflareImageVariantSet = {
    original: absoluteOriginal,
  };

  if (!originalUrl || isDataOrBlobUrl(originalUrl)) {
    return variants;
  }

  const resizeBase = normalizeBase(base);
  const isLocal = isLocalOrigin(normalizedOrigin);
  const hasNamedFeed = isCloudflareImagesDelivery(originalUrl) && NAMED_VARIANTS.feed.length > 0;
  const hasNamedFull = isCloudflareImagesDelivery(originalUrl) && NAMED_VARIANTS.full.length > 0;
  const canUseNamedThumb =
    ((thumbnailUrl && isCloudflareImagesDelivery(thumbnailUrl)) || isCloudflareImagesDelivery(originalUrl)) &&
    NAMED_VARIANTS.thumb.length > 0;

  if (isLocal) {
    const thumbSource = thumbnailUrl ?? originalUrl;
    const absoluteThumb = toAbsoluteSource(thumbSource, normalizedOrigin);
    if (includeFeed) {
      variants.feed = absoluteThumb;
    }
    if (includeFull) {
      variants.full = absoluteOriginal;
    }
    variants.thumb = absoluteThumb;
    return variants;
  }

  if (includeFeed) {
    if (hasNamedFeed) {
      variants.feed = buildCloudflareImageUrl(
        originalUrl,
        {
          namedVariant: NAMED_VARIANTS.feed,
        },
        resizeBase,
        origin,
      );
      variants.feedSrcset = null;
    } else {
      const feedEntries = buildSrcSetEntries(
        originalUrl,
        FEED_WIDTH_STEPS,
        (width) => ({
          width,
          height: width,
          fit: 'cover',
          gravity: 'faces',
          quality: 90,
          format: 'auto',
          sharpen: 1,
        }),
        resizeBase,
        origin,
      );
      variants.feedSrcset = serializeSrcSet(feedEntries);
      const preferredFeed = pickPreferredEntry(feedEntries, FEED_DEFAULT_BASE_WIDTH);
      if (preferredFeed) {
        variants.feed = preferredFeed.url;
      } else {
        const fallbackFeed = feedEntries.at(-1);
        if (fallbackFeed) {
          variants.feed = fallbackFeed.url;
        } else {
          variants.feed = buildCloudflareImageUrl(
            originalUrl,
            {
              width: FEED_DEFAULT_BASE_WIDTH,
              height: FEED_DEFAULT_BASE_WIDTH,
              fit: 'cover',
              gravity: 'faces',
              quality: 90,
              format: 'auto',
              sharpen: 1,
            },
            resizeBase,
            origin,
          );
        }
      }
    }
  }

  if (includeFull) {
    if (hasNamedFull) {
      variants.full = buildCloudflareImageUrl(
        originalUrl,
        {
          namedVariant: NAMED_VARIANTS.full,
        },
        resizeBase,
        origin,
      );
      variants.fullSrcset = null;
    } else {
      const fullEntries = buildSrcSetEntries(
        originalUrl,
        FULL_WIDTH_STEPS,
        (width) => ({
          width,
          fit: 'contain',
          quality: 92,
          format: 'auto',
        }),
        resizeBase,
        origin,
      );
      variants.fullSrcset = serializeSrcSet(fullEntries);
      const preferredFull = pickPreferredEntry(fullEntries, FULL_DEFAULT_BASE_WIDTH);
      if (preferredFull) {
        variants.full = preferredFull.url;
      } else {
        const fallbackFull = fullEntries.at(-1);
        if (fallbackFull) {
          variants.full = fallbackFull.url;
        } else {
          variants.full = buildCloudflareImageUrl(
            originalUrl,
            {
              width: FULL_DEFAULT_BASE_WIDTH,
              fit: 'contain',
              quality: 92,
              format: 'auto',
            },
            resizeBase,
            origin,
          );
        }
      }
    }
  }

  if (thumbnailUrl && !isDataOrBlobUrl(thumbnailUrl)) {
    variants.thumb = buildCloudflareImageUrl(
      thumbnailUrl,
      canUseNamedThumb
        ? { namedVariant: NAMED_VARIANTS.thumb }
        : {
            width: 512,
            height: 512,
            fit: 'cover',
            gravity: 'faces',
            quality: 82,
            format: 'auto',
            sharpen: 1,
          },
      resizeBase,
      origin,
    );
  } else {
    variants.thumb = buildCloudflareImageUrl(
      originalUrl,
      canUseNamedThumb
        ? { namedVariant: NAMED_VARIANTS.thumb }
        : {
            width: 512,
            height: 512,
            fit: 'cover',
            gravity: 'faces',
            quality: 80,
            format: 'auto',
            sharpen: 1,
          },
      resizeBase,
      origin,
    );
  }

  return variants;
}
export function pickBestDisplayVariant(variants: CloudflareImageVariantSet | null | undefined): string | null {
  if (!variants) return null;
  if (variants.feed) return variants.feed;
  if (variants.thumb) return variants.thumb;
  return variants.original ?? null;
}

export function pickBestFullVariant(variants: CloudflareImageVariantSet | null | undefined): string | null {
  if (!variants) return null;
  if (variants.full) return variants.full;
  if (variants.feed) return variants.feed;
  return variants.original ?? null;
}

