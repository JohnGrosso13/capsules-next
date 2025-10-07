import { NextResponse } from "next/server";

import { ensureUserFromRequest } from "@/lib/auth/payload";
import { listOwnedPostClientIds } from "@/server/posts/repository";

export async function POST(req: Request) {
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

  try {
    const owned = await listOwnedPostClientIds(ownerId);
    return NextResponse.json({ owned });
  } catch (error) {
    console.error("Owned posts fetch error", error);
    return NextResponse.json({ error: "Failed to load owned posts" }, { status: 500 });
  }
}
