"use server";

import { normalizeMediaUrl } from "@/lib/media";
import { resolvePostId } from "@/lib/supabase/posts";
import { ensureUserSession } from "@/server/actions/session";
import {
  deletePostLike,
  deleteMemoriesByOwnerPostAndSource,
  fetchLatestPostMemoryRecord,
  fetchPostCoreById,
  fetchPostLikesCount,
  listMemoryIdsForPostOwnerAndSource,
  upsertPostLike,
  upsertPostMemory,
} from "@/server/posts/repository";
import { embedText } from "@/lib/ai/openai";
import { deleteMemoryVectors, upsertMemoryVector } from "@/services/memories/vector-store";

type ToggleFeedLikeInput = {
  postId: string;
  like: boolean;
};

type ToggleFeedMemoryInput = {
  postId: string;
  remember: boolean;
  payload?: Record<string, unknown> | null;
};

export async function toggleFeedLikeAction(
  input: ToggleFeedLikeInput,
): Promise<{ likes: number; viewerLiked: boolean }> {
  const { supabaseUserId } = await ensureUserSession();
  if (!supabaseUserId) {
    throw new Error("Authentication required");
  }

  const postId = await resolvePostId(input.postId);
  if (!postId) {
    throw new Error("Post not found");
  }

  try {
    if (input.like) {
      await upsertPostLike(postId, supabaseUserId);
    } else {
      await deletePostLike(postId, supabaseUserId);
    }
  } catch (error) {
    console.error("toggleFeedLikeAction failed", error);
    throw new Error("Failed to update like");
  }

  let likes = 0;
  try {
    likes = await fetchPostLikesCount(postId);
  } catch (metricsError) {
    console.warn("Like metrics fetch failed", metricsError);
  }

  return { likes, viewerLiked: input.like };
}

function truncateContent(value: string | null | undefined, limit = 220): string | null {
  if (!value) return null;
  const normalized = value.replace(/\s+/g, " ").trim();
  if (!normalized.length) return null;
  return normalized.length > limit ? `${normalized.slice(0, limit - 1)}...` : normalized;
}

export async function toggleFeedMemoryAction(
  input: ToggleFeedMemoryInput,
): Promise<{ remembered: boolean }> {
  const { supabaseUserId } = await ensureUserSession();
  if (!supabaseUserId) {
    throw new Error("Authentication required");
  }

  const postId = await resolvePostId(input.postId);
  if (!postId) {
    throw new Error("Post not found");
  }

  let postCore: Awaited<ReturnType<typeof fetchPostCoreById>> | null = null;
  try {
    postCore = await fetchPostCoreById(postId);
  } catch (fetchError) {
    console.warn("toggleFeedMemoryAction post fetch failed", fetchError);
  }

  const postClientId = postCore?.client_id ? String(postCore.client_id) : null;
  const postUuid = postCore?.id ? String(postCore.id) : null;
  const memoryPostId = postClientId ?? postUuid ?? input.postId;

  const payload = input.payload ?? null;
  const payloadUserName =
    payload && typeof payload["userName"] === "string" && payload["userName"].trim()
      ? (payload["userName"] as string).trim()
      : null;
  const postAuthorName =
    (typeof postCore?.user_name === "string" && postCore.user_name ? postCore.user_name : null) ??
    payloadUserName;
  const postOwnerUserId = postCore?.author_user_id ? String(postCore.author_user_id) : null;
  const postContent =
    typeof postCore?.content === "string"
      ? postCore.content
      : typeof payload?.["content"] === "string"
        ? (payload["content"] as string)
        : null;
  const truncatedContent = truncateContent(postContent);
  const payloadMediaUrl =
    payload && typeof payload["mediaUrl"] === "string"
      ? normalizeMediaUrl(payload["mediaUrl"]) ?? (payload["mediaUrl"] as string)
      : null;
  const mediaUrl =
    (typeof postCore?.media_url === "string" ? postCore.media_url : null) ?? payloadMediaUrl;

  const cleanupSavedMemories = async () => {
    if (!memoryPostId) return;

    let idsToPurge: string[] = [];
    try {
      idsToPurge = await listMemoryIdsForPostOwnerAndSource(
        supabaseUserId,
        memoryPostId,
        "post_memory",
        "post",
      );
    } catch (preloadError) {
      console.warn("Memory cleanup preload error", preloadError);
    }

    try {
      await deleteMemoriesByOwnerPostAndSource(supabaseUserId, memoryPostId, "post_memory", "post");
      if (idsToPurge.length) {
        await deleteMemoryVectors(idsToPurge);
      }
    } catch (cleanupError) {
      console.warn("Memory cleanup failed", cleanupError);
    }
  };

  if (!input.remember) {
    await cleanupSavedMemories();
    return { remembered: false };
  }

  const metadata: Record<string, unknown> = {
    source: "post_memory",
    post_id: memoryPostId,
  };
  if (postOwnerUserId) metadata.post_owner_id = postOwnerUserId;
  if (postAuthorName) metadata.post_author_name = postAuthorName;
  if (truncatedContent) metadata.post_excerpt = truncatedContent;

  const title = postAuthorName ? `Saved ${postAuthorName}'s post` : "Saved a post";
  const descriptionParts: string[] = [];
  if (postAuthorName) descriptionParts.push(`By ${postAuthorName}`);
  if (truncatedContent) descriptionParts.push(truncatedContent);
  const description = descriptionParts.length ? descriptionParts.join(" | ") : null;

  const isTextOnly = !mediaUrl;
  const memoryKind = isTextOnly ? "text" : "post";

  let embedding: number[] | null = null;
  try {
    const embedSource = [title, description].filter(Boolean).join(" ");
    embedding = await embedText(embedSource);
  } catch (embedErr) {
    console.warn("post memory embedding failed", embedErr);
  }

  await upsertPostMemory({
    ownerId: supabaseUserId,
    postId: memoryPostId,
    kind: memoryKind,
    title,
    description,
    mediaUrl: mediaUrl ?? null,
    mediaType: null,
    metadata,
  });

  try {
    const memoryRecord = await fetchLatestPostMemoryRecord({
      ownerId: supabaseUserId,
      postId: memoryPostId,
      source: "post_memory",
      kind: memoryKind,
    });
    if (memoryRecord) {
      const memoryId =
        typeof memoryRecord.id === "string"
          ? memoryRecord.id
          : typeof memoryRecord.id === "number"
            ? String(memoryRecord.id)
            : null;
      const vectorForPinecone = embedding && embedding.length ? embedding : null;

      if (memoryId && vectorForPinecone) {
        await upsertMemoryVector({
          id: memoryId,
          ownerId: supabaseUserId,
          values: vectorForPinecone,
          kind: memoryKind,
          postId: memoryPostId,
          title,
          description,
          mediaUrl: mediaUrl ?? null,
          mediaType: null,
          extra: metadata,
        });
      }
    }
  } catch (pineconeSyncError) {
    console.warn("Memory Pinecone sync failed", pineconeSyncError);
  }

  return { remembered: true };
}
