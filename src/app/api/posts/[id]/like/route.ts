import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { ensureUserFromRequest } from "@/lib/auth/payload";
import { resolvePostId } from "@/lib/supabase/posts";
import {
  deletePostLike,
  fetchPostLikesCount,
  upsertPostLike,
} from "@/server/posts/repository";

export const runtime = "edge";

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

  try {
    if (action === "like") {
      await upsertPostLike(postId, userId);
    } else {
      await deletePostLike(postId, userId);
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
