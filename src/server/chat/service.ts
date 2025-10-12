import { parseConversationId, isGroupConversationId } from "@/lib/chat/channels";

import {
  fetchUsersByIds,
  listChatMessages,
  upsertChatMessage,
  type ChatMessageRow,
  type ChatParticipantRow,
} from "./repository";
import { publishDirectMessageEvent } from "@/services/realtime/chat";

export type ChatMessageRecord = {
  id: string;
  conversationId: string;
  senderId: string;
  body: string;
  sentAt: string;
};

export type ChatParticipantSummary = {
  id: string;
  name: string;
  avatar: string | null;
};

export class ChatServiceError extends Error {
  code: string;
  status: number;

  constructor(code: string, status: number, message: string) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

const MAX_BODY_LENGTH = 4000;

function sanitizeBody(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function normalizeId(value: string | null | undefined): string {
  if (typeof value !== "string") return "";
  return value.trim().toLowerCase();
}

function resolveSentAt(row: ChatMessageRow): string {
  return row.client_sent_at ?? row.created_at;
}

function toMessageRecord(row: ChatMessageRow): ChatMessageRecord {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    senderId: row.sender_id,
    body: row.body,
    sentAt: resolveSentAt(row),
  };
}

function toParticipantSummary(row: ChatParticipantRow | undefined, fallbackId: string): ChatParticipantSummary {
  if (!row) {
    return {
      id: fallbackId,
      name: fallbackId,
      avatar: null,
    };
  }
  const name =
    (typeof row.full_name === "string" && row.full_name.trim().length
      ? row.full_name.trim()
      : null) ??
    (typeof row.user_key === "string" && row.user_key.trim().length ? row.user_key.trim() : null) ??
    row.id;
  const avatar =
    typeof row.avatar_url === "string" && row.avatar_url.trim().length ? row.avatar_url.trim() : null;
  return {
    id: row.id,
    name,
    avatar,
  };
}

function buildConversationTitle(participants: ChatParticipantSummary[], senderId: string): string {
  const others = participants.filter((participant) => participant.id !== senderId);
  const primary = others[0] ?? participants[0] ?? null;
  return primary?.name ?? "Chat";
}

export async function sendDirectMessage(params: {
  conversationId: string;
  senderId: string;
  messageId: string;
  body: string;
  clientSentAt?: string | null;
}): Promise<{
  message: ChatMessageRecord;
  participants: ChatParticipantSummary[];
}> {
  if (!params.conversationId.trim()) {
    throw new ChatServiceError("invalid_conversation", 400, "A conversation id is required.");
  }
  if (isGroupConversationId(params.conversationId)) {
    throw new ChatServiceError(
      "unsupported_conversation",
      400,
      "Group chats are not yet supported for persistence.",
    );
  }

  const { left, right } = parseConversationId(params.conversationId);
  const senderIdTrimmed = params.senderId?.trim();
  if (!senderIdTrimmed) {
    throw new ChatServiceError("auth_required", 401, "Sign in to send a message.");
  }
  const senderNormalized = normalizeId(senderIdTrimmed);
  const isParticipant = senderNormalized === left || senderNormalized === right;
  if (!isParticipant) {
    throw new ChatServiceError(
      "forbidden",
      403,
      "You do not have access to this conversation.",
    );
  }

  const otherParticipant = senderNormalized === left ? right : left;
  const bodySanitized = sanitizeBody(params.body ?? "");
  if (!bodySanitized) {
    throw new ChatServiceError("invalid_body", 400, "Message text cannot be empty.");
  }
  if (bodySanitized.length > MAX_BODY_LENGTH) {
    throw new ChatServiceError(
      "message_too_long",
      400,
      `Message text must be ${MAX_BODY_LENGTH} characters or fewer.`,
    );
  }

  const participantRows = await fetchUsersByIds([
    senderNormalized,
    otherParticipant,
  ]);
  const participantMap = new Map(participantRows.map((row) => [row.id, row]));
  const participantSummaries: ChatParticipantSummary[] = [
    toParticipantSummary(participantMap.get(senderNormalized), senderNormalized),
    toParticipantSummary(participantMap.get(otherParticipant), otherParticipant),
  ].filter((participant, index, list) => list.findIndex((item) => item.id === participant.id) === index);

  let clientSentAt: string | null = null;
  if (typeof params.clientSentAt === "string" && params.clientSentAt.trim().length) {
    const parsedTimestamp = Date.parse(params.clientSentAt);
    if (!Number.isNaN(parsedTimestamp)) {
      clientSentAt = new Date(parsedTimestamp).toISOString();
    }
  }

  const messageRow = await upsertChatMessage({
    id: params.messageId,
    conversation_id: params.conversationId,
    sender_id: senderIdTrimmed,
    body: bodySanitized,
    client_sent_at: clientSentAt,
  });

  const messageRecord = toMessageRecord(messageRow);

  await publishDirectMessageEvent({
    conversationId: messageRecord.conversationId,
    messageId: messageRecord.id,
    senderId: messageRecord.senderId,
    body: messageRecord.body,
    sentAt: messageRecord.sentAt,
    participants: participantSummaries,
    session: {
      type: "direct",
      title: buildConversationTitle(participantSummaries, messageRecord.senderId),
    },
  });

  return {
    message: messageRecord,
    participants: participantSummaries,
  };
}

export async function getDirectConversationHistory(params: {
  conversationId: string;
  requesterId: string;
  before?: string | null;
  limit?: number;
}): Promise<{
  participants: ChatParticipantSummary[];
  messages: ChatMessageRecord[];
}> {
  if (!params.conversationId.trim()) {
    throw new ChatServiceError("invalid_conversation", 400, "A conversation id is required.");
  }
  if (isGroupConversationId(params.conversationId)) {
    throw new ChatServiceError(
      "unsupported_conversation",
      400,
      "Group chats are not yet supported for persistence.",
    );
  }
  const { left, right } = parseConversationId(params.conversationId);
  const requesterTrimmed = params.requesterId?.trim();
  if (!requesterTrimmed) {
    throw new ChatServiceError("auth_required", 401, "Sign in to view this conversation.");
  }
  const requesterNormalized = normalizeId(requesterTrimmed);
  const isParticipant = requesterNormalized === left || requesterNormalized === right;
  if (!isParticipant) {
    throw new ChatServiceError(
      "forbidden",
      403,
      "You do not have access to this conversation.",
    );
  }

  const participantRows = await fetchUsersByIds([left, right]);
  const participantMap = new Map(participantRows.map((row) => [row.id, row]));
  const participantSummaries: ChatParticipantSummary[] = [left, right]
    .map((id) => toParticipantSummary(participantMap.get(id), id))
    .filter((participant, index, list) => list.findIndex((item) => item.id === participant.id) === index);

  const messages = await listChatMessages(params.conversationId, {
    limit: params.limit ?? 50,
    before: params.before ?? null,
  });
  return {
    participants: participantSummaries,
    messages: messages.map(toMessageRecord),
  };
}
