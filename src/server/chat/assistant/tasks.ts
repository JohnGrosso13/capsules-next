import { getChatConversationId } from "@/lib/chat/channels";
import {
  insertAssistantTask,
  insertAssistantTaskTargets,
  getAssistantTaskById,
  listTaskTargetsByConversation,
  listTaskTargetsByTask,
  markTaskTargetFailed,
  markTaskTargetCanceled,
  markTaskTargetResponded,
  markTaskTargetSent,
  updateAssistantTask,
  type AssistantTaskRow,
  type AssistantTaskTargetRow,
  deleteAssistantTask,
  deleteTaskTargetsByTask,
} from "./repository";
import { ASSISTANT_USER_ID } from "@/shared/assistant/constants";

export type MessagingRecipient = {
  userId: string;
  name?: string | null;
  trackResponses?: boolean;
  context?: Record<string, unknown> | null;
};

export type MessagingTask = {
  task: AssistantTaskRow;
  targets: AssistantTaskTargetRow[];
};

export function deriveTaskTitle(prompt: string | null | undefined): string | null {
  if (typeof prompt !== "string") return null;
  const lines = prompt.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (!lines.length) return null;
  const title = lines[0] ?? "";
  return title.slice(0, 160);
}

export function getTaskConversationId(ownerUserId: string, assistantUserId: string = ASSISTANT_USER_ID): string {
  return getChatConversationId(ownerUserId, assistantUserId);
}

type TargetData = {
  name?: string | null;
  trackResponses?: boolean;
  context?: Record<string, unknown> | null;
  mirrorTaskId?: string | null;
  originatorUserId?: string | null;
  originatorName?: string | null;
  errors?: string[];
  responses?: Array<{
    messageId: string;
    message: string;
    receivedAt: string;
  }>;
};

function parseTargetData(input: Record<string, unknown> | null | undefined): TargetData {
  const data: TargetData = {};
  if (!input || typeof input !== "object") return data;
  if (typeof input.name === "string") {
    data.name = input.name;
  }
  const trackRaw =
    typeof input.trackResponses === "boolean"
      ? input.trackResponses
      : typeof (input as Record<string, unknown>).track_responses === "boolean"
        ? ((input as Record<string, unknown>).track_responses as boolean)
        : undefined;
  if (trackRaw !== undefined) {
    data.trackResponses = trackRaw;
  }
  const contextValue = (input as Record<string, unknown>).context;
  if (contextValue && typeof contextValue === "object") {
    data.context = contextValue as Record<string, unknown>;
  }
  if (typeof input.mirrorTaskId === "string") {
    data.mirrorTaskId = input.mirrorTaskId;
  }
  if (typeof input.originatorUserId === "string") {
    data.originatorUserId = input.originatorUserId;
  }
  if (typeof input.originatorName === "string") {
    data.originatorName = input.originatorName;
  }
  const errorsValue = (input as Record<string, unknown>).errors;
  if (Array.isArray(errorsValue)) {
    const normalizedErrors = errorsValue.filter(
      (entry): entry is string => typeof entry === "string" && entry.trim().length > 0,
    );
    if (normalizedErrors.length) {
      data.errors = normalizedErrors;
    }
  }
  const responsesValue = (input as Record<string, unknown>).responses;
  if (Array.isArray(responsesValue)) {
    const normalizedResponses = responsesValue
      .map((entry) => {
        if (!entry || typeof entry !== "object") return null;
        const raw = entry as Record<string, unknown>;
        const messageId = typeof raw.messageId === "string" ? raw.messageId : null;
        const message = typeof raw.message === "string" ? raw.message : null;
        const receivedAt = typeof raw.receivedAt === "string" ? raw.receivedAt : null;
        if (!messageId || !message || !receivedAt) return null;
        return { messageId, message, receivedAt };
      })
      .filter((value): value is { messageId: string; message: string; receivedAt: string } =>
        Boolean(value),
      );
    if (normalizedResponses.length) {
      data.responses = normalizedResponses;
    }
  }
  return data;
}

function serializeTargetData(data: TargetData): Record<string, unknown> {
  const payload: Record<string, unknown> = {};
  if (data.name) payload.name = data.name;
  if (typeof data.trackResponses === "boolean") payload.trackResponses = data.trackResponses;
  if (data.context) payload.context = data.context;
  if (data.mirrorTaskId) payload.mirrorTaskId = data.mirrorTaskId;
  if (data.originatorUserId) payload.originatorUserId = data.originatorUserId;
  if (data.originatorName) payload.originatorName = data.originatorName;
  if (data.errors && data.errors.length) payload.errors = data.errors;
  if (data.responses && data.responses.length) payload.responses = data.responses;
  return payload;
}

function targetNeedsResponse(target: AssistantTaskTargetRow): boolean {
  const data = parseTargetData(target.data);
  return Boolean(data.trackResponses);
}

async function refreshTaskStatus(taskId: string): Promise<AssistantTaskRow> {
  const targets = await listTaskTargetsByTask(taskId);
  let awaiting = 0;
  let failures = 0;
  let responded = 0;
  let totalTracked = 0;

  targets.forEach((target) => {
    if (!targetNeedsResponse(target)) return;
    totalTracked += 1;
    if (target.status === "awaiting_response") awaiting += 1;
    else if (target.status === "failed") failures += 1;
    else if (target.status === "responded") responded += 1;
  });

  let status = "pending";
  if (totalTracked === 0) {
    status = "completed";
  } else if (responded >= totalTracked || awaiting === 0) {
    status = failures > 0 && responded < totalTracked ? "partial" : "completed";
  } else {
    status = "awaiting_responses";
  }

  const completedAt =
    status === "completed" || status === "partial" ? new Date().toISOString() : null;

  return updateAssistantTask({
    id: taskId,
    status,
    completedAt,
  });
}

export async function createMessagingTask(options: {
  ownerUserId: string;
  assistantUserId?: string;
  kind: string;
  prompt: string;
  payload?: Record<string, unknown> | null;
  recipients: MessagingRecipient[];
}): Promise<MessagingTask> {
  const assistantUserId = options.assistantUserId ?? ASSISTANT_USER_ID;
  const payloadTitle =
    options.payload && typeof (options.payload as Record<string, unknown>).title === "string"
      ? ((options.payload as Record<string, unknown>).title as string)
      : null;
  const taskTitle = deriveTaskTitle(options.prompt) ?? deriveTaskTitle(payloadTitle) ?? payloadTitle;
  const primaryRecipient = options.recipients[0];
  const payloadFromName =
    options.payload && typeof options.payload === "object"
      ? (options.payload as Record<string, unknown>).fromName
      : null;
  const normalizedFromName = typeof payloadFromName === "string" ? payloadFromName : null;
  const task = await insertAssistantTask({
    ownerUserId: options.ownerUserId,
    assistantUserId,
    kind: options.kind,
    status: "messaging",
    prompt: options.prompt,
    payload: {
      ...(options.payload ?? {}),
      direction: "outgoing",
      toCount: options.recipients.length,
      toName: primaryRecipient?.name ?? null,
      toUserId: primaryRecipient?.userId ?? null,
      title: taskTitle,
      conversationId: getTaskConversationId(options.ownerUserId, assistantUserId),
    },
  });

  const mirrorTaskMap = new Map<string, { taskId: string; targetId: string | null }>();

  for (const recipient of options.recipients) {
    const mirrorTask = await insertAssistantTask({
      ownerUserId: recipient.userId,
      assistantUserId,
      kind: options.kind,
      status: "awaiting_responses",
      prompt: options.prompt,
      payload: {
        direction: "incoming",
        fromUserId: options.ownerUserId,
        fromName: normalizedFromName ?? options.ownerUserId,
        sourceTaskId: task.id,
        title: taskTitle,
        conversationId: getTaskConversationId(recipient.userId, assistantUserId),
      },
    });
    const mirrorTargets = await insertAssistantTaskTargets([
      {
        taskId: mirrorTask.id,
        ownerUserId: recipient.userId,
        targetUserId: options.ownerUserId,
        conversationId: getChatConversationId(recipient.userId, options.ownerUserId),
        status: "awaiting_response",
        data: serializeTargetData({
          name: recipient.name ?? null,
          trackResponses: true,
          originatorUserId: options.ownerUserId,
          originatorName: normalizedFromName ?? options.ownerUserId,
        }),
      },
    ]);
    mirrorTaskMap.set(recipient.userId, { taskId: mirrorTask.id, targetId: mirrorTargets[0]?.id ?? null });
  }

  const targets = await insertAssistantTaskTargets(
    options.recipients.map((recipient) => ({
      taskId: task.id,
      ownerUserId: options.ownerUserId,
      targetUserId: recipient.userId,
      conversationId: getChatConversationId(options.ownerUserId, recipient.userId),
      status: "pending",
      data: serializeTargetData({
        name: recipient.name ?? null,
        trackResponses: recipient.trackResponses ?? false,
        context: recipient.context ?? null,
        mirrorTaskId: mirrorTaskMap.get(recipient.userId)?.taskId ?? null,
      }),
    })),
  );

  return { task, targets };
}

export async function markRecipientMessaged(params: {
  target: AssistantTaskTargetRow;
  messageId: string;
}): Promise<AssistantTaskTargetRow> {
  const data = parseTargetData(params.target.data);
  const nextStatus = targetNeedsResponse(params.target) ? "awaiting_response" : "completed";
  const updated = await markTaskTargetSent({
    id: params.target.id,
    messageId: params.messageId,
    status: nextStatus,
    data: serializeTargetData(data),
  });

  if (data.mirrorTaskId) {
    const mirrorTargets = await listTaskTargetsByTask(data.mirrorTaskId);
    const mirrorTarget = mirrorTargets[0];
    if (mirrorTarget) {
      await markTaskTargetSent({
        id: mirrorTarget.id,
        messageId: params.messageId,
        status: "awaiting_response",
        data: mirrorTarget.data ?? null,
      });
      await refreshTaskStatus(data.mirrorTaskId);
    }
  }

  // Keep the parent task in sync so it can transition to awaiting_responses / completed promptly.
  await refreshTaskStatus(updated.task_id);
  return updated;
}

export async function markRecipientFailed(params: {
  target: AssistantTaskTargetRow;
  error: string;
}): Promise<AssistantTaskTargetRow> {
  const data = parseTargetData(params.target.data);
  const errors = data.errors ? [...data.errors] : [];
  errors.push(params.error);
  data.errors = errors;
  const updated = await markTaskTargetFailed({
    id: params.target.id,
    status: "failed",
    data: serializeTargetData(data),
  });
  if (data.mirrorTaskId) {
    const mirrorTargets = await listTaskTargetsByTask(data.mirrorTaskId);
    const mirrorTarget = mirrorTargets[0];
    if (mirrorTarget) {
      await markTaskTargetFailed({
        id: mirrorTarget.id,
        status: "failed",
        data: mirrorTarget.data ?? null,
      });
      await refreshTaskStatus(data.mirrorTaskId);
    }
  }
  await refreshTaskStatus(updated.task_id);
  return updated;
}

export type TaskResponseRecord = {
  ownerUserId: string;
  assistantUserId: string;
  targetUserId: string;
  targetName: string | null;
  taskId: string;
  snippet: string;
  outstandingCount: number;
};

export async function recordRecipientResponse(params: {
  target: AssistantTaskTargetRow;
  messageId: string;
  messageBody: string;
  receivedAt: string;
}): Promise<TaskResponseRecord | null> {
  if (!targetNeedsResponse(params.target)) {
    return null;
  }
  const data = parseTargetData(params.target.data);
  const snippet = params.messageBody.slice(0, 360).trim();
  const responses = data.responses ? [...data.responses] : [];
  responses.push({
    messageId: params.messageId,
    message: snippet,
    receivedAt: params.receivedAt,
  });
  data.responses = responses;

  const updated = await markTaskTargetResponded({
    id: params.target.id,
    responseMessageId: params.messageId,
    respondedAt: params.receivedAt,
    data: serializeTargetData(data),
  });
  const refreshed = await refreshTaskStatus(updated.task_id);
  const outstandingTargets = await listTaskTargetsByTask(updated.task_id);
  const awaitingCount = outstandingTargets.filter(
    (target) => targetNeedsResponse(target) && target.status === "awaiting_response",
  ).length;
  if (data.mirrorTaskId) {
    const mirrorTargets = await listTaskTargetsByTask(data.mirrorTaskId);
    const mirrorTarget = mirrorTargets[0];
    if (mirrorTarget) {
      await markTaskTargetResponded({
        id: mirrorTarget.id,
        responseMessageId: params.messageId,
        respondedAt: params.receivedAt,
        data: mirrorTarget.data ?? null,
      });
      await refreshTaskStatus(data.mirrorTaskId);
    }
  }

  return {
    ownerUserId: updated.owner_user_id,
    assistantUserId: refreshed.assistant_user_id,
    targetUserId: updated.target_user_id,
    targetName: data.name ?? null,
    taskId: updated.task_id,
    snippet,
    outstandingCount: awaitingCount,
  };
}

export async function findAwaitingTargetsForConversation(params: {
  ownerUserId: string;
  conversationId: string;
}): Promise<AssistantTaskTargetRow[]> {
  const results = await listTaskTargetsByConversation({
    ownerUserId: params.ownerUserId,
    conversationId: params.conversationId,
    statuses: ["awaiting_response"],
  });
  return results.filter((target) => targetNeedsResponse(target));
}

export async function cancelAssistantTask(params: {
  ownerUserId: string;
  taskId: string;
}): Promise<{
  ok: true;
  task: AssistantTaskRow;
  canceledTargets: number;
} | { ok: false; status: number; error: string }> {
  const task = await getAssistantTaskById(params.taskId);
  if (!task) {
    return { ok: false, status: 404, error: "Task not found" };
  }
  if (task.owner_user_id !== params.ownerUserId) {
    return { ok: false, status: 403, error: "Forbidden" };
  }
  if (task.status === "completed" || task.status === "partial" || task.status === "canceled") {
    return { ok: false, status: 400, error: "Task is already finalized" };
  }

  const targets = await listTaskTargetsByTask(task.id);
  let canceledTargets = 0;
  for (const target of targets) {
    if (target.status === "responded" || target.status === "completed") continue;
    await markTaskTargetCanceled({ id: target.id, data: target.data ?? null });
    const data = parseTargetData(target.data);
    if (data.mirrorTaskId) {
      const mirrorTargets = await listTaskTargetsByTask(data.mirrorTaskId);
      const mirrorTarget = mirrorTargets[0];
      if (mirrorTarget && mirrorTarget.status !== "responded" && mirrorTarget.status !== "completed") {
        await markTaskTargetCanceled({ id: mirrorTarget.id, data: mirrorTarget.data ?? null });
        await updateAssistantTask({
          id: data.mirrorTaskId,
          status: "canceled",
          completedAt: new Date().toISOString(),
          result: { canceled: true },
        });
      }
    }
    canceledTargets += 1;
  }

  const updated = await updateAssistantTask({
    id: task.id,
    status: "canceled",
    completedAt: new Date().toISOString(),
    result: { ...(task.result ?? {}), canceled: true },
  });

  return { ok: true, task: updated, canceledTargets };
}

export async function removeAssistantTask(params: {
  ownerUserId: string;
  taskId: string;
}): Promise<
  | { ok: true; taskId: string; removedTargets: number }
  | { ok: false; status: number; error: string }
> {
  const task = await getAssistantTaskById(params.taskId);
  if (!task) {
    return { ok: false, status: 404, error: "Task not found" };
  }
  if (task.owner_user_id !== params.ownerUserId) {
    return { ok: false, status: 403, error: "Forbidden" };
  }
  if (task.status !== "completed" && task.status !== "partial" && task.status !== "canceled") {
    return { ok: false, status: 400, error: "Task is still active" };
  }

  const targets = await listTaskTargetsByTask(task.id);
  await deleteTaskTargetsByTask({ taskId: task.id, ownerUserId: params.ownerUserId });
  await deleteAssistantTask({ id: task.id, ownerUserId: params.ownerUserId });

  return { ok: true, taskId: task.id, removedTargets: targets.length };
}
