import { NextResponse } from "next/server";

import { ensureUserFromRequest, resolveUserKey } from "@/lib/auth/payload";
import { deleteSocialLink } from "@/lib/supabase/social";

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const provider = String((body?.provider as string) ?? "").trim().toLowerCase();
  if (!provider) {
    return NextResponse.json({ error: "provider required" }, { status: 400 });
  }

  const userPayload = (body?.user as Record<string, unknown>) ?? {};
  const ownerId = await ensureUserFromRequest(req, userPayload);
  if (!ownerId) {
    return NextResponse.json({ error: "auth required" }, { status: 401 });
  }

  const key = await resolveUserKey(userPayload);
  if (!key || !key.startsWith("clerk:")) {
    return NextResponse.json({ error: "auth required" }, { status: 401 });
  }

  try {
    await deleteSocialLink(ownerId, provider);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Disconnect OAuth error", error);
    return NextResponse.json({ error: "Failed to disconnect" }, { status: 500 });
  }
}
