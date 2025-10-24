import { getDatabaseAdminClient } from "@/config/database";
import { decorateDatabaseError, expectResult } from "@/lib/database/utils";
import type { DatabaseError } from "@/ports/database";

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
  description: string | null;
  meta: Record<string, unknown> | null;
  version_index?: number | null;
  version_group_id?: string | null;
  view_count?: number | null;
  uploaded_by?: string | null;
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

type CommentDbRow = {
  id: string | number | null;
  client_id: string | number | null;
  post_id: string | null;
  content: string | null;
  user_name: string | null;
  user_avatar: string | null;
  capsule_id: string | null;
  created_at: string | null;
};

type PostCoreDbRow = {
  id: string | number | null;
  client_id: string | number | null;
  content: string | null;
  user_name: string | null;
  media_url: string | null;
  author_user_id: string | null;
  media_prompt?: string | null;
  poll?: unknown;
};

type OwnedPostDbRow = {
  id: string | number | null;
  client_id: string | null;
};

type MemoryIdDbRow = {
  id: string | number | null;
};

type MemoryRecordDbRow = {
  id: string | number | null;
  owner_user_id?: string | null;
  kind?: string | null;
  post_id?: string | null;
  title?: string | null;
  description?: string | null;
  media_url?: string | null;
  media_type?: string | null;
  meta?: Record<string, unknown> | null;
};

type PostLikesCountRow = {
  likes_count: number | null;
};

type PollVoteDbRow = {
  option_index: number | null;
};

type PollVoteAggregateRow = {
  post_id: string | number | null;
  option_index: number | null;
  vote_count: number | null;
};

type PollVoteViewerRow = {
  post_id: string | number | null;
  option_index: number | null;
};

function isMissingPollVotesTable(error: DatabaseError | null): boolean {
  if (!error) return false;
  const code = (error.code ?? "").toUpperCase();
  const message = (error.message ?? "").toLowerCase();
  if (code === "PGRST205" || code === "42P01") return true;
  return message.includes("poll_votes");
}

function decodePollFromMediaPrompt(raw: unknown): unknown | null {
  if (typeof raw !== "string") return null;
  if (!raw.startsWith("__POLL__")) return null;
  try {
    return JSON.parse(raw.slice(8));
  } catch {
    return null;
  }
}

function attachPollFromMediaPrompt(row: PostCoreDbRow | null): PostCoreDbRow | null {
  if (!row) return null;
  if (typeof row.poll !== "undefined" && row.poll !== null) return row;
  const decoded = decodePollFromMediaPrompt(row.media_prompt ?? null);
  if (decoded === null) return row;
  return { ...row, poll: decoded };
}
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
    .select<AttachmentRow>(
      "id, post_id, media_url, media_type, title, description, meta, version_index, version_group_id, view_count, uploaded_by",
    )
    .in("post_id", postIds)
    .eq("is_latest", true)
    .contains("meta", { source: "post_attachment" })
    .fetch();
  if (result.error) throw decorateDatabaseError("posts.attachments", result.error);
  return result.data ?? [];
}

export async function fetchPostRowByIdentifier(
  identifier: string,
): Promise<PostIdentifierRow | null> {
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
  const result = await db.from("posts").upsert([row], options).select<PostRow>("id").single();
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
  const result = await db.from("memories").update(payload).eq("id", id).fetch();
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
  if (result.error) {
    const code = ((result.error as { code?: string })?.code ?? "").toUpperCase();
    if (code === "PGRST205") {
      return 0;
    }
    throw decorateDatabaseError("posts.memoryItems.update", result.error);
  }
  return (result.data ?? []).length;
}

export async function listCommentsForPost(postId: string, limit = 200): Promise<CommentDbRow[]> {
  const result = await db
    .from("comments")
    .select<CommentDbRow>(
      "id, client_id, post_id, content, user_name, user_avatar, capsule_id, created_at",
    )
    .eq("post_id", postId)
    .order("created_at", { ascending: true })
    .limit(limit)
    .fetch();
  if (result.error) throw decorateDatabaseError("posts.comments.list", result.error);
  return result.data ?? [];
}

export async function fetchPostCoreById(postId: string): Promise<PostCoreDbRow | null> {
  const result = await db
    .from("posts")
    .select<PostCoreDbRow>(
      "id, client_id, content, user_name, media_url, author_user_id, media_prompt, poll",
    )
    .eq("id", postId)
    .maybeSingle();
  if (result.error) {
    const code = (result.error.code ?? "").toUpperCase();
    const message = result.error.message ?? "";
    if (
      code === "42703" ||
      message.includes("column posts.poll") ||
      message.includes('column "poll"')
    ) {
      const fallback = await db
        .from("posts")
        .select<PostCoreDbRow>(
          "id, client_id, content, user_name, media_url, author_user_id, media_prompt",
        )
        .eq("id", postId)
        .maybeSingle();
      if (fallback.error) {
        const fallbackCode = (fallback.error.code ?? "").toUpperCase();
        if (NOT_FOUND_CODES.has(fallbackCode)) return null;
        throw decorateDatabaseError("posts.fetchCore", fallback.error);
      }
      return attachPollFromMediaPrompt(fallback.data ?? null);
    }
    if (NOT_FOUND_CODES.has(code)) return null;
    throw decorateDatabaseError("posts.fetchCore", result.error);
  }
  return attachPollFromMediaPrompt(result.data ?? null);
}

export async function upsertPostLike(postId: string, userId: string): Promise<void> {
  const result = await db
    .from("post_likes")
    .upsert(
      [
        {
          post_id: postId,
          user_id: userId,
        },
      ],
      { onConflict: "post_id,user_id" },
    )
    .select<PostLikeRow>("post_id")
    .fetch();
  if (result.error) throw decorateDatabaseError("posts.likes.upsert", result.error);
}

export async function deletePostLike(postId: string, userId: string): Promise<number> {
  const result = await db
    .from("post_likes")
    .delete()
    .eq("post_id", postId)
    .eq("user_id", userId)
    .select<PostLikeRow>("post_id")
    .fetch();
  if (result.error) throw decorateDatabaseError("posts.likes.delete", result.error);
  return (result.data ?? []).length;
}

export async function listMemoryIdsForPostOwnerAndSource(
  ownerId: string,
  postId: string,
  source: string,
  kind?: string | null,
): Promise<string[]> {
  let query = db
    .from("memories")
    .select<MemoryIdDbRow>("id")
    .eq("owner_user_id", ownerId)
    .eq("post_id", postId)
    .filter("meta->>source", "eq", source);
  if (kind) {
    query = query.eq("kind", kind);
  }
  const result = await query.fetch();
  if (result.error) throw decorateDatabaseError("posts.memories.listBySource", result.error);
  return (result.data ?? [])
    .map((row) =>
      typeof row?.id === "string" || typeof row?.id === "number" ? String(row.id) : null,
    )
    .filter((value): value is string => Boolean(value));
}

export async function deleteMemoriesByOwnerPostAndSource(
  ownerId: string,
  postId: string,
  source: string,
  kind?: string | null,
): Promise<number> {
  let query = db
    .from("memories")
    .delete()
    .eq("owner_user_id", ownerId)
    .eq("post_id", postId)
    .filter("meta->>source", "eq", source)
    .select<MemoryIdDbRow>("id");
  if (kind) {
    query = query.eq("kind", kind);
  }
  const result = await query.fetch();
  if (result.error) throw decorateDatabaseError("posts.memories.deleteBySource", result.error);
  return (result.data ?? []).length;
}

export async function fetchPostLikesCount(postId: string): Promise<number> {
  const result = await db
    .from("posts_view")
    .select<PostLikesCountRow>("likes_count")
    .eq("id", postId)
    .maybeSingle();
  if (result.error) {
    if (NOT_FOUND_CODES.has(result.error.code ?? "")) return 0;
    throw decorateDatabaseError("posts.metrics.likes", result.error);
  }
  return Number(result.data?.likes_count ?? 0);
}

export async function softDeletePostById(postId: string, deletionTime: string): Promise<void> {
  const result = await db
    .from("posts")
    .update({ deleted_at: deletionTime, updated_at: deletionTime })
    .eq("id", postId)
    .select<PostRow>("id")
    .maybeSingle();
  if (result.error) throw decorateDatabaseError("posts.softDelete", result.error);
}

export async function listOwnedPostClientIds(ownerId: string): Promise<string[]> {
  const result = await db
    .from("posts")
    .select<OwnedPostDbRow>("id, client_id")
    .eq("author_user_id", ownerId)
    .is("deleted_at", null)
    .fetch();
  if (result.error) throw decorateDatabaseError("posts.owned", result.error);
  return (result.data ?? [])
    .map((row) => {
      if (typeof row?.client_id === "string" && row.client_id.trim()) return row.client_id.trim();
      if (typeof row?.client_id === "number") return String(row.client_id);
      if (typeof row?.id === "string" || typeof row?.id === "number") return String(row.id);
      return null;
    })
    .filter((value): value is string => Boolean(value));
}

export async function upsertPostMemory(options: {
  ownerId: string;
  postId: string;
  kind: string;
  title: string | null;
  description: string | null;
  mediaUrl: string | null;
  mediaType: string | null;
  metadata: Record<string, unknown> | null;
}): Promise<void> {
  const result = await db.rpc("upsert_post_memory", {
    p_owner_user_id: options.ownerId,
    p_post_id: options.postId,
    p_kind: options.kind,
    p_title: options.title,
    p_description: options.description,
    p_media_url: options.mediaUrl,
    p_media_type: options.mediaType,
    p_meta: options.metadata,
  });
  if (result.error) throw decorateDatabaseError("posts.memories.upsert", result.error);
}

export async function fetchLatestPostMemoryRecord(options: {
  ownerId: string;
  postId: string;
  source: string;
  kind?: string | null;
}): Promise<MemoryRecordDbRow | null> {
  let query = db
    .from("memories")
    .select<MemoryRecordDbRow>(
      "id, owner_user_id, kind, post_id, title, description, media_url, media_type, meta",
    )
    .eq("owner_user_id", options.ownerId)
    .eq("post_id", options.postId)
    .filter("meta->>source", "eq", options.source)
    .order("updated_at", { ascending: false })
    .limit(1);
  if (options.kind) {
    query = query.eq("kind", options.kind);
  }
  const result = await query.maybeSingle();
  if (result.error) {
    if (NOT_FOUND_CODES.has(result.error.code ?? "")) return null;
    throw decorateDatabaseError("posts.memories.fetchLatest", result.error);
  }
  return result.data ?? null;
}

export async function updateMemoryTitleForOwner(options: {
  ownerId: string;
  memoryId: string;
  title: string;
  kind?: string | null;
}): Promise<void> {
  let query = db
    .from("memories")
    .update({ title: options.title })
    .eq("owner_user_id", options.ownerId)
    .eq("id", options.memoryId)
    .select<MemoryIdDbRow>("id");
  if (options.kind) {
    query = query.eq("kind", options.kind);
  }
  const result = await query.fetch();
  if (result.error) throw decorateDatabaseError("posts.memories.updateTitle", result.error);
}

export async function upsertPollVote(
  postId: string,
  userKey: string,
  optionIndex: number,
  userId?: string | null,
): Promise<void> {
  const result = await db
    .from("poll_votes")
    .upsert(
      [
        {
          post_id: postId,
          user_key: userKey,
          user_id: userId ?? null,
          option_index: optionIndex,
        },
      ],
      { onConflict: "post_id,user_key" },
    )
    .select<PollVoteDbRow>("option_index")
    .fetch();
  if (result.error) {
    if (isMissingPollVotesTable(result.error)) {
      console.warn("poll_votes table missing; skipping vote persistence");
      return;
    }
    throw decorateDatabaseError("posts.polls.vote", result.error);
  }
}

export async function listPollVotesForPost(postId: string, limit = 5000): Promise<PollVoteDbRow[]> {
  const result = await db
    .from("poll_votes")
    .select<PollVoteDbRow>("option_index")
    .eq("post_id", postId)
    .limit(limit)
    .fetch();
  if (result.error) {
    if (isMissingPollVotesTable(result.error)) {
      console.warn("poll_votes table missing; returning empty vote list");
      return [];
    }
    throw decorateDatabaseError("posts.polls.votes", result.error);
  }
  return result.data ?? [];
}

export async function updatePostPollJson(postId: string, poll: unknown): Promise<void> {
  const result = await db.from("posts").update({ poll }).eq("id", postId).fetch();
  if (result.error) {
    const code = (result.error.code ?? "").toUpperCase();
    const message = result.error.message ?? "";
    if (code === "42703" || message.includes("'poll'") || message.includes('column "poll"')) {
      console.warn("posts.poll column missing; skipping poll update");
      return;
    }
    throw decorateDatabaseError("posts.polls.update", result.error);
  }
}

export async function listPollVoteAggregates(postIds: string[]): Promise<PollVoteAggregateRow[]> {
  if (!postIds.length) return [];
  const result = await db.rpc<PollVoteAggregateRow>("poll_vote_counts", { post_ids: postIds });
  if (result.error) {
    if (isMissingPollVotesTable(result.error)) {
      console.warn("poll_votes table missing; returning empty aggregated vote list");
      return [];
    }
    throw decorateDatabaseError("posts.polls.aggregate", result.error);
  }
  return result.data ?? [];
}

export async function listViewerPollVotes(
  postIds: string[],
  userId: string,
): Promise<PollVoteViewerRow[]> {
  if (!postIds.length) return [];
  const result = await db
    .from("poll_votes")
    .select<PollVoteViewerRow>("post_id, option_index")
    .eq("user_id", userId)
    .in("post_id", postIds)
    .fetch();
  if (result.error) {
    if (isMissingPollVotesTable(result.error)) {
      console.warn("poll_votes table missing; returning empty viewer vote list");
      return [];
    }
    throw decorateDatabaseError("posts.polls.viewerVotes", result.error);
  }
  return result.data ?? [];
}
