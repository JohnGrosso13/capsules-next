import { listAssistantTasks, listTaskTargetsByTask } from "./repository";
import type { AssistantTaskTargetRow } from "./repository";
import type { AssistantTaskSummary } from "@/types/assistant";

function summarizeTargets(targets: AssistantTaskTargetRow[]): AssistantTaskSummary["totals"] & {
  lastResponseAt: string | null;
  recipientsDetail: AssistantTaskSummary["recipients"];
} {
  let awaitingResponses = 0;
  let responded = 0;
  let failed = 0;
  let completed = 0;
  let pending = 0;
  let lastResponseAt: string | null = null;
  const recipientsDetail: AssistantTaskSummary["recipients"] = [];

  for (const target of targets) {
    recipientsDetail.push({
      userId: target.target_user_id,
      name:
        typeof target.data === "object" && target.data && "name" in target.data
          ? (target.data as Record<string, unknown>).name?.toString() ?? null
          : null,
      status: target.status,
      conversationId: target.conversation_id,
    });
    switch (target.status) {
      case "awaiting_response":
        awaitingResponses += 1;
        break;
      case "responded":
        responded += 1;
        completed += 1;
        if (target.last_response_at) {
          if (!lastResponseAt || target.last_response_at > lastResponseAt) {
            lastResponseAt = target.last_response_at;
          }
        }
        break;
      case "failed":
        failed += 1;
        break;
      case "completed":
      case "canceled":
        completed += 1;
        break;
      default:
        pending += 1;
        break;
    }
  }

  return {
    recipients: targets.length,
    awaitingResponses,
    responded,
    failed,
    completed,
    pending,
    lastResponseAt,
    recipientsDetail,
  };
}

export async function getAssistantTaskSummaries(options: {
  ownerUserId: string;
  limit?: number;
  includeCompleted?: boolean;
}): Promise<AssistantTaskSummary[]> {
  const { ownerUserId, includeCompleted, limit } = options;
  const statuses = includeCompleted
    ? undefined
    : ["messaging", "pending", "awaiting_responses", "partial"];

  const taskQuery: {
    ownerUserId: string;
    statuses?: string[];
    limit?: number;
  } = {
    ownerUserId,
    limit: limit ?? 20,
  };
  if (statuses) {
    taskQuery.statuses = statuses;
  }

  const tasks = await listAssistantTasks(taskQuery);

  const summaries: AssistantTaskSummary[] = [];
  for (const task of tasks) {
    const payload = (task.payload && typeof task.payload === "object"
      ? (task.payload as Record<string, unknown>)
      : null) as Record<string, unknown> | null;
    const directionRaw = typeof payload?.direction === "string" ? payload.direction : null;
    const direction = directionRaw === "incoming" || directionRaw === "outgoing" ? directionRaw : "outgoing";
    const targets = await listTaskTargetsByTask(task.id);
    const totals = summarizeTargets(targets);
    const firstRecipient = totals.recipientsDetail.length > 0 ? totals.recipientsDetail[0] : null;
    const counterpartName =
      typeof payload?.fromName === "string"
        ? payload.fromName
        : typeof payload?.toName === "string"
          ? payload.toName
          : firstRecipient?.name ?? null;
    const counterpartUserId =
      typeof payload?.fromUserId === "string"
        ? payload.fromUserId
        : typeof payload?.toUserId === "string"
          ? payload.toUserId
          : firstRecipient?.userId ?? null;
    summaries.push({
      id: task.id,
      kind: task.kind,
      status: task.status,
      prompt: task.prompt,
      createdAt: task.created_at,
      updatedAt: task.updated_at,
      result: task.result ?? null,
      direction,
      counterpartName,
      counterpartUserId,
      recipients: totals.recipientsDetail,
      totals,
      lastResponseAt: totals.lastResponseAt,
    });
  }

  return summaries;
}
