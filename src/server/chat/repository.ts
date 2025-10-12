import { getDatabaseAdminClient } from "@/config/database";
import type { DatabaseError, DatabaseResult } from "@/ports/database";

const TABLE = "chat_messages";

export type ChatMessageRow = {
  id: string;
  conversation_id: string;
  sender_id: string;
  body: string;
  client_sent_at: string | null;
  created_at: string;
  updated_at: string;
};

export type ChatParticipantRow = {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
  user_key: string | null;
};

function wrapDatabaseError(context: string, error: DatabaseError): Error {
  const message = context ? `${context}: ${error.message}` : error.message;
  const wrapped = new Error(message);
  const extended = wrapped as Error & Record<string, unknown>;
  if (error.code) extended.code = error.code;
  if (error.details) extended.details = error.details;
  if (error.hint) extended.hint = error.hint;
  return wrapped;
}

function expectResult<T>(result: DatabaseResult<T>, context: string): T {
  if (result.error) {
    throw wrapDatabaseError(context, result.error);
  }
  if (result.data === null || result.data === undefined) {
    throw new Error(`${context}: missing result data`);
  }
  return result.data;
}

function expectArrayResult<T>(result: DatabaseResult<T[]>, context: string): T[] {
  if (result.error) {
    throw wrapDatabaseError(context, result.error);
  }
  return result.data ?? [];
}

export async function upsertChatMessage(row: {
  id: string;
  conversation_id: string;
  sender_id: string;
  body: string;
  client_sent_at?: string | null;
}): Promise<ChatMessageRow> {
  const db = getDatabaseAdminClient();
  const result = await db
    .from(TABLE)
    .upsert([row], { onConflict: "id" })
    .select<ChatMessageRow>(
      "id, conversation_id, sender_id, body, client_sent_at, created_at, updated_at",
    )
    .single();
  return expectResult(result, "chat_messages.upsert");
}

export async function listChatMessages(
  conversationId: string,
  options: { limit: number; before?: string | null } = { limit: 50 },
): Promise<ChatMessageRow[]> {
  const db = getDatabaseAdminClient();
  const limit = Number.isFinite(options.limit) ? Math.max(1, Math.min(200, options.limit)) : 50;
  let query = db
    .from(TABLE)
    .select<ChatMessageRow>(
      "id, conversation_id, sender_id, body, client_sent_at, created_at, updated_at",
    )
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (options.before) {
    query = query.lt("created_at", options.before);
  }
  const result = await query.fetch();
  const rows = expectArrayResult(result, "chat_messages.list");
  return rows.slice().reverse();
}

export async function fetchUsersByIds(userIds: string[]): Promise<ChatParticipantRow[]> {
  const uniqueIds = Array.from(
    new Set(
      userIds
        .map((value) => (typeof value === "string" ? value.trim() : ""))
        .filter((value): value is string => Boolean(value)),
    ),
  );
  if (!uniqueIds.length) return [];
  const db = getDatabaseAdminClient();
  const result = await db
    .from("users")
    .select<ChatParticipantRow>("id, full_name, avatar_url, user_key")
    .in("id", uniqueIds)
    .fetch();
  return expectArrayResult(result, "chat_messages.participants");
}
