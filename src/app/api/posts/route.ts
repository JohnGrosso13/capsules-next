import { randomUUID } from "crypto";

import { ensureUserFromRequest } from "@/lib/auth/payload";
import type { IncomingUserPayload } from "@/lib/auth/payload";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { createPostRecord } from "@/lib/supabase/posts";
import { serverEnv } from "@/lib/env/server";
import { normalizeMediaUrl } from "@/lib/media";
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

function parsePublicStorageObject(url: string): { bucket: string; key: string } | null {
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
function rewriteR2MediaUrl(url: string): string | null {
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

    if (
      baseUrl &&
      candidateHost === baseUrl.host.toLowerCase()
    ) {
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
      const site = serverEnv.SITE_URL || "http://localhost:3000";
      const prefix = site.replace(/\/$/, "");
      const encodedKey = normalizedKey.split("/").map(encodeURIComponent).join("/");
      return `${prefix}/api/uploads/r2/object/${encodedKey}`;
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

async function ensureAccessibleMediaUrl(candidate: string | null): Promise<string | null> {
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

function normalizePost(row: Record<string, unknown>) {
  const dbId =
    typeof row.id === "string" || typeof row.id === "number" ? String(row.id) : undefined;

  return {
    id: (row.client_id ?? row.id) as string,
    dbId,
    kind: (row.kind as string) ?? "text",
    content: (row.content as string) ?? "",
    mediaUrl:
      normalizeMediaUrl(row["media_url"]) ??
      normalizeMediaUrl((row as Record<string, unknown>)["mediaUrl"]) ??
      null,
    mediaPrompt: ((row.media_prompt as string) ?? null) as string | null,
    userName: ((row.user_name as string) ?? null) as string | null,
    userAvatar: ((row.user_avatar as string) ?? null) as string | null,
    capsuleId: ((row.capsule_id as string) ?? null) as string | null,
    tags: Array.isArray(row.tags) ? (row.tags as string[]) : undefined,
    likes: typeof row.likes_count === "number" ? row.likes_count : 0,
    comments: typeof row.comments_count === "number" ? row.comments_count : undefined,
    hotScore: typeof row.hot_score === "number" ? row.hot_score : undefined,
    rankScore: typeof row.rank_score === "number" ? row.rank_score : undefined,
    ts: String(
      (row.created_at as string) ?? (row.updated_at as string) ?? new Date().toISOString(),
    ),
    source: String((row.source as string) ?? "web"),
    ownerUserId: ((row.author_user_id as string) ?? null) as string | null,
    viewerLiked:
      typeof row["viewer_liked"] === "boolean" ? (row["viewer_liked"] as boolean) : false,
    viewerRemembered:
      typeof row["viewer_remembered"] === "boolean"
        ? (row["viewer_remembered"] as boolean)
        : false,
  };
}

type NormalizedAttachment = {
  id: string;
  url: string;
  mimeType: string | null;
  name: string | null;
  thumbnailUrl: string | null;
  storageKey: string | null;
};


type NormalizedPost = ReturnType<typeof normalizePost> & {
  attachments?: NormalizedAttachment[];
};

const FALLBACK_POST_SEEDS: Array<Omit<NormalizedPost, "ts">> = [
  {
    id: "demo-welcome",
    dbId: "demo-welcome",
    kind: "text",
    content:
      "Welcome to Capsules! Connect your Supabase project to see real posts here. This demo post is only shown locally when the data source is offline.",
    mediaUrl: null,
    mediaPrompt: null,
    userName: "Capsules Demo Bot",
    userAvatar: null,
    capsuleId: null,
    tags: ["demo"],
    likes: 12,
    comments: 2,
    hotScore: 0,
    rankScore: 0,
    source: "demo",
    ownerUserId: null,
    viewerLiked: false,
    viewerRemembered: false,
    attachments: [],
  },
  {
    id: "demo-prompt-ideas",
    dbId: "demo-prompt-ideas",
    kind: "text",
    content:
      "Tip: Use the Generate button to draft a welcome message or poll. Once Supabase is configured you'll see the real-time feed here.",
    mediaUrl: null,
    mediaPrompt: null,
    userName: "Capsules Tips",
    userAvatar: null,
    capsuleId: null,
    tags: ["demo", "tips"],
    likes: 4,
    comments: 0,
    hotScore: 0,
    rankScore: 0,
    source: "demo",
    ownerUserId: null,
    viewerLiked: false,
    viewerRemembered: false,
    attachments: [],
  },
];

function buildFallbackPosts(): NormalizedPost[] {
  const now = Date.now();
  return FALLBACK_POST_SEEDS.map((seed, index) => ({
    ...seed,
    ts: new Date(now - index * 90_000).toISOString(),
  }));
}

function extractErrorMessage(error: unknown): string {
  if (!error) return "";
  if (error instanceof Error) return error.message ?? error.toString();
  if (typeof error === "string") return error;
  if (typeof error === "object") {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string") return message;
    const nested = (error as { error?: { message?: unknown } }).error?.message;
    if (typeof nested === "string") return nested;
  }
  return "";
}

function shouldReturnFallback(error: unknown): boolean {
  if (process.env.NODE_ENV === "production") return false;
  const message = extractErrorMessage(error).toLowerCase();
  if (!message) return false;
  return (
    message.includes("fetch failed") ||
    message.includes("failed to fetch") ||
    message.includes("econnrefused") ||
    message.includes("timed out") ||
    message.includes("network")
  );
}

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
              const thumbnailUrl = await ensureAccessibleMediaUrl(thumbCandidate);
              const attachment: NormalizedAttachment = {
                id:
                  typeof row?.id === "string"
                    ? row.id
                    : typeof row?.id === "number"
                      ? String(row.id)
                      : randomUUID(),
                url,
                mimeType:
                  typeof row?.media_type === "string" ? row.media_type : null,
                name: typeof row?.title === "string" ? row.title : null,
                thumbnailUrl,
                storageKey: storageKey ?? null,
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
            if (!post.mediaUrl) {
              const primary = attachments[0] ?? null;
              if (primary) {
                post.mediaUrl = primary.thumbnailUrl ?? primary.url;
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
