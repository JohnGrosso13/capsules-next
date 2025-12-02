import { z } from "zod";

import type { FeedPoll } from "@/domain/feed";
import { serverEnv } from "@/lib/env/server";
import {
  buildCloudflareImageUrl,
  buildImageVariants,
  pickBestDisplayVariant,
  type CloudflareImageVariantSet,
} from "@/lib/cloudflare/images";
import {
  buildLocalImageVariants,
  shouldUseCloudflareImagesForOrigin,
} from "@/lib/cloudflare/runtime";
import { resolveToAbsoluteUrl } from "@/lib/url";
import { mergeUploadMetadata } from "@/lib/uploads/metadata";
import { safeRandomUUID } from "@/lib/random";
import { listUploadSessionsByIds, type UploadSessionRecord } from "@/server/memories/uploads";
import { sanitizeMemoryMeta } from "@/server/memories/service";
import {
  ensureAccessibleMediaUrl,
  extractUploadSessionId,
  guessMimeFromUrl,
  isLikelyImage,
  normalizeContentType,
  readContentType,
  type NormalizedAttachment,
} from "@/server/posts/media";
import {
  buildFallbackPosts,
  normalizePost,
  shouldReturnFallback,
  type NormalizedPost,
} from "@/server/posts/normalizers";
import {
  listAttachmentsForPosts,
  listPollVoteAggregates,
  listPostsView,
  listViewerLikedPostIds,
  listViewerPollVotes,
  listViewerRememberedPostIds,
  type PostsViewRow,
} from "@/server/posts/repository";
import type { PostsQueryInput } from "@/server/posts/types";
import {
  postsQuerySchema,
  postsResponseSchema,
} from "@/server/validation/schemas/posts";

const RAW_LIKE_MIME_TYPES = new Set([
  "image/heic",
  "image/heif",
  "image/x-adobe-dng",
  "image/x-dng",
  "image/x-raw",
  "image/x-canon-cr2",
  "image/x-nikon-nef",
  "image/x-sony-arw",
  "image/x-fuji-raf",
  "image/x-panasonic-rw2",
]);

const RAW_LIKE_EXTENSIONS = new Set([
  "heic",
  "heif",
  "dng",
  "nef",
  "cr2",
  "arw",
  "raf",
  "rw2",
  "raw",
]);

export type PostsQueryResult = z.infer<typeof postsResponseSchema>;

export class PostsQueryError extends Error {
  code: string;
  status: number;
  details?: unknown;

  constructor(
    code: string,
    message: string,
    options: { status?: number; details?: unknown; cause?: unknown } = {},
  ) {
    super(message);
    this.name = "PostsQueryError";
    this.code = code;
    this.status = options.status ?? 500;
    this.details = options.details;
    if (options.cause !== undefined) {
      (this as Error & { cause?: unknown }).cause = options.cause;
    }
  }
}

function extractExtensionFromSource(source: string | null | undefined): string | null {
  if (!source || typeof source !== "string") return null;
  const trimmed = source.trim();
  if (!trimmed.length) return null;
  const withoutQuery = trimmed.split(/[?#]/)[0] ?? "";
  const lastDot = withoutQuery.lastIndexOf(".");
  if (lastDot === -1) return null;
  const ext = withoutQuery.slice(lastDot + 1).toLowerCase();
  return ext || null;
}

function isRawLikeAttachment(
  mimeType: string | null | undefined,
  url: string | null | undefined,
  storageKey: string | null | undefined,
): boolean {
  const normalizedMime = normalizeContentType(mimeType);
  if (normalizedMime && RAW_LIKE_MIME_TYPES.has(normalizedMime)) {
    return true;
  }
  const candidates = [
    extractExtensionFromSource(url),
    extractExtensionFromSource(storageKey),
  ].filter(Boolean) as string[];
  return candidates.some((ext) => RAW_LIKE_EXTENSIONS.has(ext));
}

function normalizeStorageKey(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  try {
    const decoded = decodeURIComponent(value).trim();
    if (!decoded.length || decoded.includes("\u0000")) {
      return null;
    }
    const normalized = decoded.replace(/\\/g, "/").replace(/^\/+/, "");
    if (!normalized.length || normalized.includes("..")) {
      return null;
    }
    return normalized;
  } catch {
    return null;
  }
}

function extractStorageKeyFromUrl(source: string | null | undefined): string | null {
  if (typeof source !== "string") return null;
  const trimmed = source.trim();
  if (!trimmed.length) return null;

  const seen = new Set<string>();

  const attemptFromUrl = (input: URL): string | null => {
    const signature = `${input.protocol}//${input.host}${input.pathname}?${input.search}`;
    if (seen.has(signature)) return null;
    seen.add(signature);

    const queryKey = normalizeStorageKey(input.searchParams.get("key"));
    if (queryKey) return queryKey;

    const proxyMatch = input.pathname.match(/\/api\/uploads\/r2\/object\/(.+)/);
    if (proxyMatch?.[1]) {
      return normalizeStorageKey(proxyMatch[1]);
    }

    if (input.pathname.startsWith("/api/uploads/raw-preview")) {
      const previewKey = normalizeStorageKey(input.searchParams.get("key"));
      if (previewKey) return previewKey;
    }

    if (input.pathname.startsWith("/cdn-cgi/image/")) {
      const segments = input.pathname.replace(/^\/+/, "").split("/");
      const encodedSource = segments.at(-1);
      if (encodedSource) {
        try {
          const decodedSource = decodeURIComponent(encodedSource);
          if (decodedSource.startsWith("http://") || decodedSource.startsWith("https://")) {
            const nested = new URL(decodedSource);
            const nestedKey = attemptFromUrl(nested);
            if (nestedKey) return nestedKey;
          } else {
            const normalized = normalizeStorageKey(decodedSource);
            if (normalized) return normalized;
          }
        } catch {
          /* ignore decode issues */
        }
      }
    }

    const bucket = serverEnv.R2_BUCKET?.trim();
    const account = serverEnv.R2_ACCOUNT_ID?.trim();
    if (bucket && account) {
      const suffix = ".r2.cloudflarestorage.com";
      const lowerBucket = bucket.toLowerCase();
      const accountHost = `${account.toLowerCase()}${suffix}`;
      const bucketHost = `${lowerBucket}.${accountHost}`;
      const candidateHost = input.host.toLowerCase();
      const strippedPath = input.pathname.replace(/^\/+/, "");
      const pathSegments = strippedPath.split("/");

      if (candidateHost === bucketHost) {
        return normalizeStorageKey(strippedPath);
      }
      if (candidateHost === accountHost && pathSegments[0]?.toLowerCase() === lowerBucket) {
        return normalizeStorageKey(pathSegments.slice(1).join("/"));
      }
      if (pathSegments[0]?.toLowerCase() === lowerBucket && pathSegments.length > 1) {
        return normalizeStorageKey(pathSegments.slice(1).join("/"));
      }
    }

    return null;
  };

  const candidates: URL[] = [];
  try {
    candidates.push(new URL(trimmed));
  } catch {
    try {
      candidates.push(new URL(trimmed, "https://example.invalid"));
    } catch {
      /* ignore invalid URLs */
    }
  }

  for (const candidate of candidates) {
    const derived = attemptFromUrl(candidate);
    if (derived) return derived;
  }

  const looseMatch = trimmed.match(/[?&]key=([^&#]+)/);
  if (looseMatch?.[1]) {
    const normalized = normalizeStorageKey(looseMatch[1]);
    if (normalized) return normalized;
  }

  return null;
}

function buildRawLikeFallbackVariants(
  originalUrl: string,
  {
    base,
    origin,
    storageKey,
    cloudflareEnabled,
  }: {
    base: string | null;
    origin: string | null;
    storageKey: string | null;
    cloudflareEnabled: boolean;
  },
): {
  thumb: string | null;
  feed: string | null;
  full: string | null;
} {
  const resolvedStorageKey = normalizeStorageKey(storageKey) ?? extractStorageKeyFromUrl(originalUrl);

  if (!resolvedStorageKey) {
    if (cloudflareEnabled) {
      const thumb = buildCloudflareImageUrl(
        originalUrl,
        {
          width: 640,
          height: 640,
          fit: "cover",
          gravity: "faces",
          quality: 88,
          format: "jpeg",
          sharpen: 1,
        },
        base ?? undefined,
        origin ?? undefined,
      );
      const feed = buildCloudflareImageUrl(
        originalUrl,
        {
          width: 1600,
          height: 1600,
          fit: "cover",
          gravity: "faces",
          quality: 90,
          format: "jpeg",
          sharpen: 1,
        },
        base ?? undefined,
        origin ?? undefined,
      );
      const full = buildCloudflareImageUrl(
        originalUrl,
        {
          width: 2400,
          fit: "contain",
          quality: 92,
          format: "jpeg",
        },
        base ?? undefined,
        origin ?? undefined,
      );
      return { thumb: thumb ?? null, feed: feed ?? null, full: full ?? null };
    }
    return { thumb: null, feed: null, full: null };
  }

  const encoded = encodeURIComponent(resolvedStorageKey);
  const basePath = `/api/uploads/raw-preview?key=${encoded}`;
  return {
    thumb: `${basePath}&size=thumb`,
    feed: `${basePath}&size=feed`,
    full: `${basePath}&size=full`,
  };
}

export async function queryPosts(options: PostsQueryInput): Promise<PostsQueryResult> {
  const parsedQuery = postsQuerySchema.safeParse({
    capsuleId: options.query.capsuleId ?? undefined,
    limit: options.query.limit ?? undefined,
    before: options.query.before ?? undefined,
    after: options.query.after ?? undefined,
  });

  if (!parsedQuery.success) {
    throw new PostsQueryError("invalid_query", "Query parameters failed validation", {
      status: 400,
      details: parsedQuery.error.flatten(),
    });
  }

  const { capsuleId, before, after, authorId, sort } = parsedQuery.data;
  const limit = parsedQuery.data.limit ?? 60;
  const viewerId = options.viewerId;
  const requestOrigin = options.origin ?? null;
  const defaultOrigin = serverEnv.SITE_URL;
  const originForAssets = requestOrigin ?? defaultOrigin;
  const orderBy =
    sort === "top" ? "likes_count" : sort === "hot" ? "hot_score" : ("created_at" as const);

  let cloudflareOriginCandidate = requestOrigin ?? defaultOrigin;
  if (!shouldUseCloudflareImagesForOrigin(cloudflareOriginCandidate)) {
    cloudflareOriginCandidate = defaultOrigin;
  }
  const cloudflareEnabled =
    typeof options.cloudflareEnabled === "boolean"
      ? options.cloudflareEnabled
      : shouldUseCloudflareImagesForOrigin(cloudflareOriginCandidate);
  const cloudflareOrigin = cloudflareEnabled ? cloudflareOriginCandidate : null;

  const sanitizeAttachment = (attachment: NormalizedAttachment): NormalizedAttachment => {
    const resolvedUrl = resolveToAbsoluteUrl(attachment.url, originForAssets) ?? attachment.url;
    const resolvedThumb = attachment.thumbnailUrl
      ? resolveToAbsoluteUrl(attachment.thumbnailUrl, originForAssets) ?? attachment.thumbnailUrl
      : attachment.thumbnailUrl ?? null;
    const variants = attachment.variants ?? null;
    let sanitizedVariants: CloudflareImageVariantSet | null = null;
    if (variants) {
      const cloned: CloudflareImageVariantSet = { ...variants };
      cloned.original =
        resolveToAbsoluteUrl(variants.original, originForAssets) ?? variants.original;
      if (Object.prototype.hasOwnProperty.call(variants, "thumb")) {
        if (variants.thumb == null) {
          cloned.thumb = null;
        } else {
          const sanitizedThumb = resolveToAbsoluteUrl(variants.thumb, originForAssets);
          cloned.thumb = sanitizedThumb ?? variants.thumb;
        }
      } else {
        delete cloned.thumb;
      }
      if (Object.prototype.hasOwnProperty.call(variants, "feed")) {
        if (variants.feed == null) {
          cloned.feed = null;
        } else {
          const sanitizedFeed = resolveToAbsoluteUrl(variants.feed, originForAssets);
          cloned.feed = sanitizedFeed ?? variants.feed;
        }
      } else {
        delete cloned.feed;
      }
      if (Object.prototype.hasOwnProperty.call(variants, "full")) {
        if (variants.full == null) {
          cloned.full = null;
        } else {
          const sanitizedFull = resolveToAbsoluteUrl(variants.full, originForAssets);
          cloned.full = sanitizedFull ?? variants.full;
        }
      } else {
        delete cloned.full;
      }
      if (Object.prototype.hasOwnProperty.call(variants, "promo")) {
        if (variants.promo == null) {
          cloned.promo = null;
        } else {
          const sanitizedPromo = resolveToAbsoluteUrl(variants.promo, originForAssets);
          cloned.promo = sanitizedPromo ?? variants.promo;
        }
      } else {
        delete cloned.promo;
      }
      if (Object.prototype.hasOwnProperty.call(variants, "promoSrcset")) {
        cloned.promoSrcset = variants.promoSrcset ?? null;
      } else {
        delete cloned.promoSrcset;
      }
      sanitizedVariants = cloned;
    }

    if (!cloudflareEnabled && sanitizedVariants) {
      sanitizedVariants = {
        original: resolvedUrl,
        feed: resolvedThumb ?? resolvedUrl,
        thumb: resolvedThumb ?? resolvedUrl,
        full: resolvedUrl,
        feedSrcset: null,
        promo: resolvedThumb ?? resolvedUrl,
        promoSrcset: null,
        fullSrcset: null,
      };
    }

    return {
      ...attachment,
      url: resolvedUrl,
      thumbnailUrl: resolvedThumb,
      variants: sanitizedVariants,
    };
  };

  let rows: PostsViewRow[];
  try {
    rows = await listPostsView({
      capsuleId: capsuleId ?? null,
      authorId: authorId ?? null,
      limit,
      after: after ?? null,
      before: before ?? null,
      orderBy,
    });
  } catch (error) {
    console.error("Fetch posts error", error);
    if (shouldReturnFallback(error)) {
      console.warn("Supabase unreachable - returning demo posts for local development.");
      return {
        posts: buildFallbackPosts(),
        deleted: [],
        cursor: null,
      };
    }
    throw new PostsQueryError("posts_fetch_failed", "Failed to load posts", {
      status: 500,
      cause: error,
    });
  }

  const deletedIds: string[] = [];
  const activeRows = rows.filter((row) => {
    if (row && (row as Record<string, unknown>).deleted_at) {
      const record = row as Record<string, unknown>;
      const id = record["client_id"] ?? record["id"];
      if (id) deletedIds.push(String(id));
      return false;
    }
    const visibilityRaw = (row as Record<string, unknown>)?.["visibility"];
    if (typeof visibilityRaw === "string") {
      const visibility = visibilityRaw.trim().toLowerCase();
      if (visibility && ["blocked", "hidden", "review", "safety_review"].includes(visibility)) {
        return false;
      }
    }
    return true;
  });

  const dbIds: string[] = [];
  const dbIdSet = new Set<string>();
  for (const row of activeRows) {
    const rawId = (row as Record<string, unknown>).id;
    const normalizedId =
      typeof rawId === "string" || typeof rawId === "number" ? String(rawId) : null;
    if (normalizedId && !dbIdSet.has(normalizedId)) {
      dbIdSet.add(normalizedId);
      dbIds.push(normalizedId);
    }
  }

  let viewerLikedIds: Set<string> = new Set<string>();
  if (viewerId && dbIds.length) {
    try {
      const likedIds = await listViewerLikedPostIds(viewerId, dbIds);
      viewerLikedIds = new Set(likedIds);
    } catch (viewerLikesError) {
      console.warn("viewer likes query failed", viewerLikesError);
    }
  }

  let viewerRememberedSet: Set<string> = new Set<string>();
  if (viewerId && activeRows.length) {
    const rememberIdSet = new Set<string>();

    for (const row of activeRows) {
      const rowRecord = row as Record<string, unknown>;
      const rawClientId = rowRecord["client_id"] ?? rowRecord["id"];
      const cid =
        typeof rawClientId === "string" || typeof rawClientId === "number"
          ? String(rawClientId)
          : null;
      if (cid) rememberIdSet.add(cid);

      const rawDbId = rowRecord["id"];
      const dbid =
        typeof rawDbId === "string" || typeof rawDbId === "number" ? String(rawDbId) : null;
      if (dbid) rememberIdSet.add(dbid);
    }

    const rememberIds = Array.from(rememberIdSet);
    if (rememberIds.length) {
      try {
        const rememberedIds = await listViewerRememberedPostIds(viewerId, rememberIds);
        viewerRememberedSet = new Set(rememberedIds);
      } catch (memFetchErr) {
        console.warn("viewer memories query failed", memFetchErr);
      }
    }
  }

  const posts: NormalizedPost[] = await Promise.all(
    activeRows.map(async (row) => {
      const rowRecord = row as Record<string, unknown>;
      const base = normalizePost(rowRecord);
      const normalized: NormalizedPost = { ...base };

      if (normalized.dbId && viewerLikedIds.has(normalized.dbId)) {
        normalized.viewerLiked = true;
      } else {
        normalized.viewerLiked = Boolean(normalized.viewerLiked);
      }

      const clientIdCandidate = rowRecord["client_id"] ?? rowRecord["id"];
      const cid =
        typeof clientIdCandidate === "string" || typeof clientIdCandidate === "number"
          ? String(clientIdCandidate)
          : null;
      if (cid && viewerRememberedSet.has(cid)) {
        normalized.viewerRemembered = true;
      } else {
        normalized.viewerRemembered = Boolean(normalized.viewerRemembered);
      }

      const accessibleMedia = await ensureAccessibleMediaUrl(normalized.mediaUrl);
      if (accessibleMedia) {
        normalized.mediaUrl =
          resolveToAbsoluteUrl(accessibleMedia, originForAssets) ?? accessibleMedia;
      } else {
        normalized.mediaUrl = accessibleMedia;
      }

      if (normalized.userAvatar) {
        normalized.userAvatar =
          resolveToAbsoluteUrl(normalized.userAvatar, originForAssets) ?? normalized.userAvatar;
      }

      return normalized;
    }),
  );

  if (posts.length) {
    const pollEntries = posts
      .map((post) => {
        if (!post.dbId || !post.poll || typeof post.poll !== "object" || Array.isArray(post.poll)) {
          return null;
        }
        return {
          post,
          dbId: post.dbId,
          poll: post.poll as Record<string, unknown>,
        };
      })
      .filter(
        (
          entry,
        ): entry is { post: NormalizedPost; dbId: string; poll: Record<string, unknown> } =>
          Boolean(entry),
      );

    if (pollEntries.length) {
      const pollDbIds = Array.from(new Set(pollEntries.map((entry) => entry.dbId)));
      const aggregateMap = new Map<string, Map<number, number>>();

      try {
        const aggregateRows = await listPollVoteAggregates(pollDbIds);
        aggregateRows.forEach((row) => {
          const postIdRaw = row.post_id;
          if (postIdRaw === null || postIdRaw === undefined) return;
          const postId = String(postIdRaw);
          const indexRaw = row.option_index;
          if (indexRaw === null || indexRaw === undefined) return;
          const index = Number(indexRaw);
          if (!Number.isFinite(index) || index < 0) return;
          const countRaw = row.vote_count ?? 0;
          const count =
            typeof countRaw === "number"
              ? countRaw
              : typeof countRaw === "bigint"
                ? Number(countRaw)
                : Number(countRaw ?? 0);
          if (!Number.isFinite(count) || count < 0) return;
          const existing = aggregateMap.get(postId) ?? new Map<number, number>();
          existing.set(index, Math.max(0, Math.trunc(count)));
          aggregateMap.set(postId, existing);
        });
      } catch (aggregateError) {
        console.warn("poll aggregate fetch failed", aggregateError);
      }

      const viewerVoteMap = new Map<string, number>();
      if (viewerId) {
        try {
          const viewerVotes = await listViewerPollVotes(pollDbIds, viewerId);
          viewerVotes.forEach((row) => {
            const postIdRaw = row.post_id;
            if (postIdRaw === null || postIdRaw === undefined) return;
            const postId = String(postIdRaw);
            const indexRaw = row.option_index;
            if (indexRaw === null || indexRaw === undefined) return;
            const index = Number(indexRaw);
            if (!Number.isFinite(index) || index < 0) return;
            viewerVoteMap.set(postId, Math.max(0, Math.trunc(index)));
          });
        } catch (viewerVoteError) {
          console.warn("viewer poll vote fetch failed", viewerVoteError);
        }
      }

      pollEntries.forEach(({ post, dbId, poll }) => {
        const record: Record<string, unknown> = { ...poll };
        const rawOptions = Array.isArray(record.options) ? record.options : [];
        const normalizedOptions = rawOptions.map((option, index) => {
          if (typeof option === "string") {
            const trimmed = option.trim();
            return trimmed.length ? trimmed : `Option ${index + 1}`;
          }
          if (typeof option === "number" && Number.isFinite(option)) {
            return String(option);
          }
          return `Option ${index + 1}`;
        });
        const aggregateForPost = aggregateMap.get(dbId) ?? null;
        let requiredLength = normalizedOptions.length;
        if (aggregateForPost && aggregateForPost.size) {
          aggregateForPost.forEach((_, key) => {
            if (key + 1 > requiredLength) requiredLength = key + 1;
          });
        }

        const existingCountsRaw = Array.isArray(record.counts) ? record.counts : null;
        if (!requiredLength && existingCountsRaw && existingCountsRaw.length) {
          requiredLength = existingCountsRaw.length;
        }
        while (normalizedOptions.length < requiredLength) {
          normalizedOptions.push(`Option ${normalizedOptions.length + 1}`);
        }

        const normalizeCountValue = (value: unknown): number => {
          if (typeof value === "number" && Number.isFinite(value)) return Math.max(0, Math.trunc(value));
          if (typeof value === "bigint") return Number(value);
          const numeric = Number(value ?? 0);
          if (!Number.isFinite(numeric)) return 0;
          return Math.max(0, Math.trunc(numeric));
        };

        let counts: number[] = [];
        if (aggregateForPost && aggregateForPost.size) {
          counts = Array.from({ length: normalizedOptions.length }, (_, index) =>
            normalizeCountValue(aggregateForPost.get(index) ?? 0),
          );
        } else if (existingCountsRaw && existingCountsRaw.length) {
          counts = Array.from({ length: normalizedOptions.length }, (_, index) =>
            normalizeCountValue(existingCountsRaw[index] ?? 0),
          );
        } else if (normalizedOptions.length) {
          counts = Array(normalizedOptions.length).fill(0);
        }

        const totalVotes = counts.length ? counts.reduce((sum, value) => sum + value, 0) : 0;

        if (counts.length) {
          record.counts = counts;
          record.totalVotes = totalVotes;
        } else {
          delete record.counts;
          delete record.totalVotes;
        }

        const viewerVote = viewerVoteMap.get(dbId);
        if (viewerVote !== undefined) {
          record.userVote = viewerVote;
        }

        record.options = normalizedOptions;
        post.poll = record as FeedPoll;
      });
    }

    const attachmentPostIds = posts
      .map((post) => post.id)
      .filter((value): value is string => Boolean(value));

    if (attachmentPostIds.length) {
      try {
        const attachmentRows = await listAttachmentsForPosts(attachmentPostIds);
        if (attachmentRows.length) {
          const sessionIdSet = new Set<string>();

          for (const row of attachmentRows) {
            const metaCandidate = (row?.meta ?? {}) as Record<string, unknown>;
            const sessionId = extractUploadSessionId(metaCandidate);
            if (sessionId) sessionIdSet.add(sessionId);
          }

          let uploadSessionMap = new Map<string, UploadSessionRecord>();
          if (sessionIdSet.size) {
            try {
              const sessionRecords = await listUploadSessionsByIds(Array.from(sessionIdSet));
              uploadSessionMap = new Map(sessionRecords.map((record) => [record.id, record]));
            } catch (sessionLookupError) {
              console.warn("upload session lookup failed", sessionLookupError);
            }
          }

          const attachmentsByPost = new Map<string, NormalizedAttachment[]>();

          const normalizedAttachments = await Promise.all(
            attachmentRows.map(async (row) => {
              const postId =
                typeof row?.post_id === "string" || typeof row?.post_id === "number"
                  ? String(row.post_id)
                  : null;
              if (!postId) return null;

              let url = await ensureAccessibleMediaUrl(
                typeof row?.media_url === "string" ? row.media_url : null,
              );
              if (!url) return null;

              const meta = (row?.meta ?? {}) as Record<string, unknown>;
              const uploadSessionId = extractUploadSessionId(meta);
              const sessionRecord = uploadSessionId
                ? (uploadSessionMap.get(uploadSessionId) ?? null)
                : null;
              const sessionMetadata = sessionRecord?.metadata ?? null;

              const storageKey =
                typeof meta?.storage_key === "string"
                  ? (meta.storage_key as string)
                  : typeof meta?.storageKey === "string"
                    ? (meta.storageKey as string)
                    : null;

              const thumbCandidate =
                typeof meta?.thumbnail_url === "string"
                  ? (meta.thumbnail_url as string)
                  : typeof meta?.thumbnailUrl === "string"
                    ? (meta.thumbnailUrl as string)
                    : typeof meta?.thumbUrl === "string"
                      ? (meta.thumbUrl as string)
                      : null;

              let derivedThumbUrl: string | null = null;
              let derivedPreviewUrl: string | null = null;
              let derivedVideoUrl: string | null = null;
              let derivedVideoMimeType: string | null = null;
              let derivedVideoPoster: string | null = null;
              let derivedVideoMeta: Record<string, unknown> | null = null;
              let derivedVideoProvider: string | null = null;

              if (sessionRecord?.derived_assets && Array.isArray(sessionRecord.derived_assets)) {
                for (const asset of sessionRecord.derived_assets) {
                  if (!asset || typeof asset !== "object") continue;
                  const assetType =
                    typeof (asset as { type?: unknown }).type === "string"
                      ? (asset as { type: string }).type
                      : null;
                  if (!assetType) continue;

                  if (assetType === "image.thumbnail" || assetType === "image.preview") {
                    const rawAssetUrl =
                      typeof (asset as { url?: unknown }).url === "string"
                        ? (asset as { url: string }).url
                        : null;
                    if (!rawAssetUrl) continue;

                    const safeAssetUrl = await ensureAccessibleMediaUrl(rawAssetUrl);
                    if (!safeAssetUrl) continue;

                    if (assetType === "image.thumbnail" && !derivedThumbUrl) {
                      derivedThumbUrl = safeAssetUrl;
                    } else if (assetType === "image.preview" && !derivedPreviewUrl) {
                      derivedPreviewUrl = safeAssetUrl;
                    }

                    if (derivedThumbUrl && derivedPreviewUrl && derivedVideoUrl) {
                      break;
                    }
                    continue;
                  }

                  if (assetType === "video.transcode") {
                    const rawAssetUrl =
                      typeof (asset as { url?: unknown }).url === "string"
                        ? (asset as { url: string }).url
                        : null;
                    const safeAssetUrl = rawAssetUrl ? await ensureAccessibleMediaUrl(rawAssetUrl) : null;
                    const assetMetaRaw =
                      asset && typeof (asset as { metadata?: unknown }).metadata === "object"
                        ? ((asset as { metadata: Record<string, unknown> }).metadata as Record<
                            string,
                            unknown
                          >)
                        : null;
                    const provider =
                      assetMetaRaw && typeof assetMetaRaw.provider === "string"
                        ? assetMetaRaw.provider
                        : null;
                    const status =
                      assetMetaRaw && typeof assetMetaRaw.status === "string"
                        ? assetMetaRaw.status
                        : null;
                    if (status && status !== "ready") {
                      continue;
                    }
                    const mp4Url =
                      assetMetaRaw && typeof assetMetaRaw.mp4_url === "string"
                        ? assetMetaRaw.mp4_url
                        : null;
                    const hlsUrl =
                      assetMetaRaw && typeof assetMetaRaw.hls_url === "string"
                        ? assetMetaRaw.hls_url
                        : null;
                    const posterUrl =
                      assetMetaRaw && typeof assetMetaRaw.poster_url === "string"
                        ? assetMetaRaw.poster_url
                        : null;
                    const mimeCandidate =
                      assetMetaRaw && typeof assetMetaRaw.mime_type === "string"
                        ? assetMetaRaw.mime_type
                        : mp4Url
                          ? "video/mp4"
                          : hlsUrl
                            ? "application/x-mpegURL"
                            : null;

                    if (!derivedVideoUrl) {
                      derivedVideoUrl = mp4Url ?? safeAssetUrl ?? hlsUrl ?? rawAssetUrl;
                    }
                    if (!derivedVideoMimeType && mimeCandidate) {
                      derivedVideoMimeType = mimeCandidate;
                    }
                    if (!derivedVideoPoster && posterUrl) {
                      const safePoster = await ensureAccessibleMediaUrl(posterUrl);
                      derivedVideoPoster = safePoster ?? posterUrl;
                    }
                    if (assetMetaRaw) {
                      derivedVideoMeta = derivedVideoMeta
                        ? mergeUploadMetadata(derivedVideoMeta, assetMetaRaw)
                        : { ...assetMetaRaw };
                    }
                    if (provider && !derivedVideoProvider) {
                      derivedVideoProvider = provider;
                    }
                  }
                }
              }

              let thumbnailUrl = derivedVideoPoster ?? derivedThumbUrl ?? null;
              if (!thumbnailUrl) {
                thumbnailUrl = await ensureAccessibleMediaUrl(thumbCandidate);
              }

              let mimeType =
                derivedVideoMimeType ??
                normalizeContentType(row?.media_type) ??
                readContentType(meta) ??
                normalizeContentType(sessionRecord?.content_type) ??
                readContentType(sessionMetadata);

              if (!mimeType) {
                mimeType =
                  guessMimeFromUrl(derivedVideoUrl ?? url) ??
                  guessMimeFromUrl(derivedPreviewUrl) ??
                  guessMimeFromUrl(derivedThumbUrl) ??
                  guessMimeFromUrl(storageKey);
              }

              if (!mimeType) {
                if (derivedVideoUrl) {
                  mimeType = derivedVideoMimeType ?? "video/mp4";
                } else if (derivedThumbUrl || derivedPreviewUrl) {
                  mimeType = "image/jpeg";
                }
              }

              if (derivedVideoUrl) {
                url = derivedVideoUrl;
              }

              let sanitizedMeta: Record<string, unknown> | null = null;
              try {
                const sanitizedPrimaryRaw = await sanitizeMemoryMeta(meta, originForAssets);
                const sanitizedSessionRaw = sessionMetadata
                  ? await sanitizeMemoryMeta(sessionMetadata, originForAssets)
                  : null;

                const baseMeta =
                  sanitizedSessionRaw &&
                  typeof sanitizedSessionRaw === "object" &&
                  !Array.isArray(sanitizedSessionRaw)
                    ? (sanitizedSessionRaw as Record<string, unknown>)
                    : sessionMetadata &&
                        typeof sessionMetadata === "object" &&
                        !Array.isArray(sessionMetadata)
                      ? (sessionMetadata as Record<string, unknown>)
                      : null;

                const updateMeta =
                  sanitizedPrimaryRaw &&
                  typeof sanitizedPrimaryRaw === "object" &&
                  !Array.isArray(sanitizedPrimaryRaw)
                    ? (sanitizedPrimaryRaw as Record<string, unknown>)
                    : meta && typeof meta === "object" && !Array.isArray(meta)
                      ? (meta as Record<string, unknown>)
                      : null;

                sanitizedMeta =
                  baseMeta || updateMeta ? mergeUploadMetadata(baseMeta, updateMeta ?? {}) : null;
              } catch (metaError) {
                console.warn("attachment meta sanitize failed", metaError);
                sanitizedMeta =
                  meta && typeof meta === "object" && !Array.isArray(meta)
                    ? { ...meta }
                    : null;
              }

              if (sessionRecord?.derived_assets && Array.isArray(sessionRecord.derived_assets)) {
                try {
                  const sanitizedDerivedAssets = await Promise.all(
                    sessionRecord.derived_assets.map(async (asset) => {
                      if (!asset || typeof asset !== "object" || Array.isArray(asset)) {
                        return asset as Record<string, unknown>;
                      }
                      const assetRecord = { ...(asset as Record<string, unknown>) };
                      if (typeof assetRecord.url === "string" && assetRecord.url.trim().length) {
                        const safeUrl = await ensureAccessibleMediaUrl(assetRecord.url);
                        if (safeUrl) {
                          assetRecord.url = safeUrl;
                        }
                      }
                      return assetRecord;
                    }),
                  );
                  if (sanitizedDerivedAssets.length) {
                    sanitizedMeta = mergeUploadMetadata(sanitizedMeta, {
                      derived_assets: sanitizedDerivedAssets,
                    });
                  }
                } catch (derivedError) {
                  console.warn("attachment derived asset sanitize failed", derivedError);
                }
              }

              if (derivedVideoMeta || derivedVideoProvider) {
                const videoMeta: Record<string, unknown> = derivedVideoMeta
                  ? { ...derivedVideoMeta }
                  : {};
                if (derivedVideoProvider && !("provider" in videoMeta)) {
                  videoMeta.provider = derivedVideoProvider;
                } else if (
                  derivedVideoProvider &&
                  typeof videoMeta.provider === "string" &&
                  !videoMeta.provider.trim().length
                ) {
                  videoMeta.provider = derivedVideoProvider;
                }
                sanitizedMeta = mergeUploadMetadata(sanitizedMeta ?? {}, { video: videoMeta });
              }

              const extraMeta: Record<string, unknown> = {};
              const memoryIdRaw = row?.id;
              if (typeof memoryIdRaw === "string" && memoryIdRaw.trim().length) {
                extraMeta.memory_id = memoryIdRaw.trim();
              } else if (typeof memoryIdRaw === "number") {
                extraMeta.memory_id = String(memoryIdRaw);
              }
              if (typeof row?.description === "string" && row.description.trim().length) {
                extraMeta.memory_description = row.description.trim();
              }
              const versionIndexRaw = (row as { version_index?: unknown }).version_index;
              if (typeof versionIndexRaw === "number" && Number.isFinite(versionIndexRaw)) {
                extraMeta.version_index = versionIndexRaw;
              } else if (typeof versionIndexRaw === "string") {
                const parsed = Number(versionIndexRaw);
                if (Number.isFinite(parsed)) {
                  extraMeta.version_index = parsed;
                }
              }
              const versionGroupRaw = (row as { version_group_id?: unknown }).version_group_id;
              if (typeof versionGroupRaw === "string" && versionGroupRaw.trim().length) {
                extraMeta.version_group_id = versionGroupRaw.trim();
              }
              const viewCountRaw = (row as { view_count?: unknown }).view_count;
              if (typeof viewCountRaw === "number" && Number.isFinite(viewCountRaw)) {
                extraMeta.view_count = viewCountRaw;
              } else if (typeof viewCountRaw === "string") {
                const parsed = Number(viewCountRaw);
                if (Number.isFinite(parsed)) {
                  extraMeta.view_count = parsed;
                }
              }
              const uploadedByRaw = (row as { uploaded_by?: unknown }).uploaded_by;
              if (typeof uploadedByRaw === "string" && uploadedByRaw.trim().length) {
                extraMeta.uploaded_by = uploadedByRaw.trim();
              }

              if (Object.keys(extraMeta).length) {
                sanitizedMeta = mergeUploadMetadata(sanitizedMeta, extraMeta);
              }

              let variants: CloudflareImageVariantSet | null = null;
              if (isLikelyImage(mimeType, url)) {
                if (cloudflareEnabled && cloudflareOrigin) {
                  variants = buildImageVariants(url, {
                    base: serverEnv.CLOUDFLARE_IMAGE_RESIZE_BASE_URL,
                    thumbnailUrl,
                    origin: cloudflareOrigin,
                  });
                } else {
                  variants = buildLocalImageVariants(url, thumbnailUrl ?? null, originForAssets ?? null);
                }
              }

              if (derivedThumbUrl || derivedPreviewUrl) {
                variants = variants
                  ? { ...variants }
                  : ({ original: url } as CloudflareImageVariantSet);
                if (derivedThumbUrl) {
                  variants.thumb = derivedThumbUrl;
                }
                if (derivedPreviewUrl) {
                  variants.feed = derivedPreviewUrl;
                  if (!variants.full) {
                    variants.full = derivedPreviewUrl;
                  }
                  if (!variants.promo) {
                    variants.promo = derivedPreviewUrl;
                    variants.promoSrcset = null;
                  }
                }
              }

              const rawLike =
                isRawLikeAttachment(mimeType, url, storageKey) ||
                isRawLikeAttachment(mimeType, derivedPreviewUrl, storageKey);
              if (rawLike) {
                const fallback = buildRawLikeFallbackVariants(url, {
                  base: serverEnv.CLOUDFLARE_IMAGE_RESIZE_BASE_URL ?? null,
                  origin: cloudflareOrigin,
                  storageKey: storageKey ?? null,
                  cloudflareEnabled,
                });
                if (fallback.thumb && (!thumbnailUrl || thumbnailUrl === url)) {
                  thumbnailUrl = fallback.thumb;
                }
                if (fallback.thumb || fallback.feed || fallback.full) {
                  variants = variants
                    ? { ...variants }
                    : ({ original: url } as CloudflareImageVariantSet);
                  if (fallback.thumb) {
                    const shouldOverrideThumb =
                      !variants.thumb ||
                      variants.thumb === url ||
                      variants.thumb.includes(".cloudflarestorage.com");
                    if (shouldOverrideThumb) {
                      variants.thumb = fallback.thumb;
                    }
                  }
                  if (fallback.feed) {
                    variants.feed = fallback.feed;
                    variants.feedSrcset = null;
                  }
                  if (fallback.full) {
                    variants.full = fallback.full;
                    variants.fullSrcset = null;
                  }
                  if (!variants.promo) {
                    const promoCandidate =
                      fallback.feed ?? fallback.full ?? variants.feed ?? variants.full ?? null;
                    variants.promo = promoCandidate;
                    variants.promoSrcset = promoCandidate ? null : variants.promoSrcset ?? null;
                  }
                }
              }

              const attachment: NormalizedAttachment = {
                id:
                  typeof row?.id === "string"
                    ? row.id
                    : typeof row?.id === "number"
                      ? String(row.id)
                      : safeRandomUUID(),
                url,
                mimeType: mimeType ?? null,
                name: typeof row?.title === "string" ? row.title : null,
                thumbnailUrl,
                storageKey: storageKey ?? null,
                uploadSessionId: uploadSessionId ?? null,
                variants,
                meta: sanitizedMeta ?? null,
              };

              return { postId, attachment };
            }),
          );

          for (const entry of normalizedAttachments) {
            if (!entry) continue;
            const existing = attachmentsByPost.get(entry.postId);
            if (existing) {
              existing.push(entry.attachment);
            } else {
              attachmentsByPost.set(entry.postId, [entry.attachment]);
            }
          }

          posts.forEach((post) => {
            const attachments =
              attachmentsByPost.get(post.id) ??
              (post.dbId ? attachmentsByPost.get(post.dbId) : undefined) ??
              [];
            if (!attachments.length) return;
            const sanitizedAttachments = attachments.map(sanitizeAttachment);
            post.attachments = sanitizedAttachments;
            const primary = sanitizedAttachments[0] ?? null;
            if (!primary) return;
            const preferredDisplay = pickBestDisplayVariant(primary.variants ?? null);
            if (cloudflareEnabled && preferredDisplay) {
              post.mediaUrl = preferredDisplay;
            } else if (!post.mediaUrl) {
              const fallbackMedia = primary.thumbnailUrl ?? primary.url;
              if (fallbackMedia) {
                post.mediaUrl = fallbackMedia;
              }
            }
          });
        }
      } catch (attachmentFetchError) {
        console.warn("attachments processing failed", attachmentFetchError);
      }
    }
  }

  const nextCursor =
    posts.length === limit ? (posts[posts.length - 1]?.ts ?? null) : null;

  return { posts, deleted: deletedIds, cursor: nextCursor };
}
