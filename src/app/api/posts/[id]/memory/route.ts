import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { ensureUserFromRequest } from "@/lib/auth/payload";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { deleteMemoryVectors, upsertMemoryVector } from "@/services/memories/vector-store";
import { embedText } from "@/lib/ai/openai";
import { resolvePostId } from "@/lib/supabase/posts";
import { normalizeMediaUrl } from "@/lib/media";

function truncateContent(value: string | null | undefined, limit = 220) {
  if (!value) return null;
  const normalized = value.replace(/\s+/g, " ").trim();
  if (!normalized.length) return null;
  return normalized.length > limit ? `${normalized.slice(0, limit - 1)}…` : normalized;
}

export async function POST(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const body = await req.json().catch(() => null);
  const action = body?.action === "forget" ? "forget" : "remember";
  const payload = (body?.payload as Record<string, unknown> | null) ?? null;

  const { id } = await context.params;
  const rawId = decodeURIComponent(id ?? "").trim();
  if (!rawId) {
    return NextResponse.json({ error: "post id required" }, { status: 400 });
  }

  const userId = await ensureUserFromRequest(req);
  if (!userId) {
    return NextResponse.json({ error: "auth required" }, { status: 401 });
  }

  const supabase = getSupabaseAdminClient();
  const postId = await resolvePostId(rawId);
  if (!postId) {
    return NextResponse.json({ error: "post not found" }, { status: 404 });
  }

  let postRow: Record<string, unknown> | null = null;
  try {
    const { data, error } = await supabase
      .from("posts")
      .select("id, client_id, content, media_url, user_name, author_user_id")
      .eq("id", postId)
      .maybeSingle();
    if (!error && data) {
      postRow = data as Record<string, unknown>;
    }
  } catch (fetchError) {
    console.warn("Memory API post fetch failed", fetchError);
  }

  const postClientId =
    postRow && typeof postRow["client_id"] === "string" && postRow["client_id"]
      ? String(postRow["client_id"])
      : null;
  const postUuid =
    postRow && (typeof postRow["id"] === "string" || typeof postRow["id"] === "number")
      ? String(postRow["id"])
      : null;
  const memoryPostId = postClientId ?? postUuid ?? rawId;

  const payloadUserName =
    payload && typeof payload.userName === "string" && payload.userName.trim()
      ? payload.userName.trim()
      : null;
  const postAuthorName =
    (postRow && typeof postRow["user_name"] === "string" && postRow["user_name"]
      ? (postRow["user_name"] as string)
      : null) ?? payloadUserName;
  const postOwnerUserId =
    postRow && typeof postRow["author_user_id"] === "string"
      ? (postRow["author_user_id"] as string)
      : null;
  const postContent =
    postRow && typeof postRow["content"] === "string"
      ? (postRow["content"] as string)
      : typeof payload?.content === "string"
        ? payload.content
        : null;
  const truncatedContent = truncateContent(postContent);
  const payloadMediaUrl =
    payload && typeof payload.mediaUrl === "string"
      ? normalizeMediaUrl(payload.mediaUrl) ?? payload.mediaUrl
      : null;
  const mediaUrl =
    (postRow && typeof postRow["media_url"] === "string"
      ? (postRow["media_url"] as string)
      : null) ?? payloadMediaUrl;

  const cleanupSavedMemories = async () => {
    if (!memoryPostId) return;
    let idsToPurge: string[] = [];
    try {
      const { data, error } = await supabase
        .from("memories")
        .select("id")
        .eq("owner_user_id", userId)
        .eq("kind", "post")
        .eq("meta->>source", "post_memory")
        .eq("post_id", memoryPostId);
      if (!error && Array.isArray(data)) {
        idsToPurge = data
          .map((row) =>
            row && typeof row === "object" && typeof (row as { id?: unknown }).id === "string"
              ? (row as { id: string }).id
              : null,
          )
          .filter((value): value is string => Boolean(value));
      } else if (error) {
        console.warn("Memory cleanup preload failed", error);
      }
    } catch (preloadError) {
      console.warn("Memory cleanup preload error", preloadError);
    }

    try {
      const { error } = await supabase
        .from("memories")
        .delete()
        .eq("owner_user_id", userId)
        .eq("kind", "post")
        .eq("meta->>source", "post_memory")
        .eq("post_id", memoryPostId);
      if (error) throw error;

      if (idsToPurge.length) {
        await deleteMemoryVectors(idsToPurge);
      }
    } catch (cleanupError) {
      console.warn("Memory cleanup failed", cleanupError);
    }
  };

  try {
    if (action === "remember") {

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
      const description = descriptionParts.length ? descriptionParts.join(" · ") : null;

      const isTextOnly = !mediaUrl;
      const memoryKind = isTextOnly ? "text" : "post";

      let embedding: number[] | null = null;
      try {
        const embedSource = [title, description].filter(Boolean).join(" ");
        embedding = await embedText(embedSource);
      } catch (embedErr) {
        console.warn("post memory embedding failed", embedErr);
      }

      const { error: rpcError } = await supabase.rpc("upsert_post_memory", {
        p_owner_user_id: userId,
        p_post_id: memoryPostId,
        p_kind: memoryKind,
        p_title: title,
        p_description: description,
        p_media_url: mediaUrl ?? null,
        p_media_type: null,
        p_meta: metadata,
        p_embedding: embedding ?? null,
      });
      if (rpcError) throw rpcError;

      try {
        const { data: memoryRecord, error: fetchError } = await supabase
          .from("memories")
          .select(
            "id, owner_user_id, kind, post_id, title, description, media_url, media_type, meta, embedding",
          )
          .eq("owner_user_id", userId)
          .eq("post_id", memoryPostId)
          .eq("meta->>source", "post_memory")
          .eq("kind", memoryKind)
          .order("updated_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (!fetchError && memoryRecord) {
          const record = memoryRecord as Record<string, unknown>;
          const memoryId = typeof record.id === "string" ? (record.id as string) : null;
          const storedEmbedding = Array.isArray((record as { embedding?: unknown }).embedding)
            ? ((record as { embedding: number[] }).embedding)
            : null;
          const vectorForPinecone = embedding && embedding.length ? embedding : storedEmbedding;

          if (memoryId && vectorForPinecone && vectorForPinecone.length) {
            await upsertMemoryVector({
              id: memoryId,
              ownerId: userId,
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
        } else if (fetchError) {
          console.warn("Memory fetch for Pinecone failed", fetchError);
        }
      } catch (pineconeSyncError) {
        console.warn("Memory Pinecone sync failed", pineconeSyncError);
      }

      return NextResponse.json({ success: true, remembered: true });
    }

    await cleanupSavedMemories();
    return NextResponse.json({ success: true, remembered: false });
  } catch (error) {
    console.error("Memory toggle error", error);
    return NextResponse.json({ error: "Failed to update memory" }, { status: 500 });
  }
}
