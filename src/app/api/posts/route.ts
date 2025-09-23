import { NextResponse } from "next/server";

import { ensureUserFromRequest } from "@/lib/auth/payload";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { createPostRecord } from "@/lib/supabase/posts";

function parseLimit(value: string | null) {
  const parsed = Number.parseInt(value ?? "", 10);
  if (Number.isNaN(parsed) || parsed <= 0) return 60;
  return Math.min(parsed, 200);
}

function normalizePost(row: Record<string, unknown>) {
  return {
    id: row.client_id ?? row.id,
    kind: row.kind ?? "text",
    content: row.content ?? "",
    mediaUrl: row.media_url ?? null,
    mediaPrompt: row.media_prompt ?? null,
    userName: row.user_name ?? null,
    userAvatar: row.user_avatar ?? null,
    capsuleId: row.capsule_id ?? null,
    tags: Array.isArray(row.tags) ? row.tags : undefined,
    likes: typeof row.likes_count === "number" ? row.likes_count : 0,
    comments: typeof row.comments_count === "number" ? row.comments_count : undefined,
    hotScore: typeof row.hot_score === "number" ? row.hot_score : undefined,
    rankScore: typeof row.rank_score === "number" ? row.rank_score : undefined,
    ts: (row.created_at as string) ?? (row.updated_at as string) ?? new Date().toISOString(),
    source: row.source ?? "web",
    ownerUserId: row.author_user_id ?? null,
  };
}

export async function GET(req: Request) {
  const supabase = getSupabaseAdminClient();
  const url = new URL(req.url);
  const capsuleId = url.searchParams.get("capsuleId");
  const limit = parseLimit(url.searchParams.get("limit"));
  const before = url.searchParams.get("before");
  const after = url.searchParams.get("after");

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
    return NextResponse.json({ error: "Failed to load posts" }, { status: 500 });
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
  return NextResponse.json({ posts, deleted: deletedIds });
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const post = (body?.post as Record<string, unknown>) ?? null;
  if (!post) {
    return NextResponse.json({ error: "post required" }, { status: 400 });
  }

  const userPayload = (body?.user as Record<string, unknown>) ?? {};
  const ownerId = await ensureUserFromRequest(req, userPayload);
  if (!ownerId) {
    return NextResponse.json({ error: "auth required" }, { status: 401 });
  }

  try {
    const id = await createPostRecord(post, ownerId);
    return NextResponse.json({ success: true, id });
  } catch (error) {
    console.error("Persist post error", error);
    return NextResponse.json({ error: "Failed to save post" }, { status: 500 });
  }
}
