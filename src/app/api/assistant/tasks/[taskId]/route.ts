import { NextRequest, NextResponse } from "next/server";

import { ensureUserSession } from "@/server/actions/session";
import { cancelAssistantTask, removeAssistantTask } from "@/server/chat/assistant/tasks";

export const runtime = "edge";

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ taskId: string }> }) {
  const { supabaseUserId } = await ensureUserSession();
  if (!supabaseUserId) {
    return NextResponse.json({ error: "auth required" }, { status: 401 });
  }
  const { taskId } = await params;
  if (!taskId) {
    return NextResponse.json({ error: "taskId required" }, { status: 400 });
  }

  const mode = request.nextUrl.searchParams.get("mode") ?? request.nextUrl.searchParams.get("action");
  const purge = request.nextUrl.searchParams.get("purge");
  const shouldRemove = mode === "remove" || mode === "delete" || purge === "true";

  if (shouldRemove) {
    const removal = await removeAssistantTask({ ownerUserId: supabaseUserId, taskId });
    if (!removal.ok) {
      return NextResponse.json({ error: removal.error }, { status: removal.status });
    }
    return NextResponse.json({
      success: true,
      taskId: removal.taskId,
      removedTargets: removal.removedTargets,
    });
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
