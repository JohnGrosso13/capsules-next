import { NextResponse } from "next/server";

import { AIConfigError, transcribeAudioFromBase64 } from "@/lib/ai/prompter";
import { ensureUserFromRequest } from "@/lib/auth/payload";
import { returnError } from "@/server/validation/http";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    // Require authentication to guard a cost-incurring endpoint
    const ownerId = await ensureUserFromRequest(req, {}, { allowGuests: false });
    if (!ownerId) {
      return returnError(401, "auth_required", "Authentication required");
    }

    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    const audioBase64Raw =
      typeof body?.audio_base64 === "string" && body.audio_base64.trim().length
        ? body.audio_base64.trim()
        : typeof body?.audioBase64 === "string"
          ? body.audioBase64.trim()
          : "";
    if (!audioBase64Raw) {
      return NextResponse.json({ error: "audio_base64 is required" }, { status: 400 });
    }
    const mime =
      typeof body?.mime === "string" && body.mime.trim().length ? body.mime.trim() : null;
    const result = await transcribeAudioFromBase64({ audioBase64: audioBase64Raw, mime });
    return NextResponse.json({
      text: result.text || "",
      model: result.model || null,
      raw: result.raw || null,
    });
  } catch (error) {
    if (error instanceof AIConfigError) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    const status = Number.isInteger((error as { status?: unknown })?.status)
      ? Number((error as { status?: number }).status)
      : 500;
    console.error("Transcription endpoint error:", error);
    if ((error as { meta?: unknown }).meta) {
      console.error("Transcription endpoint meta:", (error as { meta?: unknown }).meta);
    }
    const payload: Record<string, unknown> = {
      error: (error as Error)?.message || "Transcription failed.",
    };
    if ((error as { meta?: unknown }).meta) {
      payload.meta = (error as { meta?: unknown }).meta;
    }
    return NextResponse.json(payload, { status });
  }
}
