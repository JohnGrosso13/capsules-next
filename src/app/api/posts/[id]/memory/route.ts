import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { ensureUserFromRequest } from "@/lib/auth/payload";
import { deleteMemoryVectors, upsertMemoryVector } from "@/services/memories/vector-store";
import { embedText } from "@/lib/ai/openai";
import { resolvePostId } from "@/lib/supabase/posts";
import { normalizeMediaUrl } from "@/lib/media";
import {
  deleteMemoriesByOwnerPostAndSource,
  fetchLatestPostMemoryRecord,
  fetchPostCoreById,
  listMemoryIdsForPostOwnerAndSource,
  upsertPostMemory,
} from "@/server/posts/repository";
import {
  chargeUsage,
  ensureFeatureAccess,
  resolveWalletContext,
  EntitlementError,
} from "@/server/billing/entitlements";
import { memoryUpsertCredits } from "@/lib/billing/usage";

export const runtime = "nodejs";

function truncateContent(value: string | null | undefined, limit = 220) {
  if (!value) return null;
  const normalized = value.replace(/\s+/g, " ").trim();
  if (!normalized.length) return null;
  return normalized.length > limit ? `${normalized.slice(0, limit - 1)}...` : normalized;
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

  const postId = await resolvePostId(rawId);
  if (!postId) {
    return NextResponse.json({ error: "post not found" }, { status: 404 });
  }

  let postCore: Awaited<ReturnType<typeof fetchPostCoreById>> | null = null;
  try {
    postCore = await fetchPostCoreById(postId);
  } catch (fetchError) {
    console.warn("Memory API post fetch failed", fetchError);
  }

  const postClientId = postCore?.client_id ? String(postCore.client_id) : null;
  const postUuid = postCore?.id ? String(postCore.id) : null;
  const memoryPostId = postClientId ?? postUuid ?? rawId;

  const payloadUserName =
    payload && typeof payload.userName === "string" && payload.userName.trim()
      ? payload.userName.trim()
      : null;
  const postAuthorName =
    (typeof postCore?.user_name === "string" && postCore.user_name ? postCore.user_name : null) ??
    payloadUserName;
  const postOwnerUserId = postCore?.author_user_id ? String(postCore.author_user_id) : null;
  const postContent =
    typeof postCore?.content === "string"
      ? postCore.content
      : typeof payload?.content === "string"
        ? payload.content
        : null;
  const truncatedContent = truncateContent(postContent);
  const payloadMediaUrl =
    payload && typeof payload.mediaUrl === "string"
      ? (normalizeMediaUrl(payload.mediaUrl) ?? payload.mediaUrl)
      : null;
  const mediaUrl =
    (typeof postCore?.media_url === "string" ? postCore.media_url : null) ?? payloadMediaUrl;

  const cleanupSavedMemories = async () => {
    if (!memoryPostId) return;

    let idsToPurge: string[] = [];
    try {
      idsToPurge = await listMemoryIdsForPostOwnerAndSource(
        userId,
        memoryPostId,
        "post_memory",
        "post",
      );
    } catch (preloadError) {
      console.warn("Memory cleanup preload error", preloadError);
    }

    try {
      await deleteMemoriesByOwnerPostAndSource(userId, memoryPostId, "post_memory", "post");
      if (idsToPurge.length) {
        await deleteMemoryVectors(idsToPurge);
      }
    } catch (cleanupError) {
      console.warn("Memory cleanup failed", cleanupError);
    }
  };

  try {
    if (action === "remember") {
      let walletContext: Awaited<ReturnType<typeof resolveWalletContext>> | null = null;
      try {
        walletContext = await resolveWalletContext({
          ownerType: "user",
          ownerId: userId,
          supabaseUserId: userId,
          req,
          ensureDevCredits: true,
        });
        ensureFeatureAccess({
          balance: walletContext.balance,
          bypass: walletContext.bypass,
          requiredTier: "starter",
          featureName: "Memory save",
        });
      } catch (billingError) {
        if (billingError instanceof EntitlementError) {
          return NextResponse.json(
            { error: billingError.message, details: billingError.details ?? null },
            { status: billingError.status },
          );
        }
        console.error("billing.post_memory.init_failed", billingError);
        return NextResponse.json({ error: "Billing check failed" }, { status: 500 });
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
      const memoryTextParts = [title, description, truncatedContent].filter(Boolean).join(" ");

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
        ownerId: userId,
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
          ownerId: userId,
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
        }
      } catch (pineconeSyncError) {
        console.warn("Memory Pinecone sync failed", pineconeSyncError);
      }

      try {
        const computeCost = memoryUpsertCredits(memoryTextParts);
        if (walletContext && computeCost > 0 && !walletContext.bypass) {
          await chargeUsage({
            wallet: walletContext.wallet,
            balance: walletContext.balance,
            metric: "compute",
            amount: computeCost,
            reason: "post.memory.remember",
            bypass: walletContext.bypass,
          });
        }
      } catch (billingError) {
        if (billingError instanceof EntitlementError) {
          return NextResponse.json(
            { error: billingError.message, details: billingError.details ?? null },
            { status: billingError.status },
          );
        }
        console.error("billing.post_memory.charge_failed", billingError);
        return NextResponse.json({ error: "Failed to record memory usage" }, { status: 500 });
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
