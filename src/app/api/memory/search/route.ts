import { NextResponse } from "next/server";

export const runtime = "nodejs";

import { ensureUserFromRequest } from "@/lib/auth/payload";
import { searchMemories } from "@/lib/supabase/memories";
import { deriveRequestOrigin } from "@/lib/url";

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const userPayload = (body?.user as Record<string, unknown>) ?? {};
  const query = (body?.q as string) ?? "";
  const limitRaw = Number(body?.limit ?? 24);
  const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(Math.floor(limitRaw), 60) : 24;
  const pageRaw = Number(body?.page);
  const page = Number.isFinite(pageRaw) && pageRaw > 0 ? Math.floor(pageRaw) : 0;
  const kind = typeof body?.kind === "string" && body.kind.trim().length ? body.kind.trim() : null;
  const ownerId = await ensureUserFromRequest(req, userPayload, { allowGuests: false });
  if (!ownerId) {
    return NextResponse.json({ error: "auth required" }, { status: 401 });
  }

  if (!query.trim()) {
    return NextResponse.json({ items: [] });
  }

  try {
    const requestOrigin = deriveRequestOrigin(req);
    let filters: { kinds?: string[] | null } | undefined;
    if (kind) {
      filters = { kinds: [kind] };
    }
    const searchParams: Parameters<typeof searchMemories>[0] = {
      ownerId,
      query,
      limit,
      page,
      origin: requestOrigin ?? null,
    };
    if (filters) {
      searchParams.filters = filters;
    }
    const items = await searchMemories(searchParams);
    return NextResponse.json({ items });
  } catch (error) {
    console.error("memory search error", error);
    return NextResponse.json({ items: [] }, { status: 500 });
  }
}
