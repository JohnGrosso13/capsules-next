import { NextResponse } from "next/server";

import { ensureUserFromRequest } from "@/lib/auth/payload";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const userPayload = (body?.user as Record<string, unknown>) ?? {};
  const ownerId = await ensureUserFromRequest(req, userPayload, { allowGuests: false });
  if (!ownerId) {
    return NextResponse.json({ error: "auth required" }, { status: 401 });
  }

  const idRaw = body?.id;
  const titleRaw = body?.title;
  const kindRaw = body?.kind;

  const id = typeof idRaw === "string" && idRaw.trim() ? (idRaw as string).trim() : null;
  const title = typeof titleRaw === "string" ? (titleRaw as string).trim() : null;
  const kind = typeof kindRaw === "string" && kindRaw.trim() ? (kindRaw as string).trim() : null;

  if (!id) {
    return NextResponse.json({ error: "id required" }, { status: 400 });
  }
  if (!title) {
    return NextResponse.json({ error: "title required" }, { status: 400 });
  }

  try {
    const supabase = getSupabaseAdminClient();

    let query = supabase
      .from("memories")
      .update({ title })
      .eq("owner_user_id", ownerId)
      .eq("id", id);

    if (kind) query = query.eq("kind", kind);

    const { error } = await query;
    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("memory update error", error);
    return NextResponse.json({ error: "Failed to update memory" }, { status: 500 });
  }
}

