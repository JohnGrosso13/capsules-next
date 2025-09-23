import { NextResponse } from "next/server";

import { ensureUserFromRequest } from "@/lib/auth/payload";
import { indexMemory } from "@/lib/supabase/memories";

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const userPayload = (body?.user as Record<string, unknown>) ?? {};
  const ownerId = await ensureUserFromRequest(req, userPayload, { allowGuests: false });
  if (!ownerId) {
    return NextResponse.json({ error: "auth required" }, { status: 401 });
  }

  const item = (body?.item as Record<string, unknown>) ?? null;
  if (!item || typeof item.media_url !== "string") {
    return NextResponse.json({ error: "media_url required" }, { status: 400 });
  }

  try {
    await indexMemory({
      ownerId,
      kind: typeof item.kind === "string" ? item.kind : "upload",
      mediaUrl: item.media_url as string,
      mediaType: typeof item.media_type === "string" ? item.media_type : null,
      title: typeof item.title === "string" ? item.title : null,
      description: typeof item.description === "string" ? item.description : null,
      postId: typeof item.post_id === "string" ? item.post_id : null,
      metadata: (item.meta as Record<string, unknown>) ?? null,
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("memory upsert error", error);
    return NextResponse.json({ error: "Failed to index memory" }, { status: 500 });
  }
}
