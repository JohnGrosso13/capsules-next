import { listAssistantTasks, listTaskTargetsByTask } from "./repository";
import type { AssistantTaskTargetRow } from "./repository";
import type { AssistantTaskSummary } from "@/types/assistant";

function summarizeTargets(targets: AssistantTaskTargetRow[]): AssistantTaskSummary["totals"] & {
  lastResponseAt: string | null;
} {
  let awaitingResponses = 0;
  let responded = 0;
  let failed = 0;
  let completed = 0;
  let pending = 0;
  let lastResponseAt: string | null = null;

  for (const target of targets) {
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
    const targets = await listTaskTargetsByTask(task.id);
    const totals = summarizeTargets(targets);
    summaries.push({
      id: task.id,
      kind: task.kind,
      status: task.status,
      prompt: task.prompt,
      createdAt: task.created_at,
      updatedAt: task.updated_at,
      result: task.result ?? null,
      totals,
      lastResponseAt: totals.lastResponseAt,
    });
  }

  return summaries;
}
