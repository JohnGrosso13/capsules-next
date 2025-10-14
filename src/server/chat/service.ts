import { createHash } from "node:crypto";

import {
  getChatConversationId,
  parseConversationId,
  isGroupConversationId,
} from "@/lib/chat/channels";

import {
  fetchUsersByIds,
  listChatMessages,
  upsertChatMessage,
  findUserIdentity,
  listRecentMessagesForUser,
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

export type ChatConversationSummary = {
  conversationId: string;
  participants: ChatParticipantSummary[];
  lastMessage: ChatMessageRecord | null;
  session: {
    type: "direct";
    title: string;
    avatar: string | null;
    createdBy: string | null;
  };
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

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const MESSAGE_ID_NAMESPACE = "capsules.chat.message:v1";

function formatUuidFromBytes(bytes: Buffer): string {
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function canonicalizeMessageId(messageId: string, conversationId: string): string {
  const trimmed = typeof messageId === "string" ? messageId.trim() : "";
  if (!trimmed) {
    throw new ChatServiceError("invalid_message_id", 400, "Message id is required.");
  }
  if (UUID_PATTERN.test(trimmed)) {
    return trimmed.toLowerCase();
  }

  const digest = createHash("sha256")
    .update(MESSAGE_ID_NAMESPACE)
    .update("|")
    .update(conversationId)
    .update("|")
    .update(trimmed)
    .digest();

  const uuidBytes = Buffer.from(digest.subarray(0, 16));
  uuidBytes[6] = ((uuidBytes[6] ?? 0) & 0x0f) | 0x50;
  uuidBytes[8] = ((uuidBytes[8] ?? 0) & 0x3f) | 0x80;

  return formatUuidFromBytes(uuidBytes);
}

type ResolvedIdentity = {
  canonicalId: string;
  profile: ChatParticipantRow | null;
};

async function resolveIdentity(
  cache: Map<string, ResolvedIdentity | null>,
  identifier: string,
  original?: string | null,
): Promise<ResolvedIdentity | null> {
  const normalized = normalizeId(identifier);
  if (!normalized) return null;
  if (cache.has(normalized)) {
    return cache.get(normalized) ?? null;
  }
  if (UUID_PATTERN.test(normalized)) {
    const resolved: ResolvedIdentity = { canonicalId: normalized, profile: null };
    cache.set(normalized, resolved);
    return resolved;
  }

  const probes = new Set<string>();
  if (original && typeof original === "string" && original.trim()) {
    probes.add(original.trim());
  }
  probes.add(identifier);
  probes.add(normalized);

  for (const probe of probes) {
    const match = await findUserIdentity(probe);
    if (match) {
      const profile: ChatParticipantRow = {
        id: match.id,
        full_name: match.full_name,
        avatar_url: match.avatar_url,
        user_key: match.user_key,
      };
      const resolved: ResolvedIdentity = { canonicalId: match.id, profile };
      cache.set(normalized, resolved);
      const probeNormalized = normalizeId(probe);
      if (probeNormalized && probeNormalized !== normalized) {
        cache.set(probeNormalized, resolved);
      }
      return resolved;
    }
  }

  cache.set(normalized, null);
  return null;
}

function mergeParticipantMaps(
  primary: Map<string, ChatParticipantRow>,
  fallbacks: Iterable<ResolvedIdentity>,
) {
  for (const entry of fallbacks) {
    if (!entry?.profile) continue;
    if (!primary.has(entry.canonicalId)) {
      primary.set(entry.canonicalId, entry.profile);
    }
  }
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
  const identityCache = new Map<string, ResolvedIdentity | null>();
  const leftResolved = await resolveIdentity(identityCache, left);
  const rightResolved = await resolveIdentity(identityCache, right);
  const senderResolved = await resolveIdentity(identityCache, senderNormalized, senderIdTrimmed);

  if (!leftResolved || !rightResolved) {
    throw new ChatServiceError(
      "invalid_conversation",
      404,
      "That conversation could not be found.",
    );
  }
  if (!senderResolved) {
    throw new ChatServiceError("auth_required", 401, "Sign in to send a message.");
  }

  const canonicalSenderId = senderResolved.canonicalId;
  const canonicalLeft = leftResolved.canonicalId;
  const canonicalRight = rightResolved.canonicalId;
  const isParticipant =
    canonicalSenderId === canonicalLeft || canonicalSenderId === canonicalRight;
  if (!isParticipant && senderNormalized !== left && senderNormalized !== right) {
    throw new ChatServiceError(
      "forbidden",
      403,
      "You do not have access to this conversation.",
    );
  }

  const canonicalConversationId = getChatConversationId(canonicalLeft, canonicalRight);
  const canonicalMessageId = canonicalizeMessageId(params.messageId, canonicalConversationId);

  const otherResolved =
    canonicalSenderId === canonicalLeft ? rightResolved : leftResolved;
  const otherCanonicalId = otherResolved.canonicalId;
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

  const participantIds = Array.from(new Set([canonicalSenderId, otherCanonicalId]));
  const participantRows = await fetchUsersByIds(participantIds);
  const participantMap = new Map(participantRows.map((row) => [row.id, row]));
  mergeParticipantMaps(participantMap, [
    senderResolved,
    leftResolved,
    rightResolved,
  ]);
  const participantSummaries: ChatParticipantSummary[] = [
    toParticipantSummary(participantMap.get(canonicalSenderId), canonicalSenderId),
    toParticipantSummary(participantMap.get(otherCanonicalId), otherCanonicalId),
  ].filter((participant, index, list) => list.findIndex((item) => item.id === participant.id) === index);

  let clientSentAt: string | null = null;
  if (typeof params.clientSentAt === "string" && params.clientSentAt.trim().length) {
    const parsedTimestamp = Date.parse(params.clientSentAt);
    if (!Number.isNaN(parsedTimestamp)) {
      clientSentAt = new Date(parsedTimestamp).toISOString();
    }
  }

  const messageRow = await upsertChatMessage({
    id: canonicalMessageId,
    conversation_id: canonicalConversationId,
    sender_id: canonicalSenderId,
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
  conversationId: string;
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
  const identityCache = new Map<string, ResolvedIdentity | null>();
  const leftResolved = await resolveIdentity(identityCache, left);
  const rightResolved = await resolveIdentity(identityCache, right);
  const requesterResolved = await resolveIdentity(identityCache, requesterNormalized, requesterTrimmed);

  if (!leftResolved || !rightResolved) {
    throw new ChatServiceError(
      "invalid_conversation",
      404,
      "That conversation could not be found.",
    );
  }

  const canonicalRequester =
    requesterResolved?.canonicalId ?? requesterNormalized;
  const canonicalLeft = leftResolved.canonicalId;
  const canonicalRight = rightResolved.canonicalId;
  const isParticipant =
    canonicalRequester === canonicalLeft ||
    canonicalRequester === canonicalRight ||
    requesterNormalized === left ||
    requesterNormalized === right;

  if (!isParticipant) {
    throw new ChatServiceError(
      "forbidden",
      403,
      "You do not have access to this conversation.",
    );
  }

  const canonicalConversationId = getChatConversationId(canonicalLeft, canonicalRight);

  const participantRows = await fetchUsersByIds([canonicalLeft, canonicalRight]);
  const participantMap = new Map(participantRows.map((row) => [row.id, row]));
  mergeParticipantMaps(participantMap, [leftResolved, rightResolved]);
  const participantSummaries: ChatParticipantSummary[] = [left, right]
    .map((id, index) => {
      const resolved = index === 0 ? leftResolved : rightResolved;
      const canonical = resolved?.canonicalId ?? id;
      const row = resolved ? participantMap.get(resolved.canonicalId) : participantMap.get(canonical);
      return toParticipantSummary(row, canonical);
    })
    .filter((participant, index, list) => list.findIndex((item) => item.id === participant.id) === index);

  let messages = await listChatMessages(canonicalConversationId, {
    limit: params.limit ?? 50,
    before: params.before ?? null,
  });
  if (
    messages.length === 0 &&
    canonicalConversationId !== params.conversationId
  ) {
    messages = await listChatMessages(params.conversationId, {
      limit: params.limit ?? 50,
      before: params.before ?? null,
    });
  }

  return {
    conversationId: messages.length ? canonicalConversationId : params.conversationId,
    participants: participantSummaries,
    messages: messages.map(toMessageRecord),
  };
}

export async function listRecentDirectConversations(params: {
  userId: string;
  limit?: number;
}): Promise<ChatConversationSummary[]> {
  const trimmedUser = params.userId?.trim();
  if (!trimmedUser) {
    throw new ChatServiceError("auth_required", 401, "Sign in to view messages.");
  }
  const normalizedUser = normalizeId(trimmedUser);
  if (!normalizedUser) {
    throw new ChatServiceError("auth_required", 401, "Sign in to view messages.");
  }

  const identityCache = new Map<string, ResolvedIdentity | null>();
  const requesterResolved = await resolveIdentity(identityCache, normalizedUser, trimmedUser);
  if (!requesterResolved) {
    throw new ChatServiceError("auth_required", 401, "Sign in to view messages.");
  }

  const canonicalUserId = requesterResolved.canonicalId;
  const normalizedCanonicalUserId = normalizeId(canonicalUserId);
  if (!normalizedCanonicalUserId) {
    throw new ChatServiceError("auth_required", 401, "Sign in to view messages.");
  }

  const requestedLimit = Number.isFinite(params.limit) ? Number(params.limit) : 25;
  const conversationLimit = Math.max(1, Math.min(100, requestedLimit));
  const fetchLimit = Math.min(500, conversationLimit * 15);

  const recentRows = await listRecentMessagesForUser(normalizedCanonicalUserId, {
    limit: fetchLimit,
  });

  if (!recentRows.length) return [];

  const latestByConversation = new Map<string, ChatMessageRow>();
  recentRows.forEach((row) => {
    if (!row?.conversation_id) return;
    if (!latestByConversation.has(row.conversation_id)) {
      latestByConversation.set(row.conversation_id, row);
    }
  });

  if (!latestByConversation.size) return [];

  const conversationEntries = Array.from(latestByConversation.values())
    .sort((a, b) => Date.parse(resolveSentAt(b)) - Date.parse(resolveSentAt(a)))
    .slice(0, conversationLimit)
    .map((row) => {
      try {
        const { left, right } = parseConversationId(row.conversation_id);
        if (left !== normalizedCanonicalUserId && right !== normalizedCanonicalUserId) {
          return null;
        }
        return { row, left, right };
      } catch {
        return null;
      }
    })
    .filter((entry): entry is { row: ChatMessageRow; left: string; right: string } =>
      entry !== null,
    );

  const participantIdSet = new Set<string>();
  conversationEntries.forEach(({ left, right }) => {
    if (left) participantIdSet.add(left);
    if (right) participantIdSet.add(right);
  });

  const participantRows = await fetchUsersByIds(Array.from(participantIdSet));
  const participantMap = new Map(participantRows.map((row) => [row.id, row]));

  const summaries: ChatConversationSummary[] = [];

  conversationEntries.forEach(({ row, left, right }) => {
    const resolvedLeft = participantMap.get(left) ?? null;
    const resolvedRight = participantMap.get(right) ?? null;

    const participants = [
      toParticipantSummary(resolvedLeft ?? undefined, left),
      toParticipantSummary(resolvedRight ?? undefined, right),
    ].filter(
      (participant, index, list) =>
        list.findIndex((item) => item.id === participant.id) === index,
    );

    if (!participants.some((participant) => participant.id === canonicalUserId)) {
      participants.push(toParticipantSummary(participantMap.get(canonicalUserId), canonicalUserId));
    }

    const messageRecord = toMessageRecord(row);
    const sessionTitle = buildConversationTitle(participants, canonicalUserId);
    const remoteParticipant =
      participants.find((participant) => participant.id !== canonicalUserId) ?? null;

    summaries.push({
      conversationId: row.conversation_id,
      participants,
      lastMessage: messageRecord,
      session: {
        type: "direct",
        title: sessionTitle,
        avatar: remoteParticipant?.avatar ?? null,
        createdBy: null,
      },
    });
  });

  return summaries;
}
