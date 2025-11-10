import { NextResponse } from "next/server";

import { ensureUserSession } from "@/server/actions/session";
import { getAssistantTaskSummaries } from "@/server/chat/assistant/summary";

export const runtime = "edge";

export async function GET(request: Request) {
  const { supabaseUserId } = await ensureUserSession();
  if (!supabaseUserId) {
    return NextResponse.json({ error: "auth required" }, { status: 401 });
  }

  const url = new URL(request.url);
  const limitParam = url.searchParams.get("limit");
  const includeCompleted = url.searchParams.get("includeCompleted") === "true";
  const limit = limitParam ? Math.max(1, Math.min(Number.parseInt(limitParam, 10) || 10, 100)) : 20;

  const tasks = await getAssistantTaskSummaries({
    ownerUserId: supabaseUserId,
    limit,
    includeCompleted,
  });

  return NextResponse.json({ tasks });
}
