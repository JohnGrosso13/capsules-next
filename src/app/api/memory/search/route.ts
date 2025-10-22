import { NextResponse } from "next/server";

export const runtime = "nodejs";

import { ensureUserFromRequest } from "@/lib/auth/payload";
import { searchMemories } from "@/lib/supabase/memories";
import { deriveRequestOrigin } from "@/lib/url";

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const userPayload = (body?.user as Record<string, unknown>) ?? {};
  const query = (body?.q as string) ?? "";
  const limit = Number(body?.limit ?? 24);
  const ownerId = await ensureUserFromRequest(req, userPayload, { allowGuests: false });
  if (!ownerId) {
    return NextResponse.json({ error: "auth required" }, { status: 401 });
  }

  if (!query.trim()) {
    return NextResponse.json({ items: [] });
  }

  try {
    const requestOrigin = deriveRequestOrigin(req);
    const items = await searchMemories({ ownerId, query, limit, origin: requestOrigin ?? null });
    return NextResponse.json({ items });
  } catch (error) {
    console.error("memory search error", error);
    return NextResponse.json({ items: [] }, { status: 500 });
  }
}
