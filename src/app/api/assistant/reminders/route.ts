import { NextResponse } from "next/server";

import { serverEnv } from "@/lib/env/server";
import { runAssistantReminderSweep } from "@/server/chat/assistant/reminders";

export const runtime = "nodejs";

function authorize(request: Request): boolean {
  const token =
    request.headers.get("x-cron-secret") ??
    new URL(request.url).searchParams.get("token") ??
    null;
  if (!serverEnv.ASSISTANT_REMINDER_SECRET) return false;
  return token === serverEnv.ASSISTANT_REMINDER_SECRET;
}

export async function POST(request: Request) {
  if (!authorize(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const result = await runAssistantReminderSweep();
  return NextResponse.json({ success: true, ...result });
}
