import { NextResponse } from "next/server";

import { ensureUserFromRequest } from "@/lib/auth/payload";
import { deleteMemories } from "@/lib/supabase/memories";
import { deleteAllThemeStyles, deleteThemeStyles } from "@/server/theme/service";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const userPayload = (body?.user as Record<string, unknown>) ?? {};
  const ownerId = await ensureUserFromRequest(req, userPayload, { allowGuests: false });
  if (!ownerId) {
    return NextResponse.json({ error: "auth required" }, { status: 401 });
  }

  const kind = typeof body?.kind === "string" ? body.kind.trim() : null;
  if (kind === "theme") {
    try {
      let deleted = 0;
      const idsRaw = Array.isArray(body?.ids) ? (body!.ids as unknown[]) : [];
      const ids = idsRaw
        .map((value) => (typeof value === "string" ? value.trim() : null))
        .filter((value): value is string => Boolean(value));
      const deleteAll = Boolean(body?.all);

      if (deleteAll) {
        deleted = await deleteAllThemeStyles(ownerId);
      } else if (ids.length) {
        deleted = await deleteThemeStyles({ ownerId, ids });
      }

      return NextResponse.json({ success: true, deleted: { themes: deleted } });
    } catch (error) {
      console.error("theme delete error", error);
      return NextResponse.json({ error: "Failed to delete themes" }, { status: 500 });
    }
  }

  try {
    const result = await deleteMemories({ ownerId, body: body ?? {} });
    return NextResponse.json({ success: true, deleted: result });
  } catch (error) {
    console.error("memory delete error", error);
    return NextResponse.json({ error: "Failed to delete memories" }, { status: 500 });
  }
}
