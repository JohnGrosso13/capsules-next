import { NextResponse } from "next/server";

import { ensureUserFromRequest } from "@/lib/auth/payload";
import { indexMemory } from "@/lib/supabase/memories";

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const userPayload = (body.user as Record<string, unknown>) ?? {};
  const ownerId = await ensureUserFromRequest(req, userPayload, { allowGuests: false });
  if (!ownerId) {
    return NextResponse.json({ error: "auth required" }, { status: 401 });
  }

  const titleRaw = typeof body.title === "string" ? body.title : "";
  const title = titleRaw.trim().slice(0, 120) || null;
  const summaryRaw = typeof body.summary === "string" ? body.summary : "";
  const summary = summaryRaw.trim() || null;
  const promptRaw = typeof body.prompt === "string" ? body.prompt : "";
  const prompt = promptRaw.trim() || null;
  const varsRaw = body.vars;
  const vars = varsRaw && typeof varsRaw === "object" ? (varsRaw as Record<string, unknown>) : null;

  if (!vars || !Object.keys(vars).length) {
    return NextResponse.json({ error: "vars required" }, { status: 400 });
  }

  try {
    await indexMemory({
      ownerId,
      kind: "theme",
      mediaUrl: null,
      mediaType: "style",
      title,
      description: summary || prompt,
      postId: null,
      metadata: {
        vars,
        source: "heuristic",
        summary: summary ?? title ?? "Saved theme",
        prompt: prompt ?? title ?? "",
      },
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("theme save error", error);
    return NextResponse.json({ error: "failed to save" }, { status: 500 });
  }
}

export const runtime = "nodejs";

