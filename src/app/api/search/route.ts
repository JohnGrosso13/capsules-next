import { NextResponse } from "next/server";

import { ensureUserFromRequest } from "@/lib/auth/payload";
import { deriveRequestOrigin } from "@/lib/url";
import { globalSearch } from "@/server/search/service";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const query = typeof body?.q === "string" ? body.q : "";
  const limitRaw = body?.limit;
  const limit =
    typeof limitRaw === "number" && Number.isFinite(limitRaw)
      ? Math.min(Math.max(Math.floor(limitRaw), 1), 48)
      : 24;
  const userPayload = (body?.user as Record<string, unknown>) ?? {};

  const ownerId = await ensureUserFromRequest(req, userPayload, { allowGuests: false });
  if (!ownerId) {
    return NextResponse.json({ error: "auth required" }, { status: 401 });
  }

  const trimmed = query.trim();
  if (trimmed.length < 2) {
    return NextResponse.json({ query: trimmed, sections: [] });
  }

  try {
    const origin = deriveRequestOrigin(req);
    const result = await globalSearch({
      ownerId,
      query: trimmed,
      limit,
      origin: origin ?? null,
    });
    return NextResponse.json(result);
  } catch (error) {
    console.error("global search error", error);
    return NextResponse.json({ query: trimmed, sections: [] }, { status: 500 });
  }
}
