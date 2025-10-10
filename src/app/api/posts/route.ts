import { randomUUID } from "crypto";

import { buildImageVariants, pickBestDisplayVariant } from "@/lib/cloudflare/images";
import type { CloudflareImageVariantSet } from "@/lib/cloudflare/images";
import { ensureUserFromRequest } from "@/lib/auth/payload";
import type { IncomingUserPayload } from "@/lib/auth/payload";
import { createPostRecord } from "@/lib/supabase/posts";
import { serverEnv } from "@/lib/env/server";
import { listUploadSessionsByIds } from "@/server/memories/uploads";
import type { UploadSessionRecord } from "@/server/memories/uploads";
import {
  ensureAccessibleMediaUrl,
  extractUploadSessionId,
  guessMimeFromUrl,
  isLikelyImage,
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
  listPostsView,
  listViewerLikedPostIds,
  listViewerRememberedPostIds,
  type PostsViewRow,
} from "@/server/posts/repository";
import type { CreatePostInput } from "@/server/posts/types";
import { parseJsonBody, returnError, validatedJson } from "@/server/validation/http";
import {
  createPostRequestSchema,
  createPostResponseSchema,
  postsQuerySchema,
  postsResponseSchema,
} from "@/server/validation/schemas/posts";

export const runtime = "nodejs";

export async function GET(req: Request) {
  let viewerId: string | null = null;

  try {

    viewerId = await ensureUserFromRequest(req, null, { allowGuests: false });

  } catch (viewerError) {

    console.warn("posts viewer resolve failed", viewerError);

  }



  const url = new URL(req.url);

  const rawQuery = {

    capsuleId: url.searchParams.get("capsuleId") ?? undefined,

    limit: url.searchParams.get("limit") ?? undefined,

    before: url.searchParams.get("before") ?? undefined,

    after: url.searchParams.get("after") ?? undefined,

  };

  const parsedQuery = postsQuerySchema.safeParse(rawQuery);

  if (!parsedQuery.success) {

    return returnError(

      400,

      "invalid_query",

      "Query parameters failed validation",

      parsedQuery.error.flatten(),

    );

  }



  const { capsuleId, before, after } = parsedQuery.data;

  const limit = parsedQuery.data.limit ?? 60;



  let rows: PostsViewRow[];

  try {

    rows = await listPostsView({

      capsuleId: capsuleId ?? null,

      limit,

      after: after ?? null,

      before: before ?? null,

    });

  } catch (error) {

    console.error("Fetch posts error", error);

    if (shouldReturnFallback(error)) {

      console.warn("Supabase unreachable - returning demo posts for local development.");

      return validatedJson(postsResponseSchema, { posts: buildFallbackPosts(), deleted: [] });

    }

    return returnError(500, "posts_fetch_failed", "Failed to load posts");

  }



  const deletedIds: string[] = [];

  const activeRows = rows.filter((row) => {

    if (row && (row as Record<string, unknown>).deleted_at) {

      const id = (row as Record<string, unknown>).client_id ?? (row as Record<string, unknown>).id;

      if (id) deletedIds.push(String(id));

      return false;

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

        typeof rawDbId === "string" || typeof rawDbId === "number"

          ? String(rawDbId)

          : null;

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

      normalized.mediaUrl = await ensureAccessibleMediaUrl(normalized.mediaUrl);

      return normalized;

    }),

  );



  if (posts.length) {

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

              const url = await ensureAccessibleMediaUrl(

                typeof row?.media_url === "string" ? row.media_url : null,

              );

              if (!url) return null;


              const meta = (row?.meta ?? {}) as Record<string, unknown>;

              const uploadSessionId = extractUploadSessionId(meta);

              const sessionRecord = uploadSessionId ? uploadSessionMap.get(uploadSessionId) ?? null : null;

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

              if (sessionRecord?.derived_assets && Array.isArray(sessionRecord.derived_assets)) {

                for (const asset of sessionRecord.derived_assets) {

                  if (!asset || typeof asset !== "object") continue;

                  const assetType =

                    typeof (asset as { type?: unknown }).type === "string"

                      ? (asset as { type: string }).type

                      : null;

                  if (!assetType) continue;

                  if (assetType !== "image.thumbnail" && assetType !== "image.preview") {

                    continue;

                  }

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

                  if (derivedThumbUrl && derivedPreviewUrl) {

                    break;

                  }

                }

              }

              let thumbnailUrl = derivedThumbUrl ?? null;

              if (!thumbnailUrl) {

                thumbnailUrl = await ensureAccessibleMediaUrl(thumbCandidate);

              }

              let mimeType =

                normalizeContentType(row?.media_type) ??

                readContentType(meta) ??

                normalizeContentType(sessionRecord?.content_type) ??

                readContentType(sessionMetadata);

              if (!mimeType) {

                mimeType =

                  guessMimeFromUrl(url) ??

                  guessMimeFromUrl(derivedPreviewUrl) ??

                  guessMimeFromUrl(derivedThumbUrl) ??

                  guessMimeFromUrl(storageKey);

              }

              if (!mimeType && (derivedThumbUrl || derivedPreviewUrl)) {

                mimeType = "image/jpeg";

              }

              let variants: CloudflareImageVariantSet | null =

                isLikelyImage(mimeType, url)

                  ? buildImageVariants(url, {

                      base: serverEnv.CLOUDFLARE_IMAGE_RESIZE_BASE_URL,

                      thumbnailUrl,

                      origin: serverEnv.SITE_URL,

                    })

                  : null;

              if (derivedThumbUrl || derivedPreviewUrl) {

                variants = variants ? { ...variants } : ({ original: url } as CloudflareImageVariantSet);

                if (derivedThumbUrl) {

                  variants.thumb = derivedThumbUrl;

                }

                if (derivedPreviewUrl) {

                  variants.feed = derivedPreviewUrl;

                  if (!variants.full) {

                    variants.full = derivedPreviewUrl;

                  }

                }

              }

              const attachment: NormalizedAttachment = {

                id:

                  typeof row?.id === "string"

                    ? row.id

                    : typeof row?.id === "number"

                      ? String(row.id)

                      : randomUUID(),

                url,

                mimeType: mimeType ?? null,

                name: typeof row?.title === "string" ? row.title : null,

                thumbnailUrl,

                storageKey: storageKey ?? null,

                uploadSessionId: uploadSessionId ?? null,

                variants,

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

            post.attachments = attachments;

            const primary = attachments[0] ?? null;

            if (!primary) return;

            const preferredDisplay = pickBestDisplayVariant(primary.variants ?? null);

            if (preferredDisplay) {
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



  return validatedJson(postsResponseSchema, { posts, deleted: deletedIds });

}



export async function POST(req: Request) {

  const parsed = await parseJsonBody(req, createPostRequestSchema);

  if (!parsed.success) {

    return parsed.response;

  }



  const { post, user } = parsed.data;

  const userPayload = (user ?? {}) as IncomingUserPayload;

  const ownerId = await ensureUserFromRequest(req, userPayload, {

    allowGuests: process.env.NODE_ENV !== "production",

  });

  if (!ownerId) {

    return returnError(401, "auth_required", "Authentication required");

  }



  try {

    const id = await createPostRecord(post as CreatePostInput, ownerId);

    return validatedJson(createPostResponseSchema, { success: true, id });

  } catch (error) {

    console.error("Persist post error", error);

    return returnError(500, "post_save_failed", "Failed to save post");

  }

}





