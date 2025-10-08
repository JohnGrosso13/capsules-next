import { NextResponse } from "next/server";

import { ensureUserFromRequest } from "@/lib/auth/payload";
import { updateThemeStyleTitle } from "@/server/theme/service";
import { updateMemoryTitleForOwner } from "@/server/posts/repository";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const userPayload = (body?.user as Record<string, unknown>) ?? {};
  const ownerId = await ensureUserFromRequest(req, userPayload, { allowGuests: false });
  if (!ownerId) {
    return NextResponse.json({ error: "auth required" }, { status: 401 });
  }

  const idRaw = body?.id;
  const titleRaw = body?.title;
  const kindRaw = body?.kind;

  const id = typeof idRaw === "string" && idRaw.trim() ? idRaw.trim() : null;
  const title = typeof titleRaw === "string" ? titleRaw.trim() : null;
  const kind = typeof kindRaw === "string" && kindRaw.trim() ? kindRaw.trim() : null;

  if (!id) {
    return NextResponse.json({ error: "id required" }, { status: 400 });
  }
  if (!title) {
    return NextResponse.json({ error: "title required" }, { status: 400 });
  }

  try {
    if (kind === "theme") {
      await updateThemeStyleTitle({ ownerId, id, title });
    } else {
      await updateMemoryTitleForOwner({ ownerId, memoryId: id, title, kind });
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("memory update error", error);
    return NextResponse.json({ error: "Failed to update memory" }, { status: 500 });
  }
}
