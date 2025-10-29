import { getChatConversationId } from "@/lib/chat/channels";
import {
  insertAssistantTask,
  insertAssistantTaskTargets,
  listTaskTargetsByConversation,
  listTaskTargetsByTask,
  markTaskTargetFailed,
  markTaskTargetResponded,
  markTaskTargetSent,
  updateAssistantTask,
  type AssistantTaskRow,
  type AssistantTaskTargetRow,
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

type TargetData = {
  name?: string | null;
  trackResponses?: boolean;
  context?: Record<string, unknown> | null;
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
  const task = await insertAssistantTask({
    ownerUserId: options.ownerUserId,
    assistantUserId,
    kind: options.kind,
    status: "messaging",
    prompt: options.prompt,
    payload: options.payload ?? null,
  });

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

  if (!targetNeedsResponse(updated)) {
    await refreshTaskStatus(updated.task_id);
  }
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
