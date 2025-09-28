import { NextResponse } from "next/server";

import { ensureUserFromRequest } from "@/lib/auth/payload";
import { indexMemory } from "@/lib/supabase/memories";

const DEFAULT_TITLE_LIMIT = 120;

function buildTitle(text: string): string {
  const normalized = text.trim();
  if (normalized.length <= DEFAULT_TITLE_LIMIT) return normalized;
  return `${normalized.slice(0, DEFAULT_TITLE_LIMIT - 3)}...`;
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const userPayload = (body?.user as Record<string, unknown>) ?? {};
  const ownerId = await ensureUserFromRequest(req, userPayload, { allowGuests: false });
  if (!ownerId) {
    return NextResponse.json({ error: "auth required" }, { status: 401 });
  }

  const text = typeof body?.text === "string" ? body.text.trim() : "";
  if (!text) {
    return NextResponse.json({ error: "text required" }, { status: 400 });
  }

  const language = typeof body?.language === "string" ? body.language : null;
  const metaInput = (body?.meta as Record<string, unknown>) ?? {};
  const metadata: Record<string, unknown> = {
    ...metaInput,
    source: metaInput.source ?? "voice_transcription",
    transcript_length: text.length,
  };
  if (language) metadata.language = language;

  try {
    await indexMemory({
      ownerId,
      kind: "text",
      mediaUrl: null,
      mediaType: "text/plain",
      title: buildTitle(text),
      description: text,
      postId: null,
      metadata,
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("memory transcript error", error);
    return NextResponse.json({ error: "Failed to save transcript" }, { status: 500 });
  }
}
