import { NextResponse } from "next/server";

import { ensureUserFromRequest } from "@/lib/auth/payload";
import { deleteMemories } from "@/lib/supabase/memories";

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const userPayload = (body?.user as Record<string, unknown>) ?? {};
  const ownerId = await ensureUserFromRequest(req, userPayload, { allowGuests: false });
  if (!ownerId) {
    return NextResponse.json({ error: "auth required" }, { status: 401 });
  }

  try {
    const result = await deleteMemories({ ownerId, body: body ?? {} });
    return NextResponse.json({ success: true, deleted: result });
  } catch (error) {
    console.error("memory delete error", error);
    return NextResponse.json({ error: "Failed to delete memories" }, { status: 500 });
  }
}
