import { NextResponse } from "next/server";

import { ensureUserFromRequest } from "@/lib/auth/payload";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { ensureAliasUserFromName } from "@/lib/supabase/users";

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const action = body?.action === "remove" ? "remove" : "add";
  const friend = (body?.friend as Record<string, unknown>) ?? {};
  const userPayload = (body?.user as Record<string, unknown>) ?? {};

  const ownerId = await ensureUserFromRequest(req, userPayload);
  if (!ownerId) {
    return NextResponse.json({ error: "auth required" }, { status: 401 });
  }

  const friendId = await ensureAliasUserFromName(
    typeof friend.name === "string" ? friend.name : "",
    typeof friend.avatar === "string" ? friend.avatar : null,
  );
  if (!friendId) {
    return NextResponse.json({ error: "friend name required" }, { status: 400 });
  }

  const supabase = getSupabaseAdminClient();

  try {
    if (action === "add") {
      const { error } = await supabase
        .from("friends")
        .upsert(
          [
            {
              owner_id: ownerId,
              friend_user_id: friendId,
              display_name: typeof friend.name === "string" ? friend.name : null,
            },
          ],
          { onConflict: "owner_id,friend_user_id" },
        );
      if (error) throw error;
    } else {
      const { error } = await supabase
        .from("friends")
        .delete()
        .eq("owner_id", ownerId)
        .eq("friend_user_id", friendId);
      if (error) throw error;
    }

    const { data, error: selError } = await supabase
      .from("friends")
      .select("friend_user_id, display_name, created_at, users:friend_user_id(full_name,avatar_url)")
      .eq("owner_id", ownerId)
      .order("created_at", { ascending: true });
    if (selError) throw selError;

    const friends = (data ?? []).map((row) => {
      const record = row as {
        display_name?: string | null;
        users?: { full_name?: string | null; avatar_url?: string | null } | null;
      };
      return {
        name: record.display_name || record.users?.full_name || "Friend",
        avatar: record.users?.avatar_url ?? null,
      };
    });

    return NextResponse.json({ success: true, friends });
  } catch (error) {
    console.error("Friends update error", error);
    return NextResponse.json({ error: "Failed to update friends" }, { status: 500 });
  }
}
