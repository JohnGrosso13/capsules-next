import { NextResponse } from "next/server";

import { ensureUserFromRequest, resolveUserKey } from "@/lib/auth/payload";
import { listSocialLinks } from "@/lib/supabase/social";

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const userPayload = (body?.user as Record<string, unknown>) ?? {};
  const key = await resolveUserKey(userPayload);
  if (!key || !key.startsWith("clerk:")) {
    return NextResponse.json({ error: "auth required" }, { status: 401 });
  }

  const ownerId = await ensureUserFromRequest(req, userPayload);
  if (!ownerId) {
    return NextResponse.json({ error: "auth required" }, { status: 401 });
  }

  try {
    const accounts = await listSocialLinks(ownerId);
    return NextResponse.json({ accounts });
  } catch (error) {
    console.error("Linked accounts error", error);
    return NextResponse.json({ error: "Failed to load linked accounts" }, { status: 500 });
  }
}
