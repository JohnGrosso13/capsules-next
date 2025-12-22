import { NextResponse } from "next/server";

import { ensureUserSession } from "@/server/actions/session";
import { getAssistantTaskSummaries } from "@/server/chat/assistant/summary";
import {
  createMessagingTask,
  markRecipientFailed,
  markRecipientMessaged,
  deriveTaskTitle,
} from "@/server/chat/assistant/tasks";
import { createAssistantDependenciesForUser } from "@/server/chat/service";
import type { MessagingRecipient } from "@/server/chat/assistant/tasks";

export const runtime = "nodejs";

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

export async function POST(request: Request) {
  const { supabaseUserId } = await ensureUserSession();
  if (!supabaseUserId) {
    return NextResponse.json({ error: "auth required" }, { status: 401 });
  }

  const payload = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const promptRaw = typeof payload?.prompt === "string" ? payload.prompt : "";
  const prompt = promptRaw.trim();
  const recipientsInput = Array.isArray(payload?.recipients) ? payload?.recipients : [];
  const trackResponsesDefault =
    typeof payload?.trackResponses === "boolean" ? payload.trackResponses : true;

  const recipients: MessagingRecipient[] = [];
  for (const entry of recipientsInput) {
    if (!entry || typeof entry !== "object") continue;
    const record = entry as Record<string, unknown>;
    const userId = typeof record.userId === "string" ? record.userId.trim() : "";
    if (!userId) continue;
    const name =
      typeof record.name === "string"
        ? record.name.trim()
        : typeof record.displayName === "string"
          ? record.displayName.trim()
          : null;
    const trackResponses =
      typeof record.trackResponses === "boolean" ? record.trackResponses : trackResponsesDefault;
    recipients.push({
      userId,
      name: name?.length ? name : null,
      trackResponses,
    });
  }

  if (!prompt) {
    return NextResponse.json({ error: "Prompt is required" }, { status: 400 });
  }
  if (!recipients.length) {
    return NextResponse.json({ error: "At least one recipient is required" }, { status: 400 });
  }
  if (recipients.length > 25) {
    return NextResponse.json({ error: "Too many recipients (max 25)" }, { status: 400 });
  }

  const deps = createAssistantDependenciesForUser(supabaseUserId);
  const task = await createMessagingTask({
    ownerUserId: supabaseUserId,
    kind: payload?.kind && typeof payload.kind === "string" ? payload.kind : "assistant_broadcast",
    prompt,
    recipients,
    payload: {
      recipients: recipients.map((recipient) => ({
        userId: recipient.userId,
        name: recipient.name ?? null,
        trackResponses: recipient.trackResponses ?? false,
      })),
      trackResponses: trackResponsesDefault,
    },
  });
  const taskTitle = deriveTaskTitle(prompt);

  const targetMap = new Map(task.targets.map((target) => [target.target_user_id, target]));
  for (const recipient of recipients) {
    const target = targetMap.get(recipient.userId);
    if (!target) continue;
    try {
      const sendResult = await deps.sendAssistantMessage({
        conversationId: target.conversation_id,
        body: prompt,
        task: { id: task.task.id, title: taskTitle ?? prompt },
      });
      const persistedMessageId = sendResult?.messageId ?? target.message_id ?? "";
      await markRecipientMessaged({
        target,
        messageId: persistedMessageId || target.id,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to send message";
      await markRecipientFailed({
        target,
        error: message,
      });
    }
  }

  const summaries = await getAssistantTaskSummaries({
    ownerUserId: supabaseUserId,
    includeCompleted: true,
    limit: 30,
  });
  const summary = summaries.find((entry) => entry.id === task.task.id) ?? null;

  return NextResponse.json({ task: summary ?? { id: task.task.id } }, { status: 201 });
}
