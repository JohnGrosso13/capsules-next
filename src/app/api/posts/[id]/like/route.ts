import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { ensureUserFromRequest } from "@/lib/auth/payload";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
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
    } else {
      const { error } = await supabase
        .from("post_likes")
        .delete()
        .eq("post_id", postId)
        .eq("user_id", userId);
      if (error) throw error;
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
