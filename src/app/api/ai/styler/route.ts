import { NextResponse } from "next/server";
import { resolveStylerPlan } from "@/server/ai/styler";

async function tryIndexStylerMemory(payload: {
  ownerId: string;
  kind: string;
  mediaUrl: string | null;
  mediaType: string | null;
  title: string | null;
  description: string | null;
  postId: string | null;
  metadata: Record<string, unknown> | null;
}) {
  try {
    const { indexMemory } = await import("@/lib/supabase/memories");
    await indexMemory(payload);
  } catch (error) {
    console.warn("styler memory error", error);
  }
}

export async function POST(req: Request) {
  try {
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      body = null;
    }

    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return jsonError(400, "invalid_request", "Request body failed validation");
    }

    const payload = body as Record<string, unknown>;
    const promptRaw = typeof payload.prompt === "string" ? payload.prompt : "";
    const prompt = promptRaw.trim();
    if (!prompt) {
      return jsonError(400, "invalid_request", "Prompt is required");
    }

    const userRaw = payload.user;
    const user = userRaw && typeof userRaw === "object" && !Array.isArray(userRaw)
      ? (userRaw as Record<string, unknown>)
      : undefined;

    const plan = await resolveStylerPlan(prompt);
    if (!plan) {
      return jsonError(422, "styler_unavailable", "I couldn't figure out how to style that yet.");
    }

    const sanitizedVars = Object.fromEntries(Object.entries(plan.vars).slice(0, 32));
    if (!Object.keys(sanitizedVars).length) {
      return jsonError(422, "styler_no_changes", "That request didn't translate to any visual changes yet.");
    }

    let ownerId: string | null = null;
    try {
      const { ensureUserFromRequest } = await import("@/lib/auth/payload");
      ownerId = await ensureUserFromRequest(req, user ?? {}, { allowGuests: true });
    } catch (error) {
      console.warn("styler ensure user error", error);
    }

    if (ownerId) {
      await tryIndexStylerMemory({
        ownerId,
        kind: "theme",
        mediaUrl: null,
        mediaType: "style",
        title: plan.summary.slice(0, 120),
        description: prompt,
        postId: null,
        metadata: {
          vars: sanitizedVars,
          source: plan.source,
          summary: plan.summary,
          prompt,
        },
      });
    }

    return NextResponse.json({
      status: "ok",
      source: plan.source,
      summary: plan.summary,
      vars: sanitizedVars,
    });
  } catch (error) {
    console.error("styler route error", error);
    const message = error instanceof Error && error.message ? error.message : "Internal error";
    return jsonError(500, "styler_error", message);
  }
}

function jsonError(status: number, code: string, message: string, details?: unknown) {
  const payload: Record<string, unknown> = { error: code, message };
  if (details !== undefined) payload.details = details;
  return NextResponse.json(payload, { status });
}
