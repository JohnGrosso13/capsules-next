import { getDatabaseAdminClient } from "@/config/database";
import { decorateDatabaseError, expectResult } from "@/lib/database/utils";

const db = getDatabaseAdminClient();

const NOT_FOUND_CODES = new Set(["PGRST116", "406"]);

export type PostsViewRow = Record<string, unknown>;

type PostLikeRow = {
  post_id: string | number | null;
};

type MemoryRow = {
  post_id: string | number | null;
};

type AttachmentRow = {
  id: string | number | null;
  post_id: string | number | null;
  media_url: string | null;
  media_type: string | null;
  title: string | null;
  meta: Record<string, unknown> | null;
};

type PostIdentifierRow = {
  id: string | number;
  client_id: string | null;
  author_user_id: string | null;
  media_url: string | null;
  deleted_at: string | null;
};

type ExistingPostRow = {
  id: string | number;
  capsule_id: string | null;
  media_url: string | null;
  media_prompt: string | null;
  user_name: string | null;
  user_avatar: string | null;
  source: string | null;
  created_at: string | null;
};

type UserProfileRow = {
  full_name: string | null;
  avatar_url: string | null;
};

type PostRow = {
  id: string;
};

type MemoryMetaRow = {
  id: string;
  meta: Record<string, unknown> | null;
};

type MemoryItemRow = {
  id: string;
};

export async function listPostsView(options: {
  capsuleId?: string | null;
  limit: number;
  after?: string | null;
  before?: string | null;
}): Promise<PostsViewRow[]> {
  let query = db
    .from("posts_view")
    .select<PostsViewRow>("*")
    .order("created_at", { ascending: false })
    .limit(options.limit);

  if (options.capsuleId) query = query.eq("capsule_id", options.capsuleId);
  if (options.after) query = query.gt("created_at", options.after);
  if (options.before) query = query.lt("created_at", options.before);

  const result = await query.fetch();
  if (result.error) throw decorateDatabaseError("posts.list", result.error);
  return result.data ?? [];
}

export async function listViewerLikedPostIds(
  viewerId: string,
  postIds: string[],
): Promise<string[]> {
  if (!postIds.length) return [];
  const result = await db
    .from("post_likes")
    .select<PostLikeRow>("post_id")
    .eq("user_id", viewerId)
    .in("post_id", postIds)
    .fetch();
  if (result.error) throw decorateDatabaseError("posts.viewerLikes", result.error);
  return (result.data ?? [])
    .map((entry) =>
      typeof entry?.post_id === "string" || typeof entry?.post_id === "number"
        ? String(entry.post_id)
        : null,
    )
    .filter((value): value is string => Boolean(value));
}

export async function listViewerRememberedPostIds(
  viewerId: string,
  candidateIds: string[],
): Promise<string[]> {
  if (!candidateIds.length) return [];
  const result = await db
    .from("memories")
    .select<MemoryRow>("post_id")
    .eq("owner_user_id", viewerId)
    .in("kind", ["post", "text"])
    .eq("meta->>source", "post_memory")
    .in("post_id", candidateIds)
    .fetch();
  if (result.error) throw decorateDatabaseError("posts.viewerRemembered", result.error);
  return (result.data ?? [])
    .map((row) =>
      typeof row?.post_id === "string" || typeof row?.post_id === "number"
        ? String(row.post_id)
        : null,
    )
    .filter((value): value is string => Boolean(value));
}

export async function listAttachmentsForPosts(postIds: string[]): Promise<AttachmentRow[]> {
  if (!postIds.length) return [];
  const result = await db
    .from("memories")
    .select<AttachmentRow>("id, post_id, media_url, media_type, title, meta")
    .in("post_id", postIds)
    .contains("meta", { source: "post_attachment" })
    .fetch();
  if (result.error) throw decorateDatabaseError("posts.attachments", result.error);
  return result.data ?? [];
}

export async function fetchPostRowByIdentifier(identifier: string): Promise<PostIdentifierRow | null> {
  const normalized = identifier.trim();
  if (!normalized) return null;

  const attempts: Array<{ column: string; value: string | number }> = [];
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (uuidRegex.test(normalized)) attempts.push({ column: "id", value: normalized });
  if (/^\d+$/.test(normalized)) attempts.push({ column: "id", value: Number(normalized) });
  attempts.push({ column: "client_id", value: normalized });

  for (const attempt of attempts) {
    const result = await db
      .from("posts")
      .select<PostIdentifierRow>("id, client_id, author_user_id, media_url, deleted_at")
      .eq(attempt.column, attempt.value)
      .maybeSingle();
    if (result.error) {
      if (NOT_FOUND_CODES.has(result.error.code ?? "")) continue;
      throw decorateDatabaseError("posts.fetchByIdentifier", result.error);
    }
    if (result.data) return result.data;
  }
  return null;
}

export async function fetchActivePostByClientId(clientId: string): Promise<ExistingPostRow | null> {
  const result = await db
    .from("posts")
    .select<ExistingPostRow>(
      "id, capsule_id, media_url, media_prompt, user_name, user_avatar, source, created_at",
    )
    .eq("client_id", clientId)
    .is("deleted_at", null)
    .maybeSingle();
  if (result.error) {
    if (NOT_FOUND_CODES.has(result.error.code ?? "")) return null;
    throw decorateDatabaseError("posts.fetchActive", result.error);
  }
  return result.data ?? null;
}

export async function resolvePostIdByClientId(clientId: string): Promise<string | null> {
  const result = await db
    .from("posts")
    .select<PostRow>("id")
    .eq("client_id", clientId)
    .is("deleted_at", null)
    .maybeSingle();
  if (result.error) {
    if (NOT_FOUND_CODES.has(result.error.code ?? "")) return null;
    throw decorateDatabaseError("posts.resolveId", result.error);
  }
  return result.data?.id ?? null;
}

export async function upsertCommentRow(row: Record<string, unknown>): Promise<string> {
  const result = await db
    .from("comments")
    .upsert([row], { onConflict: "client_id" })
    .select<PostRow>("id")
    .single();
  const data = expectResult(result, "posts.comments.upsert");
  return data.id;
}

export async function upsertPostRow(
  row: Record<string, unknown>,
  options?: Record<string, unknown>,
): Promise<string> {
  const result = await db
    .from("posts")
    .upsert([row], options)
    .select<PostRow>("id")
    .single();
  const data = expectResult(result, "posts.upsert");
  return data.id;
}

export async function fetchUserProfile(userId: string): Promise<UserProfileRow | null> {
  const result = await db
    .from("users")
    .select<UserProfileRow>("full_name, avatar_url")
    .eq("id", userId)
    .maybeSingle();
  if (result.error) {
    if (NOT_FOUND_CODES.has(result.error.code ?? "")) return null;
    throw decorateDatabaseError("posts.userProfile", result.error);
  }
  return result.data ?? null;
}

export async function listMemoriesByOwnerAndColumn(
  ownerId: string,
  column: string,
  value: string,
): Promise<MemoryMetaRow[]> {
  const result = await db
    .from("memories")
    .select<MemoryMetaRow>("id, meta")
    .eq("owner_user_id", ownerId)
    .eq(column, value)
    .fetch();
  if (result.error) throw decorateDatabaseError("posts.memories.select", result.error);
  return result.data ?? [];
}

export async function updateMemoryById(id: string, payload: Record<string, unknown>) {
  const result = await db
    .from("memories")
    .update(payload)
    .eq("id", id)
    .fetch();
  if (result.error) throw decorateDatabaseError("posts.memories.update", result.error);
}

export async function updateLegacyMemoryItems(
  ownerId: string,
  column: string,
  value: string,
  payload: Record<string, unknown>,
): Promise<number> {
  const result = await db
    .from("memory_items")
    .update(payload)
    .eq("owner_user_id", ownerId)
    .eq(column, value)
    .select<MemoryItemRow>("id")
    .fetch();
  if (result.error) throw decorateDatabaseError("posts.memoryItems.update", result.error);
  return (result.data ?? []).length;
}
