import { NextResponse } from "next/server";

import { ensureUserFromRequest } from "@/lib/auth/payload";
import { listMemories } from "@/lib/supabase/memories";
import { listThemeStyles } from "@/server/theme/service";
import { deriveRequestOrigin } from "@/lib/url";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const userPayload = (body?.user as Record<string, unknown>) ?? {};
  const kind = (body?.kind as string) ?? null;
  const rawLimit = typeof body?.limit === "number" ? body.limit : null;
  const limit = rawLimit ? Math.min(Math.max(Math.trunc(rawLimit), 1), 200) : 200;
  const cursor = typeof body?.cursor === "string" && body.cursor.trim().length ? body.cursor : null;
  const ownerId = await ensureUserFromRequest(req, userPayload, { allowGuests: false });
  if (!ownerId) {
    return NextResponse.json({ error: "auth required" }, { status: 401 });
  }

  if (kind === "theme") {
    try {
      const styles = await listThemeStyles(ownerId);
      const items = styles.map((style) => ({
        id: style.id,
        title: style.title,
        summary: style.summary,
        description: style.description,
        prompt: style.prompt,
        details: style.details,
        variants: style.variants,
        mode: style.mode,
        created_at: style.createdAt,
        updated_at: style.updatedAt,
      }));
      return NextResponse.json({ items });
    } catch (error) {
      console.error("theme list error", error);
      return NextResponse.json({ items: [] }, { status: 500 });
    }
  }

  try {
    const requestOrigin = deriveRequestOrigin(req);
    const items = await listMemories({
      ownerId,
      kind,
      origin: requestOrigin ?? null,
      limit,
      cursor,
    });
    return NextResponse.json({ items });
  } catch (error) {
    console.error("memory list error", error);
    return NextResponse.json({ items: [] }, { status: 500 });
  }
}
