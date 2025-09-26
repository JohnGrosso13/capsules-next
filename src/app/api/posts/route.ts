import { ensureUserFromRequest } from "@/lib/auth/payload";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { createPostRecord } from "@/lib/supabase/posts";
import type { CreatePostInput } from "@/server/posts/types";
import { parseJsonBody, returnError, validatedJson } from "@/server/validation/http";
import {
  createPostRequestSchema,
  createPostResponseSchema,
  postsQuerySchema,
  postsResponseSchema,
} from "@/server/validation/schemas/posts";

function normalizeMediaUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const lowered = trimmed.toLowerCase();
  if (lowered === "null" || lowered === "undefined") return null;
  return trimmed;
}

function parsePublicStorageObject(url: string): { bucket: string; key: string } | null {
  try {
    const u = new URL(url);
    const m = u.pathname.match(/\/storage\/v1\/object\/public\/([^/]+)\/(.+)$/);
    if (!m) return null;
    return { bucket: decodeURIComponent(m[1]), key: decodeURIComponent(m[2]) };
  } catch {
    return null;
  }
}

async function ensureAccessibleMediaUrl(candidate: string | null): Promise<string | null> {
  const value = normalizeMediaUrl(candidate);
  if (!value) return null;
  const parsed = parsePublicStorageObject(value);
  if (!parsed) return value;
  try {
    const supabase = getSupabaseAdminClient();
    const signed = await supabase.storage.from(parsed.bucket).createSignedUrl(parsed.key, 3600 * 24 * 365);
    return signed.data?.signedUrl ?? value;
  } catch {
    return value;
  }
}

function normalizePost(row: Record<string, unknown>) {
  return {
    id: (row.client_id ?? row.id) as string,
    kind: (row.kind as string) ?? "text",
    content: (row.content as string) ?? "",
    mediaUrl:
      normalizeMediaUrl(row["media_url"]) ?? normalizeMediaUrl((row as Record<string, unknown>)["mediaUrl"]) ?? null,
    mediaPrompt: ((row.media_prompt as string) ?? null) as string | null,
    userName: ((row.user_name as string) ?? null) as string | null,
    userAvatar: ((row.user_avatar as string) ?? null) as string | null,
    capsuleId: ((row.capsule_id as string) ?? null) as string | null,
    tags: Array.isArray(row.tags) ? (row.tags as string[]) : undefined,
    likes: typeof row.likes_count === "number" ? row.likes_count : 0,
    comments: typeof row.comments_count === "number" ? row.comments_count : undefined,
    hotScore: typeof row.hot_score === "number" ? row.hot_score : undefined,
    rankScore: typeof row.rank_score === "number" ? row.rank_score : undefined,
    ts: String((row.created_at as string) ?? (row.updated_at as string) ?? new Date().toISOString()),
    source: String((row.source as string) ?? "web"),
    ownerUserId: ((row.author_user_id as string) ?? null) as string | null,
  };
}

type NormalizedPost = ReturnType<typeof normalizePost>;

const FALLBACK_POST_SEEDS: Array<Omit<NormalizedPost, "ts">> = [
  {
    id: "demo-welcome",
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
  },
  {
    id: "demo-prompt-ideas",
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
  const supabase = getSupabaseAdminClient();
  const url = new URL(req.url);
  const rawQuery = {
    capsuleId: url.searchParams.get("capsuleId") ?? undefined,
    limit: url.searchParams.get("limit") ?? undefined,
    before: url.searchParams.get("before") ?? undefined,
    after: url.searchParams.get("after") ?? undefined,
  };
  const parsedQuery = postsQuerySchema.safeParse(rawQuery);
  if (!parsedQuery.success) {
    return returnError(400, "invalid_query", "Query parameters failed validation", parsedQuery.error.flatten());
  }

  const { capsuleId, before, after } = parsedQuery.data;
  const limit = parsedQuery.data.limit ?? 60;

  let query = supabase
    .from("posts_view")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (capsuleId) query = query.eq("capsule_id", capsuleId);
  if (after) query = query.gt("created_at", after);
  if (before) query = query.lt("created_at", before);

  let data: Record<string, unknown>[] | null | undefined;
  let error: unknown;
  try {
    const result = await query;
    data = result.data;
    error = result.error;
  } catch (fetchError) {
    error = fetchError;
  }

  if (error) {
    console.error("Fetch posts error", error);
    if (shouldReturnFallback(error)) {
      console.warn("Supabase unreachable - returning demo posts for local development.");
      return validatedJson(postsResponseSchema, { posts: buildFallbackPosts(), deleted: [] });
    }
    return returnError(500, "posts_fetch_failed", "Failed to load posts");
  }

  const deletedIds: string[] = [];
  const activeRows = (data ?? []).filter((row) => {
    if (row && (row as Record<string, unknown>).deleted_at) {
      const id = (row as Record<string, unknown>).client_id ?? (row as Record<string, unknown>).id;
      if (id) deletedIds.push(String(id));
      return false;
    }
    return true;
  });

  const posts = await Promise.all(
    activeRows.map(async (row) => {
      const p = normalizePost(row as Record<string, unknown>);
      p.mediaUrl = await ensureAccessibleMediaUrl(p.mediaUrl);
      return p;
    }),
  );
  return validatedJson(postsResponseSchema, { posts, deleted: deletedIds });
}

export async function POST(req: Request) {
  const parsed = await parseJsonBody(req, createPostRequestSchema);
  if (!parsed.success) {
    return parsed.response;
  }

  const { post, user } = parsed.data;
  const userPayload = user ?? {};
  const ownerId = await ensureUserFromRequest(req, userPayload, { allowGuests: process.env.NODE_ENV !== "production" });
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
