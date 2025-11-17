import { getDatabaseAdminClient } from "@/config/database";
import type { DatabaseResult } from "@/ports/database";

export type AssistantTaskRow = {
  id: string;
  owner_user_id: string;
  assistant_user_id: string;
  kind: string;
  status: string;
  prompt: string | null;
  payload: Record<string, unknown> | null;
  result: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
};

export type AssistantTaskTargetRow = {
  id: string;
  task_id: string;
  owner_user_id: string;
  target_user_id: string;
  conversation_id: string;
  message_id: string | null;
  status: string;
  last_response_message_id: string | null;
  last_response_at: string | null;
  data: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
};

const TASKS_TABLE = "assistant_tasks";
const TARGETS_TABLE = "assistant_task_targets";

function expectResult<T>(result: DatabaseResult<T>, context: string): T {
  if (result.error) {
    throw new Error(`${context}: ${result.error.message}`);
  }
  if (result.data === null || result.data === undefined) {
    throw new Error(`${context}: missing result data`);
  }
  return result.data;
}

function expectArrayResult<T>(result: DatabaseResult<T[]>, context: string): T[] {
  if (result.error) {
    throw new Error(`${context}: ${result.error.message}`);
  }
  return result.data ?? [];
}

export async function insertAssistantTask(row: {
  id?: string;
  ownerUserId: string;
  assistantUserId: string;
  kind: string;
  status?: string;
  prompt?: string | null;
  payload?: Record<string, unknown> | null;
}): Promise<AssistantTaskRow> {
  const db = getDatabaseAdminClient();
  const result = await db
    .from(TASKS_TABLE)
    .insert({
      id: row.id ?? undefined,
      owner_user_id: row.ownerUserId,
      assistant_user_id: row.assistantUserId,
      kind: row.kind,
      status: row.status ?? "pending",
      prompt: row.prompt ?? null,
      payload: row.payload ?? null,
    })
    .select<AssistantTaskRow>("*")
    .single();
  return expectResult(result, "assistant_tasks.insert");
}

export async function updateAssistantTask(row: {
  id: string;
  status?: string;
  result?: Record<string, unknown> | null;
  completedAt?: string | null;
}): Promise<AssistantTaskRow> {
  const db = getDatabaseAdminClient();
  const payload: Record<string, unknown> = {};
  if (row.status !== undefined) payload.status = row.status;
  if (row.result !== undefined) payload.result = row.result;
  if (row.completedAt !== undefined) payload.completed_at = row.completedAt;

  const result = await db
    .from(TASKS_TABLE)
    .update(payload)
    .eq("id", row.id)
    .select<AssistantTaskRow>("*")
    .single();
  return expectResult(result, "assistant_tasks.update");
}

export async function insertAssistantTaskTargets(
  rows: Array<{
    taskId: string;
    ownerUserId: string;
    targetUserId: string;
    conversationId: string;
    status?: string;
    data?: Record<string, unknown> | null;
  }>,
): Promise<AssistantTaskTargetRow[]> {
  if (!rows.length) return [];
  const payload = rows.map((row) => ({
    task_id: row.taskId,
    owner_user_id: row.ownerUserId,
    target_user_id: row.targetUserId,
    conversation_id: row.conversationId,
    status: row.status ?? "pending",
    data: row.data ?? null,
  }));
  const db = getDatabaseAdminClient();
  const result = await db
    .from(TARGETS_TABLE)
    .insert(payload)
    .select<AssistantTaskTargetRow>("*")
    .fetch();
  return expectArrayResult(result, "assistant_task_targets.insert");
}

export async function markTaskTargetSent(row: {
  id: string;
  messageId: string;
  status?: string;
  data?: Record<string, unknown> | null;
}): Promise<AssistantTaskTargetRow> {
  const db = getDatabaseAdminClient();
  const payload: Record<string, unknown> = {
    message_id: row.messageId,
  };
  if (row.status) payload.status = row.status;
  if (row.data !== undefined) payload.data = row.data;
  const result = await db
    .from(TARGETS_TABLE)
    .update(payload)
    .eq("id", row.id)
    .select<AssistantTaskTargetRow>("*")
    .single();
  return expectResult(result, "assistant_task_targets.mark_sent");
}

export async function markTaskTargetFailed(row: {
  id: string;
  status?: string;
  data?: Record<string, unknown> | null;
}): Promise<AssistantTaskTargetRow> {
  const db = getDatabaseAdminClient();
  const payload: Record<string, unknown> = {
    status: row.status ?? "failed",
  };
  if (row.data !== undefined) payload.data = row.data;
  const result = await db
    .from(TARGETS_TABLE)
    .update(payload)
    .eq("id", row.id)
    .select<AssistantTaskTargetRow>("*")
    .single();
  return expectResult(result, "assistant_task_targets.mark_failed");
}

export async function markTaskTargetResponded(row: {
  id: string;
  responseMessageId: string;
  respondedAt: string;
  data?: Record<string, unknown> | null;
}): Promise<AssistantTaskTargetRow> {
  const db = getDatabaseAdminClient();
  const payload: Record<string, unknown> = {
    status: "responded",
    last_response_message_id: row.responseMessageId,
    last_response_at: row.respondedAt,
  };
  if (row.data !== undefined) payload.data = row.data;
  const result = await db
    .from(TARGETS_TABLE)
    .update(payload)
    .eq("id", row.id)
    .select<AssistantTaskTargetRow>("*")
    .single();
  return expectResult(result, "assistant_task_targets.mark_responded");
}

export async function markTaskTargetCanceled(row: {
  id: string;
  data?: Record<string, unknown> | null;
}): Promise<AssistantTaskTargetRow> {
  const db = getDatabaseAdminClient();
  const payload: Record<string, unknown> = {
    status: "canceled",
  };
  if (row.data !== undefined) payload.data = row.data;
  const result = await db
    .from(TARGETS_TABLE)
    .update(payload)
    .eq("id", row.id)
    .select<AssistantTaskTargetRow>("*")
    .single();
  return expectResult(result, "assistant_task_targets.mark_canceled");
}

export async function listTaskTargetsByConversation(params: {
  ownerUserId: string;
  conversationId: string;
  statuses?: string[];
}): Promise<AssistantTaskTargetRow[]> {
  const db = getDatabaseAdminClient();
  let query = db
    .from(TARGETS_TABLE)
    .select<AssistantTaskTargetRow>("*")
    .eq("owner_user_id", params.ownerUserId)
    .eq("conversation_id", params.conversationId);
  if (Array.isArray(params.statuses) && params.statuses.length > 0) {
    query = query.in("status", params.statuses);
  }
  const result = await query.fetch();
  return expectArrayResult(result, "assistant_task_targets.list_by_conversation");
}

export async function getAssistantTaskById(taskId: string): Promise<AssistantTaskRow | null> {
  const db = getDatabaseAdminClient();
  const result = await db.from(TASKS_TABLE).select<AssistantTaskRow>("*").eq("id", taskId).maybeSingle();
  if (result.error) {
    throw new Error(`assistant_tasks.get: ${result.error.message}`);
  }
  return result.data ?? null;
}

export async function listTaskTargetsByTask(
  taskId: string,
): Promise<AssistantTaskTargetRow[]> {
  const db = getDatabaseAdminClient();
  const result = await db
    .from(TARGETS_TABLE)
    .select<AssistantTaskTargetRow>("*")
    .eq("task_id", taskId)
    .fetch();
  return expectArrayResult(result, "assistant_task_targets.list_by_task");
}

export async function listAssistantTasks(params: {
  ownerUserId: string;
  statuses?: string[];
  limit?: number;
}): Promise<AssistantTaskRow[]> {
  const db = getDatabaseAdminClient();
  let query = db
    .from(TASKS_TABLE)
    .select<AssistantTaskRow>("*")
    .eq("owner_user_id", params.ownerUserId)
    .order("updated_at", { ascending: false });
  if (Array.isArray(params.statuses) && params.statuses.length > 0) {
    query = query.in("status", params.statuses);
  }
  if (params.limit !== undefined) {
    query = query.limit(Math.max(1, params.limit));
  }
  const result = await query.fetch();
  return expectArrayResult(result, "assistant_tasks.list_by_owner");
}

export async function listAwaitingTargetsOlderThan(params: {
  olderThan: string;
  limit?: number;
}): Promise<AssistantTaskTargetRow[]> {
  const db = getDatabaseAdminClient();
  let query = db
    .from(TARGETS_TABLE)
    .select<AssistantTaskTargetRow>("*")
    .eq("status", "awaiting_response")
    .lt("updated_at", params.olderThan)
    .order("updated_at", { ascending: true });
  if (params.limit) {
    query = query.limit(params.limit);
  }
  const result = await query.fetch();
  return expectArrayResult(result, "assistant_task_targets.list_awaiting");
}

export async function markTaskTargetReminded(row: {
  id: string;
  data?: Record<string, unknown> | null;
}): Promise<AssistantTaskTargetRow> {
  const db = getDatabaseAdminClient();
  const payload: Record<string, unknown> = {
    data: row.data ?? null,
  };
  const result = await db
    .from(TARGETS_TABLE)
    .update(payload)
    .eq("id", row.id)
    .select<AssistantTaskTargetRow>("*")
    .single();
  const updated = expectResult(result, "assistant_task_targets.mark_reminded");
  return updated;
}
