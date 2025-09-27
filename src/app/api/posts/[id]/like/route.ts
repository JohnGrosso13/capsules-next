import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { ensureUserFromRequest } from "@/lib/auth/payload";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { indexMemory } from "@/lib/supabase/memories";
import { resolvePostId } from "@/lib/supabase/posts";

export async function POST(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const body = await req.json().catch(() => null);
  const { id } = await context.params;
  const rawId = decodeURIComponent(id ?? "").trim();
  if (!rawId) {
    return NextResponse.json({ error: "post id required" }, { status: 400 });
  }

  const action = body?.action === "unlike" ? "unlike" : "like";
  const userPayload = (body?.user as Record<string, unknown>) ?? {};
  const supabase = getSupabaseAdminClient();

  const postId = await resolvePostId(rawId);
  if (!postId) {
    return NextResponse.json({ error: "post not found" }, { status: 404 });
  }

  const userId = await ensureUserFromRequest(req, userPayload);
  if (!userId) {
    return NextResponse.json({ error: "auth required" }, { status: 401 });
  }

  let postRow: Record<string, unknown> | null = null;
  try {
    const { data: fetchedPost, error: postError } = await supabase
      .from("posts")
      .select("id, client_id, content, user_name, media_url, author_user_id")
      .eq("id", postId)
      .maybeSingle();
    if (!postError && fetchedPost) {
      postRow = fetchedPost as Record<string, unknown>;
    }
  } catch (postFetchError) {
    console.warn("Like API post fetch failed", postFetchError);
  }

  const postClientId =
    postRow && typeof postRow["client_id"] === "string" && (postRow["client_id"] as string).trim()
      ? (postRow["client_id"] as string).trim()
      : null;
  const postUuid =
    postRow && (typeof postRow["id"] === "string" || typeof postRow["id"] === "number")
      ? String(postRow["id"])
      : null;
  const memoryPostId = postClientId ?? postUuid ?? postId;

  const postAuthorName =
    postRow && typeof postRow["user_name"] === "string" && (postRow["user_name"] as string).trim()
      ? (postRow["user_name"] as string).trim()
      : null;
  const rawContent =
    postRow && typeof postRow["content"] === "string"
      ? (postRow["content"] as string).trim()
      : "";
  const normalizedContent = rawContent.replace(/\s+/g, ' ').trim();
  const truncatedContent =
    normalizedContent.length > 180 ? `${normalizedContent.slice(0, 177)}…` : normalizedContent;
  const mediaUrl =
    postRow && typeof postRow["media_url"] === "string" ? (postRow["media_url"] as string) : null;
  const postOwnerUserId =
    postRow && typeof postRow["author_user_id"] === "string"
      ? (postRow["author_user_id"] as string)
      : null;

  const cleanupLikeMemories = async () => {
    if (!memoryPostId) return;
    try {
      await supabase
        .from("memories")
        .delete()
        .eq("owner_user_id", userId)
        .eq("kind", "post")
        .eq("meta->>source", "post_like")
        .eq("post_id", memoryPostId);
    } catch (cleanupError) {
      console.warn("Like memory cleanup failed", cleanupError);
    }
  };


  try {
    if (action === "like") {
      const { error } = await supabase
        .from("post_likes")
        .upsert(
          [
            {
              post_id: postId,
              user_id: userId,
            },
          ],
          { onConflict: "post_id,user_id" },
        );
      if (error) throw error;

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
        const memoryDescription = descriptionParts.length ? descriptionParts.join(' • ') : null;

        await indexMemory({
          ownerId: userId,
          kind: "post",
          mediaUrl: mediaUrl ?? null,
          mediaType: null,
          title: memoryTitle,
          description: memoryDescription,
          postId: memoryPostId ?? null,
          metadata,
        });
      } catch (memoryError) {
        console.warn("Like memory index failed", memoryError);
      }
    } else {
      const { error } = await supabase
        .from("post_likes")
        .delete()
        .eq("post_id", postId)
        .eq("user_id", userId);
      if (error) throw error;

      await cleanupLikeMemories();
    }

    const { data, error: selError } = await supabase
      .from("posts_view")
      .select("id, likes_count")
      .eq("id", postId)
      .single();
    if (selError) throw selError;

    return NextResponse.json({ success: true, likes: data?.likes_count ?? 0 });
  } catch (error) {
    console.error("Like API error", error);
    return NextResponse.json({ error: "Failed to update like" }, { status: 500 });
  }
}


