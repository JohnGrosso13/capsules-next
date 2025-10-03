import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { ensureUserFromRequest } from "@/lib/auth/payload";
import { deleteMemoryVectors } from "@/services/memories/vector-store";
import { indexMemory } from "@/lib/supabase/memories";
import { resolvePostId } from "@/lib/supabase/posts";
import {
  deleteMemoriesByOwnerPostAndSource,
  deletePostLike,
  fetchPostCoreById,
  fetchPostLikesCount,
  listMemoryIdsForPostOwnerAndSource,
  upsertPostLike,
} from "@/server/posts/repository";

export const runtime = "nodejs";

export async function POST(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const body = await req.json().catch(() => null);
  const { id } = await context.params;
  const rawId = decodeURIComponent(id ?? "").trim();
  if (!rawId) {
    return NextResponse.json({ error: "post id required" }, { status: 400 });
  }

  const action = body?.action === "unlike" ? "unlike" : "like";
  const userPayload = (body?.user as Record<string, unknown>) ?? {};

  const postId = await resolvePostId(rawId);
  if (!postId) {
    return NextResponse.json({ error: "post not found" }, { status: 404 });
  }

  const userId = await ensureUserFromRequest(req, userPayload);
  if (!userId) {
    return NextResponse.json({ error: "auth required" }, { status: 401 });
  }

  let postCore: Awaited<ReturnType<typeof fetchPostCoreById>> | null = null;
  try {
    postCore = await fetchPostCoreById(postId);
  } catch (postFetchError) {
    console.warn("Like API post fetch failed", postFetchError);
  }

  const postClientId = postCore?.client_id ? String(postCore.client_id).trim() : null;
  const postUuid = postCore?.id ? String(postCore.id) : null;
  const memoryPostId = postClientId ?? postUuid ?? postId;

  const postAuthorName = postCore?.user_name ? String(postCore.user_name).trim() : null;
  const rawContent = typeof postCore?.content === "string" ? postCore.content.trim() : "";
  const normalizedContent = rawContent.replace(/\s+/g, " ").trim();
  const truncatedContent =
    normalizedContent.length > 180 ? `${normalizedContent.slice(0, 177)}...` : normalizedContent;
  const mediaUrl = typeof postCore?.media_url === "string" ? postCore.media_url : null;
  const postOwnerUserId = postCore?.author_user_id ? String(postCore.author_user_id) : null;

  const cleanupLikeMemories = async () => {
    if (!memoryPostId) return;

    let idsToPurge: string[] = [];
    try {
      idsToPurge = await listMemoryIdsForPostOwnerAndSource(userId, memoryPostId, "post_like", "post");
    } catch (preloadError) {
      console.warn("Like memory cleanup preload error", preloadError);
    }

    try {
      await deleteMemoriesByOwnerPostAndSource(userId, memoryPostId, "post_like", "post");
      if (idsToPurge.length) {
        await deleteMemoryVectors(idsToPurge);
      }
    } catch (cleanupError) {
      console.warn("Like memory cleanup failed", cleanupError);
    }
  };

  try {
    if (action === "like") {
      await upsertPostLike(postId, userId);

      await cleanupLikeMemories();

      try {
        const metadata: Record<string, unknown> = {
          source: "post_like",
          post_id: memoryPostId,
        };
        if (postOwnerUserId) metadata.post_owner_id = postOwnerUserId;
        if (postAuthorName) metadata.post_author_name = postAuthorName;
        if (truncatedContent) metadata.post_excerpt = truncatedContent;

        const memoryTitle = postAuthorName ? `Liked ${postAuthorName}'s post` : "Liked a post";
        const descriptionParts: string[] = [];
        if (postAuthorName) descriptionParts.push(`By ${postAuthorName}`);
        if (truncatedContent) descriptionParts.push(truncatedContent);
        const memoryDescription = descriptionParts.length ? descriptionParts.join(" | ") : null;

        await indexMemory({
          ownerId: userId,
          kind: "post",
          mediaUrl: mediaUrl ?? null,
          mediaType: null,
          title: memoryTitle,
          description: memoryDescription,
          postId: memoryPostId ?? null,
          metadata,
          rawText: [memoryTitle, memoryDescription].filter(Boolean).join(" | "),
          source: "post_like",
          tags: ["like", "post", memoryPostId ?? ""].filter(Boolean),
        });
      } catch (memoryError) {
        console.warn("Like memory index failed", memoryError);
      }
    } else {
      await deletePostLike(postId, userId);

      await cleanupLikeMemories();
    }

    let likes = 0;
    try {
      likes = await fetchPostLikesCount(postId);
    } catch (metricsError) {
      console.warn("Like metrics fetch failed", metricsError);
    }

    return NextResponse.json({ success: true, likes });
  } catch (error) {
    console.error("Like API error", error);
    return NextResponse.json({ error: "Failed to update like" }, { status: 500 });
  }
}
