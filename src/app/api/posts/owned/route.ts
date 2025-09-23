import { NextResponse } from "next/server";

import { ensureUserFromRequest } from "@/lib/auth/payload";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";

export async function POST(req: Request) {
  const supabase = getSupabaseAdminClient();
  let body: Record<string, unknown> | null = null;
  try {
    body = await req.json();
  } catch {
    // ignore empty body
  }

  const userPayload = (body?.user as Record<string, unknown>) ?? {};
  const ownerId = await ensureUserFromRequest(req, userPayload, { allowGuests: false });
  if (!ownerId) {
    return NextResponse.json({ error: "auth required" }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("posts")
    .select("id, client_id")
    .eq("author_user_id", ownerId)
    .is("deleted_at", null);

  if (error) {
    console.error("Owned posts fetch error", error);
    return NextResponse.json({ error: "Failed to load owned posts" }, { status: 500 });
  }

  const owned = (data ?? []).map((row) => row.client_id ?? row.id);
  return NextResponse.json({ owned });
}
