import { NextResponse } from "next/server";

import { ensureUserSession } from "@/server/actions/session";
import { cancelAssistantTask } from "@/server/chat/assistant/tasks";

export const runtime = "edge";

type RouteContext = {
  params: { taskId?: string };
};

export async function DELETE(_request: Request, context: RouteContext) {
  const { supabaseUserId } = await ensureUserSession();
  if (!supabaseUserId) {
    return NextResponse.json({ error: "auth required" }, { status: 401 });
  }
  const taskId = context.params?.taskId;
  if (!taskId) {
    return NextResponse.json({ error: "taskId required" }, { status: 400 });
  }

  const result = await cancelAssistantTask({ ownerUserId: supabaseUserId, taskId });
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json({
    success: true,
    task: result.task,
    canceledTargets: result.canceledTargets,
  });
}
