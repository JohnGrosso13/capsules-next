import { NextResponse } from "next/server";

import { ensureUserFromRequest } from "@/lib/auth/payload";
import { persistCommentToDB, resolvePostId } from "@/lib/supabase/posts";
import { listCommentsForPost } from "@/server/posts/repository";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const rawPostId = url.searchParams.get("postId") ?? url.searchParams.get("post_id");
  const resolved = await resolvePostId(rawPostId);
  if (!resolved) {
    return NextResponse.json({ success: true, comments: [] });
  }

  let rows;
  try {
    rows = await listCommentsForPost(resolved, 200);
  } catch (error) {
    console.error("Fetch comments error", error);
    return NextResponse.json({ error: "Failed to fetch comments" }, { status: 500 });
  }

  const comments = rows.map((row) => {
    const identifierCandidate =
      (typeof row.client_id === "string" && row.client_id.length
        ? row.client_id
        : typeof row.client_id === "number"
          ? String(row.client_id)
          : typeof row.id === "string"
            ? row.id
            : typeof row.id === "number"
              ? String(row.id)
              : null) ?? rawPostId ?? resolved;

    return {
      id: identifierCandidate,
      postId: rawPostId,
      content: row.content,
      userName: row.user_name,
      userAvatar: row.user_avatar,
      capsuleId: row.capsule_id,
      ts: row.created_at,
    };
  });

  return NextResponse.json({ success: true, comments });
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const comment = (body?.comment as Record<string, unknown>) ?? null;
  if (!comment) {
    return NextResponse.json({ error: "comment required" }, { status: 400 });
  }

  const userPayload = (body?.user as Record<string, unknown>) ?? {};
  const userId = await ensureUserFromRequest(req, userPayload, { allowGuests: false });
  if (!userId) {
    return NextResponse.json({ error: "auth required" }, { status: 401 });
  }

  try {
    await persistCommentToDB(comment, userId);
  } catch (error) {
    console.error("Persist comment error", error);
    return NextResponse.json({ error: "Failed to save comment" }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
