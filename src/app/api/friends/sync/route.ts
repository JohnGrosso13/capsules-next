import { NextResponse } from "next/server";

import { ensureUserFromRequest } from "@/lib/auth/payload";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const userPayload = (body?.user as Record<string, unknown>) ?? {};
  const ownerId = await ensureUserFromRequest(req, userPayload);
  if (!ownerId) {
    return NextResponse.json({ error: "auth required" }, { status: 401 });
  }

  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from("friends")
    .select("friend_user_id, display_name, created_at, users:friend_user_id(full_name,avatar_url)")
    .eq("owner_id", ownerId)
    .order("created_at", { ascending: true });
  if (error) {
    console.error("Friends sync error", error);
    return NextResponse.json({ error: "Failed to load friends" }, { status: 500 });
  }

  type FriendRow = {
    display_name?: string | null;
    users?: { full_name?: string | null; avatar_url?: string | null } | null;
  };

  const friends = (data ?? []).map((row) => {
    const record = row as FriendRow;
    return {
      name: record.display_name || record.users?.full_name || "Friend",
      avatar: record.users?.avatar_url ?? null,
    };
  });

  return NextResponse.json({ friends });
}
