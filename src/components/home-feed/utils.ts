import type { HomeFeedAttachment, HomeFeedPost } from "@/hooks/useHomeFeed";
import { IMAGE_EXTENSION_PATTERN } from "@/lib/media";
import { resolveToAbsoluteUrl } from "@/lib/url";
import {
  buildImageVariants,
  pickBestDisplayVariant,
  pickBestFullVariant,
  type CloudflareImageVariantSet,
} from "@/lib/cloudflare/images";
import {
  buildLocalImageVariants,
  containsCloudflareResize,
} from "@/lib/cloudflare/runtime";

const VIDEO_EXTENSION_PATTERN = /\.(mp4|m4v|mov|webm|ogv|ogg|mkv)(\?|#|$)/i;
const GENERIC_ATTACHMENT_NAMES = new Set([
  "image",
  "photo",
  "picture",
  "screenshot",
  "video",
  "file",
  "document",
  "attachment",
]);

export type AttachmentKind = "image" | "video" | "file";

export function detectAttachmentKind(
  mimeType: string | null | undefined,
  url: string | null | undefined,
): AttachmentKind {
  const normalized = (mimeType ?? "").toLowerCase();
  if (normalized.startsWith("image/")) return "image";
  if (normalized.startsWith("video/")) return "video";
  const lowered = (url ?? "").toLowerCase();
  if (VIDEO_EXTENSION_PATTERN.test(lowered)) return "video";
  if (IMAGE_EXTENSION_PATTERN.test(lowered)) return "image";
  return "file";
}

export function stripExtension(value: string): string {
  const lastDot = value.lastIndexOf(".");
  if (lastDot === -1) return value;
  return value.slice(0, lastDot);
}

export function normalizeAttachmentName(name: string | null | undefined): string | null {
  if (typeof name !== "string") return null;
  const trimmed = name.trim();
  if (!trimmed.length) return null;
  const base = stripExtension(trimmed).trim();
  if (!base.length) return null;
  if (GENERIC_ATTACHMENT_NAMES.has(base.toLowerCase())) return null;
  return base;
}

export function extractAttachmentMeta(meta: unknown): string | null {
  if (!meta || typeof meta !== "object") return null;
  const candidateKeys = [
    "description",
    "caption",
    "alt",
    "altText",
    "title",
    "label",
    "summary",
    "prompt",
    "keywords",
  ];
  for (const key of candidateKeys) {
    const raw = (meta as Record<string, unknown>)[key];
    if (typeof raw === "string") {
      const trimmed = raw.trim();
      if (trimmed.length) {
        return trimmed;
      }
    }
    if (Array.isArray(raw)) {
      const joined = raw
        .map((entry) => (typeof entry === "string" ? entry.trim() : ""))
        .filter((entry) => entry.length)
        .join(", ");
      if (joined.length) return joined;
    }
  }
  return null;
}

export function formatHintList(items: string[], limit: number): string {
  if (!items.length) return "";
  const slice = items.slice(0, limit);
  const [first, second] = slice;
  if (slice.length === 1) return first ?? "";
  if (slice.length === 2) return `${first ?? ""} and ${second ?? ""}`;
  const head = slice
    .slice(0, -1)
    .filter((entry) => Boolean(entry && entry.trim().length))
    .join(", ");
  const tail = slice[slice.length - 1] ?? "";
  const ellipsis = items.length > limit ? "..." : "";
  return `${head}, and ${tail}${ellipsis}`;
}

export function describeAttachmentSet(
  attachments: HomeFeedAttachment[],
  fallbackMediaUrl: string | null | undefined,
): { summary: string | null; hints: string[] } {
  const counts: Record<AttachmentKind, number> = {
    image: 0,
    video: 0,
    file: 0,
  };
  const hints: string[] = [];
  attachments.forEach((attachment) => {
    const kind = detectAttachmentKind(attachment.mimeType, attachment.url);
    counts[kind] += 1;
    const metaHint = extractAttachmentMeta(attachment.meta);
    if (metaHint) {
      hints.push(metaHint);
    } else {
      const nameHint = normalizeAttachmentName(attachment.name);
      if (nameHint) {
        hints.push(nameHint);
      }
    }
  });

  if (!attachments.length && typeof fallbackMediaUrl === "string" && fallbackMediaUrl.trim().length) {
    const kind = detectAttachmentKind(null, fallbackMediaUrl);
    counts[kind] += 1;
  }

  const pieces: string[] = [];
  if (counts.image) {
    pieces.push(`${counts.image} image${counts.image > 1 ? "s" : ""}`);
  }
  if (counts.video) {
    pieces.push(`${counts.video} video${counts.video > 1 ? "s" : ""}`);
  }
  if (counts.file) {
    pieces.push(`${counts.file} file${counts.file > 1 ? "s" : ""}`);
  }

  const summary =
    pieces.length > 0 ? `Shared ${pieces.join(" and ")}.` : attachments.length ? "Shared new files." : null;
  const uniqueHints = Array.from(
    new Set(
      hints
        .map((hint) => hint.trim())
        .filter((hint) => hint.length)
        .slice(0, 6),
    ),
  );
  return { summary, hints: uniqueHints };
}

export type MediaDimensions = { width: number; height: number };

const MEDIA_DIMENSION_KEY_PAIRS: Array<[string, string]> = [
  ["width", "height"],
  ["w", "h"],
  ["naturalWidth", "naturalHeight"],
  ["natural_width", "natural_height"],
  ["imageWidth", "imageHeight"],
  ["image_width", "image_height"],
  ["originalWidth", "originalHeight"],
  ["original_width", "original_height"],
  ["previewWidth", "previewHeight"],
  ["preview_width", "preview_height"],
  ["pixelWidth", "pixelHeight"],
  ["pixel_width", "pixel_height"],
];

function coerceDimension(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return value;
  }
  if (typeof value === "string") {
    const parsed = Number.parseFloat(value);
    if (Number.isFinite(parsed) && parsed > 0) {
      return parsed;
    }
  }
  return null;
}

export function extractMediaDimensions(source: unknown, depthLimit = 4): MediaDimensions | null {
  if (!source || typeof source !== "object") return null;

  const queue: Array<{ value: unknown; depth: number }> = [{ value: source, depth: 0 }];
  const seen = new WeakSet<object>();

  while (queue.length) {
    const entry = queue.shift();
    if (!entry) continue;
    const { value, depth } = entry;
    if (!value || typeof value !== "object") continue;

    if (seen.has(value as object)) continue;
    seen.add(value as object);

    if (Array.isArray(value)) {
      if (depth >= depthLimit) continue;
      for (const child of value) {
        queue.push({ value: child, depth: depth + 1 });
      }
      continue;
    }

    const record = value as Record<string, unknown>;
    for (const [widthKey, heightKey] of MEDIA_DIMENSION_KEY_PAIRS) {
      const width = coerceDimension(record[widthKey]);
      const height = coerceDimension(record[heightKey]);
      if (width && height) {
        return { width, height };
      }
    }

    if (depth >= depthLimit) continue;
    Object.values(record).forEach((child) => {
      queue.push({ value: child, depth: depth + 1 });
    });
  }

  return null;
}

export function shouldRebuildVariantsForEnvironment(
  variants: CloudflareImageVariantSet | null | undefined,
  cloudflareEnabled: boolean,
): boolean {
  if (!cloudflareEnabled) return true;
  if (!variants) return true;
  if (containsCloudflareResize(variants.feed)) return true;
  if (containsCloudflareResize(variants.full)) return true;
  if (containsCloudflareResize(variants.thumb)) return true;
  return false;
}

export type FeedGalleryItem = {
  id: string;
  originalUrl: string;
  displayUrl: string;
  displaySrcSet: string | null;
  fullUrl: string;
  fullSrcSet: string | null;
  kind: "image" | "video";
  name: string | null;
  thumbnailUrl: string | null;
  mimeType: string | null;
  width: number | null;
  height: number | null;
  aspectRatio: number | null;
};

export type FileAttachmentInfo = {
  id: string;
  url: string;
  name: string | null;
  mimeType: string | null;
  meta: Record<string, unknown> | null;
  uploadSessionId: string | null;
};

export type PostMediaCollections = {
  media: string | null | undefined;
  galleryItems: FeedGalleryItem[];
  fileAttachments: FileAttachmentInfo[];
};

export function buildPostMediaCollections(params: {
  post: HomeFeedPost;
  initialMedia: string | null;
  cloudflareEnabled: boolean;
  currentOrigin: string | null;
}): PostMediaCollections {
  const { post, initialMedia, cloudflareEnabled, currentOrigin } = params;
  let media = initialMedia;
  const rawAttachments = Array.isArray(post.attachments)
    ? post.attachments.filter(
        (attachment): attachment is NonNullable<HomeFeedPost["attachments"]>[number] =>
          Boolean(attachment && attachment.url),
      )
    : [];

  const attachmentsList = rawAttachments;
  const seenMedia = new Set<string>();
  const galleryItems: FeedGalleryItem[] = [];
  const fileAttachments: FileAttachmentInfo[] = [];

  const inferAttachmentKind = (
    mime: string | null | undefined,
    url: string,
    storageKey?: string | null,
    thumbnailUrl?: string | null,
  ): AttachmentKind => {
    const primary = detectAttachmentKind(mime, url);
    if (primary !== "file") return primary;
    const secondarySources = [storageKey, thumbnailUrl];
    for (const source of secondarySources) {
      if (!source || typeof source !== "string") continue;
      const detected = detectAttachmentKind(null, source);
      if (detected !== "file") return detected;
    }
    return "file";
  };

  const pushMedia = (
    item: {
      id: string;
      originalUrl: string;
      displayUrl: string;
      displaySrcSet: string | null;
      fullUrl: string;
      fullSrcSet: string | null;
      kind: "image" | "video";
      name: string | null;
      thumbnailUrl: string | null;
      mimeType: string | null;
      metadata?: unknown;
    },
  ) => {
    if (!item.originalUrl || seenMedia.has(item.originalUrl)) return;
    seenMedia.add(item.originalUrl);
    const dimensions = extractMediaDimensions(item.metadata);
    const width = dimensions?.width ?? null;
    const height = dimensions?.height ?? null;
    const aspectRatio =
      width && height && height > 0
        ? Math.min(Math.max(Number((width / height).toFixed(4)), 0.05), 20)
        : null;
    const { metadata: _metadata, ...rest } = item;
    galleryItems.push({
      ...rest,
      width: width && Number.isFinite(width) ? width : null,
      height: height && Number.isFinite(height) ? height : null,
      aspectRatio,
    });
  };

  if (media && !attachmentsList.length) {
    const inferred = inferAttachmentKind(null, media) === "video" ? "video" : "image";
    const absoluteMedia = resolveToAbsoluteUrl(media) ?? media;
    const variants =
      inferred === "image"
        ? cloudflareEnabled
          ? buildImageVariants(media, {
              thumbnailUrl: media,
              origin: currentOrigin ?? null,
            })
          : buildLocalImageVariants(media, media)
        : null;
    const displayUrl =
      inferred === "image" ? (pickBestDisplayVariant(variants) ?? absoluteMedia) : absoluteMedia;
    const fullUrl =
      inferred === "image" ? (pickBestFullVariant(variants) ?? absoluteMedia) : absoluteMedia;
    const displaySrcSet =
      cloudflareEnabled && inferred === "image" ? (variants?.feedSrcset ?? null) : null;
    const fullSrcSet =
      cloudflareEnabled && inferred === "image"
        ? (variants?.fullSrcset ?? variants?.feedSrcset ?? null)
        : null;
    pushMedia({
      id: `${post.id}-primary`,
      originalUrl: variants?.original ?? absoluteMedia,
      displayUrl,
      displaySrcSet,
      fullUrl,
      fullSrcSet,
      kind: inferred,
      name: null,
      thumbnailUrl: inferred === "image" ? (variants?.thumb ?? absoluteMedia) : null,
      mimeType: null,
      metadata: null,
    });
  }

  attachmentsList.forEach((attachment, index) => {
    if (!attachment || !attachment.url) return;
    const kind = inferAttachmentKind(
      attachment.mimeType ?? null,
      attachment.url,
      attachment.storageKey ?? null,
      attachment.thumbnailUrl ?? null,
    );
    const baseId = attachment.id || `${post.id}-att-${index}`;
    if (kind === "image" || kind === "video") {
      let variants = attachment.variants ?? null;
      if (kind === "image" && shouldRebuildVariantsForEnvironment(variants, cloudflareEnabled)) {
        variants = cloudflareEnabled
          ? buildImageVariants(attachment.url, {
              thumbnailUrl: attachment.thumbnailUrl ?? null,
              origin: currentOrigin ?? null,
            })
          : buildLocalImageVariants(attachment.url, attachment.thumbnailUrl ?? null);
      }
      const absoluteOriginal = resolveToAbsoluteUrl(attachment.url) ?? attachment.url;
      const absoluteThumb = resolveToAbsoluteUrl(attachment.thumbnailUrl ?? null);
      const displayCandidate =
        kind === "image"
          ? (pickBestDisplayVariant(variants) ?? absoluteThumb ?? absoluteOriginal)
          : absoluteOriginal;
      const fullCandidate =
        kind === "image" ? (pickBestFullVariant(variants) ?? absoluteOriginal) : absoluteOriginal;
      const displaySrcSet =
        cloudflareEnabled && kind === "image" ? (variants?.feedSrcset ?? null) : null;
      const fullSrcSet =
        cloudflareEnabled && kind === "image"
          ? (variants?.fullSrcset ?? variants?.feedSrcset ?? null)
          : null;
      const thumbnailUrl =
        kind === "image"
          ? (variants?.thumb ?? absoluteThumb ?? absoluteOriginal)
          : (() => {
              const candidate =
                absoluteThumb && absoluteThumb !== absoluteOriginal
                  ? absoluteThumb
                  : typeof attachment.thumbnailUrl === "string"
                    ? attachment.thumbnailUrl
                    : null;
              return candidate && candidate !== absoluteOriginal ? candidate : null;
            })();
      pushMedia({
        id: baseId,
        originalUrl: variants?.original ?? absoluteOriginal,
        displayUrl: displayCandidate,
        displaySrcSet,
        fullUrl: fullCandidate,
        fullSrcSet,
        kind,
        name: attachment.name ?? null,
        thumbnailUrl,
        mimeType: attachment.mimeType ?? null,
        metadata: attachment.meta ?? null,
      });
    } else {
      if (fileAttachments.some((file) => file.url === attachment.url)) return;
      let fallbackName = attachment.name ?? null;
      if (!fallbackName) {
        try {
          const tail = decodeURIComponent(attachment.url.split("/").pop() ?? "");
          const clean = tail.split("?")[0];
          fallbackName = clean || tail || "Attachment";
        } catch {
          fallbackName = "Attachment";
        }
      }
      fileAttachments.push({
        id: baseId,
        url: attachment.url,
        name: fallbackName,
        mimeType: attachment.mimeType ?? null,
        meta: attachment.meta ?? null,
        uploadSessionId: attachment.uploadSessionId ?? null,
      });
    }
  });

  if (!media && galleryItems.length) {
    const primaryMedia = galleryItems[0] ?? null;
    if (primaryMedia) {
      media = primaryMedia.thumbnailUrl ?? primaryMedia.displayUrl ?? primaryMedia.fullUrl;
    }
  }

  return { media: media ?? null, galleryItems, fileAttachments };
}
