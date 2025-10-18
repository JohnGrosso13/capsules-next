import { getDatabaseAdminClient } from "@/config/database";
import { CHAT_CONSTANTS } from "@/lib/chat/channels";
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

export type ChatMessageReactionRow = {
  message_id: string;
  user_id: string;
  emoji: string;
  created_at: string;
};

export type ChatConversationRow = {
  id: string;
  type: "group" | "direct";
  title: string;
  avatar_url: string | null;
  created_by: string;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
};

export type ChatConversationMemberRow = {
  conversation_id: string;
  user_id: string;
  role: "owner" | "admin" | "member";
  invited_by: string | null;
  joined_at: string;
  last_read_at: string | null;
  created_at: string;
  updated_at: string;
};

type UserIdentityRow = ChatParticipantRow & {
  clerk_id: string | null;
  email: string | null;
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const ILIKE_ESCAPE_PATTERN = /[%_\\]/g;

function escapeIlikePattern(value: string): string {
  return value.replace(ILIKE_ESCAPE_PATTERN, (match) => `\\${match}`);
}

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

const CHAT_CONVERSATION_COLUMNS =
  "id, type, title, avatar_url, created_by, archived_at, created_at, updated_at" as const;

const CHAT_CONVERSATION_MEMBER_COLUMNS =
  "conversation_id, user_id, role, invited_by, joined_at, last_read_at, created_at, updated_at" as const;

function normalizeConversationId(value: string): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeUserId(value: string): string {
  return typeof value === "string" ? value.trim() : "";
}

export async function upsertChatConversation(row: {
  id: string;
  created_by: string;
  type?: "group" | "direct";
  title?: string;
  avatar_url?: string | null;
  archived_at?: string | null;
}): Promise<ChatConversationRow> {
  const db = getDatabaseAdminClient();
  const normalizedId = normalizeConversationId(row.id);
  if (!normalizedId) {
    throw new Error("chat_conversations.upsert: conversation id is required");
  }
  const normalizedCreator = normalizeUserId(row.created_by);
  if (!normalizedCreator) {
    throw new Error("chat_conversations.upsert: creator id is required");
  }
  const payload = {
    id: normalizedId,
    type: row.type ?? "group",
    title: row.title ?? "",
    avatar_url: row.avatar_url ?? null,
    created_by: normalizedCreator,
    archived_at: row.archived_at ?? null,
  };
  const result = await db
    .from("chat_conversations")
    .upsert([payload], { onConflict: "id" })
    .select<ChatConversationRow>(CHAT_CONVERSATION_COLUMNS)
    .single();
  return expectResult(result, "chat_conversations.upsert");
}

export async function getChatConversationById(
  conversationId: string,
): Promise<ChatConversationRow | null> {
  const db = getDatabaseAdminClient();
  const trimmed = normalizeConversationId(conversationId);
  if (!trimmed) return null;
  const result = await db
    .from("chat_conversations")
    .select<ChatConversationRow>(CHAT_CONVERSATION_COLUMNS)
    .eq("id", trimmed)
    .maybeSingle();
  if (result.error) {
    throw wrapDatabaseError("chat_conversations.get", result.error);
  }
  return result.data ?? null;
}

export async function updateChatConversation(
  conversationId: string,
  changes: Partial<Pick<ChatConversationRow, "title" | "avatar_url" | "archived_at">>,
): Promise<ChatConversationRow | null> {
  const db = getDatabaseAdminClient();
  const trimmed = normalizeConversationId(conversationId);
  if (!trimmed) return null;
  const updates: Record<string, unknown> = {};
  if ("title" in changes) updates.title = changes.title ?? "";
  if ("avatar_url" in changes) updates.avatar_url = changes.avatar_url ?? null;
  if ("archived_at" in changes) updates.archived_at = changes.archived_at ?? null;
  if (!Object.keys(updates).length) {
    return getChatConversationById(trimmed);
  }
  const result = await db
    .from("chat_conversations")
    .update(updates)
    .eq("id", trimmed)
    .select<ChatConversationRow>(CHAT_CONVERSATION_COLUMNS)
    .maybeSingle();
  if (result.error) {
    throw wrapDatabaseError("chat_conversations.update", result.error);
  }
  return result.data ?? null;
}

export async function listChatConversationsByIds(
  conversationIds: string[],
): Promise<ChatConversationRow[]> {
  const uniqueIds = Array.from(
    new Set(conversationIds.map(normalizeConversationId).filter((value) => Boolean(value))),
  );
  if (!uniqueIds.length) return [];
  const db = getDatabaseAdminClient();
  const result = await db
    .from("chat_conversations")
    .select<ChatConversationRow>(CHAT_CONVERSATION_COLUMNS)
    .in("id", uniqueIds)
    .fetch();
  return expectArrayResult(result, "chat_conversations.list_by_ids");
}

export async function upsertChatConversationMembers(
  conversationId: string,
  members: Array<{
    user_id: string;
    role?: "owner" | "admin" | "member";
    invited_by?: string | null;
    joined_at?: string;
    last_read_at?: string | null;
  }>,
): Promise<ChatConversationMemberRow[]> {
  const trimmedConversation = normalizeConversationId(conversationId);
  if (!trimmedConversation) {
    throw new Error("chat_conversation_members.upsert: conversation id is required");
  }
  const payload = members
    .map((member) => {
      const userId = normalizeUserId(member.user_id);
      if (!userId) return null;
      const invitedBy = member.invited_by ? normalizeUserId(member.invited_by) : null;
      const record: {
        conversation_id: string;
        user_id: string;
        role: "owner" | "admin" | "member";
        invited_by: string | null;
        joined_at?: string;
        last_read_at: string | null;
      } = {
        conversation_id: trimmedConversation,
        user_id: userId,
        role: member.role ?? "member",
        invited_by: invitedBy,
        last_read_at: member.last_read_at ?? null,
      };
      if (member.joined_at) {
        record.joined_at = member.joined_at;
      }
      return record;
    })
    .filter(
      (value): value is {
        conversation_id: string;
        user_id: string;
        role: "owner" | "admin" | "member";
        invited_by: string | null;
        joined_at?: string;
        last_read_at: string | null;
      } => Boolean(value),
    );
  if (!payload.length) return [];
  const db = getDatabaseAdminClient();
  const result = await db
    .from("chat_conversation_members")
    .upsert(payload, { onConflict: "conversation_id,user_id", ignoreDuplicates: false })
    .select<ChatConversationMemberRow>(CHAT_CONVERSATION_MEMBER_COLUMNS)
    .fetch();
  return expectArrayResult(result, "chat_conversation_members.upsert");
}

export async function deleteChatConversationMembers(
  conversationId: string,
  userIds: string[],
): Promise<void> {
  const trimmedConversation = normalizeConversationId(conversationId);
  const uniqueUserIds = Array.from(
    new Set(userIds.map(normalizeUserId).filter((value) => Boolean(value))),
  );
  if (!trimmedConversation || !uniqueUserIds.length) return;
  const db = getDatabaseAdminClient();
  const result = await db
    .from("chat_conversation_members")
    .delete()
    .eq("conversation_id", trimmedConversation)
    .in("user_id", uniqueUserIds)
    .select("user_id")
    .fetch();
  expectArrayResult(result, "chat_conversation_members.delete");
}

export async function listChatConversationMembers(
  conversationId: string,
): Promise<ChatConversationMemberRow[]> {
  const trimmed = normalizeConversationId(conversationId);
  if (!trimmed) return [];
  const db = getDatabaseAdminClient();
  const result = await db
    .from("chat_conversation_members")
    .select<ChatConversationMemberRow>(CHAT_CONVERSATION_MEMBER_COLUMNS)
    .eq("conversation_id", trimmed)
    .order("joined_at", { ascending: true })
    .fetch();
  return expectArrayResult(result, "chat_conversation_members.list_by_conversation");
}

export async function listChatConversationMembershipsForUser(
  userId: string,
): Promise<ChatConversationMemberRow[]> {
  const trimmedUser = normalizeUserId(userId);
  if (!trimmedUser) return [];
  const db = getDatabaseAdminClient();
  const result = await db
    .from("chat_conversation_members")
    .select<ChatConversationMemberRow>(CHAT_CONVERSATION_MEMBER_COLUMNS)
    .eq("user_id", trimmedUser)
    .fetch();
  return expectArrayResult(result, "chat_conversation_members.list_by_user");
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

export async function findChatMessageById(messageId: string): Promise<ChatMessageRow | null> {
  const db = getDatabaseAdminClient();
  const trimmed = typeof messageId === "string" ? messageId.trim() : "";
  if (!trimmed) return null;
  const result = await db
    .from(TABLE)
    .select<ChatMessageRow>("id, conversation_id, sender_id, body, client_sent_at, created_at, updated_at")
    .eq("id", trimmed)
    .maybeSingle();
  if (result.error) {
    throw wrapDatabaseError("chat_messages.find_by_id", result.error);
  }
  return result.data ?? null;
}

export async function upsertChatMessageReaction(row: {
  message_id: string;
  user_id: string;
  emoji: string;
}): Promise<ChatMessageReactionRow> {
  const db = getDatabaseAdminClient();
  const result = await db
    .from("chat_message_reactions")
    .upsert([row], { onConflict: "message_id,user_id,emoji" })
    .select<ChatMessageReactionRow>("message_id, user_id, emoji, created_at")
    .single();
  return expectResult(result, "chat_message_reactions.upsert");
}

export async function deleteChatMessageReaction(params: {
  message_id: string;
  user_id: string;
  emoji: string;
}): Promise<void> {
  const db = getDatabaseAdminClient();
  const result = await db
    .from("chat_message_reactions")
    .delete()
    .eq("message_id", params.message_id)
    .eq("user_id", params.user_id)
    .eq("emoji", params.emoji)
    .limit(1)
    .select("message_id")
    .fetch();
  expectArrayResult(result, "chat_message_reactions.delete");
}

export async function listChatMessageReactions(
  messageIds: string[],
): Promise<ChatMessageReactionRow[]> {
  const uniqueIds = Array.from(
    new Set(
      messageIds
        .map((value) => (typeof value === "string" ? value.trim() : ""))
        .filter((value): value is string => Boolean(value)),
    ),
  );
  if (!uniqueIds.length) return [];
  const db = getDatabaseAdminClient();
  const result = await db
    .from("chat_message_reactions")
    .select<ChatMessageReactionRow>("message_id, user_id, emoji, created_at")
    .in("message_id", uniqueIds)
    .fetch();
  return expectArrayResult(result, "chat_message_reactions.list");
}

export async function listRecentMessagesForUser(
  normalizedUserId: string,
  options: { limit: number },
): Promise<ChatMessageRow[]> {
  const trimmed = typeof normalizedUserId === "string" ? normalizedUserId.trim() : "";
  if (!trimmed) return [];
  const db = getDatabaseAdminClient();
  const limit = Number.isFinite(options.limit) ? Math.max(1, Math.min(500, options.limit)) : 100;
  const leftPattern = `${CHAT_CONSTANTS.CONVERSATION_PREFIX}:${trimmed}:%`;
  const rightPattern = `${CHAT_CONSTANTS.CONVERSATION_PREFIX}:%:${trimmed}`;

  const result = await db
    .from(TABLE)
    .select<ChatMessageRow>(
      "id, conversation_id, sender_id, body, client_sent_at, created_at, updated_at",
    )
    .or(`conversation_id.like.${leftPattern},conversation_id.like.${rightPattern}`)
    .order("created_at", { ascending: false })
    .limit(limit)
    .fetch();

  return expectArrayResult(result, "chat_messages.list_recent_user");
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

export async function findUserIdentity(identifier: string): Promise<UserIdentityRow | null> {
  const db = getDatabaseAdminClient();
  const trimmed = typeof identifier === "string" ? identifier.trim() : "";
  if (!trimmed) return null;

  const selectColumns =
    "id, full_name, avatar_url, user_key, clerk_id, email" as const satisfies string;

  const attempt = async (
    column: "id" | "user_key" | "clerk_id" | "email",
    operator: "eq" | "ilike",
    value: string,
  ): Promise<UserIdentityRow | null> => {
    let query = db.from("users").select<UserIdentityRow>(selectColumns).limit(1);
    query = operator === "eq" ? query.eq(column, value) : query.ilike(column, value);
    const result = await query.maybeSingle();
    if (result.error && result.error.code !== "PGRST116") {
      throw wrapDatabaseError(`users.lookup.${column}.${operator}`, result.error);
    }
    return result.data;
  };

  const attempts: Array<{ column: "id" | "user_key" | "clerk_id" | "email"; operator: "eq" | "ilike"; value: string }> =
    [
      { column: "user_key", operator: "eq", value: trimmed },
      { column: "clerk_id", operator: "eq", value: trimmed },
    ];

  if (UUID_PATTERN.test(trimmed)) {
    attempts.unshift({ column: "id", operator: "eq", value: trimmed.toLowerCase() });
  }

  const ilikeValue = escapeIlikePattern(trimmed);
  attempts.push(
    { column: "user_key", operator: "ilike", value: ilikeValue },
    { column: "clerk_id", operator: "ilike", value: ilikeValue },
  );

  if (trimmed.includes("@")) {
    attempts.push(
      { column: "email", operator: "eq", value: trimmed },
      { column: "email", operator: "ilike", value: ilikeValue },
    );
  }

  for (const entry of attempts) {
    try {
      const found = await attempt(entry.column, entry.operator, entry.value);
      if (found) return found;
    } catch (error) {
      if (entry.column === "id" && entry.operator === "eq") {
        // Ignore invalid UUID casts for id.eq attempts; continue to other strategies.
        continue;
      }
      throw error;
    }
  }

  return null;
}
