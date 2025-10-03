import { NextResponse } from "next/server";

import { ensureUserFromRequest } from "@/lib/auth/payload";
import { createThemeStyle, type ThemeMode } from "@/server/theme/service";

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
  const detailsRaw = typeof body.details === "string" ? body.details : "";
  const details = detailsRaw.trim() || null;
  const modeRaw = typeof body.mode === "string" ? body.mode.trim().toLowerCase() : null;
  const mode: ThemeMode = modeRaw === "light" || modeRaw === "dark" ? (modeRaw as ThemeMode) : null;
  const varsRaw = body.vars;
  const vars = varsRaw && typeof varsRaw === "object" ? (varsRaw as Record<string, unknown>) : null;

  if (!vars || !Object.keys(vars).length) {
    return NextResponse.json({ error: "vars required" }, { status: 400 });
  }

  try {
    const style = await createThemeStyle({
      ownerId,
      title,
      summary,
      description: summary || prompt || title,
      prompt,
      details,
      mode,
      vars,
    });

    return NextResponse.json({ success: true, id: style.id });
  } catch (error) {
    console.error("theme save error", error);
    return NextResponse.json({ error: "failed to save" }, { status: 500 });
  }
}

export const runtime = "nodejs";
