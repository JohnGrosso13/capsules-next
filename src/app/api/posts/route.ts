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

function normalizePost(row: Record<string, unknown>) {
  return {
    id: (row.client_id ?? row.id) as string,
    kind: (row.kind as string) ?? "text",
    content: (row.content as string) ?? "",
    mediaUrl: ((row.media_url as string) ?? null) as string | null,
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

  const { data, error } = await query;
  if (error) {
    console.error("Fetch posts error", error);
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

  const posts = activeRows.map((row) => normalizePost(row as Record<string, unknown>));
  return validatedJson(postsResponseSchema, { posts, deleted: deletedIds });
}

export async function POST(req: Request) {
  const parsed = await parseJsonBody(req, createPostRequestSchema);
  if (!parsed.success) {
    return parsed.response;
  }

  const { post, user } = parsed.data;
  const userPayload = user ?? {};
  const ownerId = await ensureUserFromRequest(req, userPayload);
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

