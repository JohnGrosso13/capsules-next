import { NextResponse } from "next/server";

import { ensureUserFromRequest } from "@/lib/auth/payload";
import { listMemories } from "@/lib/supabase/memories";

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const userPayload = (body?.user as Record<string, unknown>) ?? {};
  const kind = (body?.kind as string) ?? null;
  const ownerId = await ensureUserFromRequest(req, userPayload, { allowGuests: false });
  if (!ownerId) {
    return NextResponse.json({ error: "auth required" }, { status: 401 });
  }

  try {
    const items = await listMemories({ ownerId, kind });
    return NextResponse.json({ items });
  } catch (error) {
    console.error("memory list error", error);
    return NextResponse.json({ items: [] }, { status: 500 });
  }
}
