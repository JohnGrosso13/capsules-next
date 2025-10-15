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
  findChatMessageById,
  listChatMessageReactions,
  upsertChatMessageReaction,
  deleteChatMessageReaction,
  type ChatMessageRow,
  type ChatParticipantRow,
  type ChatMessageReactionRow,
} from "./repository";
import { publishDirectMessageEvent, publishReactionEvent } from "@/services/realtime/chat";

export type ChatMessageRecord = {
  id: string;
  conversationId: string;
  senderId: string;
  body: string;
  sentAt: string;
  reactions: ChatMessageReactionRecord[];
};

export type ChatMessageReactionRecord = {
  emoji: string;
  count: number;
  users: ChatParticipantSummary[];
};

export type ChatReactionMutationResult = {
  conversationId: string;
  messageId: string;
  reactions: ChatMessageReactionRecord[];
  participants: ChatParticipantSummary[];
  actor: ChatParticipantSummary;
  emoji: string;
  action: "added" | "removed";
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
const MAX_REACTION_EMOJI_LENGTH = 32;

function sanitizeBody(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function sanitizeReactionEmoji(value: string): string {
  if (typeof value !== "string") return "";
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (trimmed.length > MAX_REACTION_EMOJI_LENGTH) {
    return trimmed.slice(0, MAX_REACTION_EMOJI_LENGTH);
  }
  return trimmed;
}

function normalizeId(value: string | null | undefined): string {
  if (typeof value !== "string") return "";
  return value.trim().toLowerCase();
}

function resolveSentAt(row: ChatMessageRow): string {
  return row.client_sent_at ?? row.created_at;
}

function toMessageRecord(
  row: ChatMessageRow,
  reactions: ChatMessageReactionRecord[] = [],
): ChatMessageRecord {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    senderId: row.sender_id,
    body: row.body,
    sentAt: resolveSentAt(row),
    reactions,
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

function buildReactionSummaries(
  rows: ChatMessageReactionRow[],
  participantMap: Map<string, ChatParticipantRow>,
): Map<string, ChatMessageReactionRecord[]> {
  const reactionMap = new Map<string, Map<string, Map<string, ChatParticipantSummary>>>();

  rows.forEach((row) => {
    const emoji = sanitizeReactionEmoji(row.emoji ?? "");
    if (!emoji) return;
    const reactionMessageId = row.message_id;
    if (!reactionMessageId) return;

    const participantSummary = toParticipantSummary(participantMap.get(row.user_id), row.user_id);

    let messageEntry = reactionMap.get(reactionMessageId);
    if (!messageEntry) {
      messageEntry = new Map();
      reactionMap.set(reactionMessageId, messageEntry);
    }

    let emojiEntry = messageEntry.get(emoji);
    if (!emojiEntry) {
      emojiEntry = new Map();
      messageEntry.set(emoji, emojiEntry);
    }

    emojiEntry.set(participantSummary.id, participantSummary);
  });

  const summaries = new Map<string, ChatMessageReactionRecord[]>();
  reactionMap.forEach((emojiMap, messageId) => {
    const reactionSummaries: ChatMessageReactionRecord[] = [];
    emojiMap.forEach((participantEntries, emoji) => {
      const users = Array.from(participantEntries.values());
      users.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
      reactionSummaries.push({
        emoji,
        count: users.length,
        users,
      });
    });
    reactionSummaries.sort((a, b) => {
      if (b.count !== a.count) {
        return b.count - a.count;
      }
      return a.emoji.localeCompare(b.emoji);
    });
    summaries.set(messageId, reactionSummaries);
  });

  return summaries;
}

export async function addMessageReaction(params: {
  conversationId: string;
  messageId: string;
  emoji: string;
  userId: string;
}): Promise<ChatReactionMutationResult> {
  const emoji = sanitizeReactionEmoji(params.emoji);
  if (!emoji) {
    throw new ChatServiceError("invalid_reaction", 400, "Choose a reaction to send.");
  }
  const context = await resolveDirectReactionContext({
    conversationId: params.conversationId,
    messageId: params.messageId,
    userId: params.userId,
  });
  await upsertChatMessageReaction({
    message_id: context.messageRow.id,
    user_id: context.actorId,
    emoji,
  });
  const result = await finalizeReactionMutation(context, emoji, "added");
  await publishReactionEvent({
    conversationId: result.conversationId,
    messageId: result.messageId,
    emoji: result.emoji,
    action: result.action,
    reactions: result.reactions.map((reaction) => ({
      emoji: reaction.emoji,
      users: reaction.users,
    })),
    participants: result.participants,
    actor: result.actor,
  });
  return result;
}

export async function removeMessageReaction(params: {
  conversationId: string;
  messageId: string;
  emoji: string;
  userId: string;
}): Promise<ChatReactionMutationResult> {
  const emoji = sanitizeReactionEmoji(params.emoji);
  if (!emoji) {
    throw new ChatServiceError("invalid_reaction", 400, "Choose a reaction to remove.");
  }
  const context = await resolveDirectReactionContext({
    conversationId: params.conversationId,
    messageId: params.messageId,
    userId: params.userId,
  });
  await deleteChatMessageReaction({
    message_id: context.messageRow.id,
    user_id: context.actorId,
    emoji,
  });
  const result = await finalizeReactionMutation(context, emoji, "removed");
  await publishReactionEvent({
    conversationId: result.conversationId,
    messageId: result.messageId,
    emoji: result.emoji,
    action: result.action,
    reactions: result.reactions.map((reaction) => ({
      emoji: reaction.emoji,
      users: reaction.users,
    })),
    participants: result.participants,
    actor: result.actor,
  });
  return result;
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

type ReactionContext = {
  messageRow: ChatMessageRow;
  participantMap: Map<string, ChatParticipantRow>;
  participantSummaries: ChatParticipantSummary[];
  actorSummary: ChatParticipantSummary;
  actorId: string;
};

async function resolveDirectReactionContext(params: {
  conversationId: string;
  messageId: string;
  userId: string;
}): Promise<ReactionContext> {
  const trimmedConversationId = typeof params.conversationId === "string" ? params.conversationId.trim() : "";
  if (!trimmedConversationId) {
    throw new ChatServiceError("invalid_conversation", 400, "A conversation id is required.");
  }

  let parsedConversation: { left: string; right: string };
  try {
    parsedConversation = parseConversationId(trimmedConversationId);
  } catch {
    throw new ChatServiceError("invalid_conversation", 400, "That message thread cannot be found.");
  }

  const canonicalLeft = normalizeId(parsedConversation.left);
  const canonicalRight = normalizeId(parsedConversation.right);
  if (!canonicalLeft || !canonicalRight) {
    throw new ChatServiceError("invalid_conversation", 400, "That message thread cannot be found.");
  }

  const identityCache = new Map<string, ResolvedIdentity | null>();
  const actorResolved = await resolveIdentity(identityCache, params.userId, params.userId);
  if (!actorResolved) {
    throw new ChatServiceError("auth_required", 401, "Sign in to react to this message.");
  }
  const actorId = actorResolved.canonicalId;

  if (actorId !== canonicalLeft && actorId !== canonicalRight) {
    throw new ChatServiceError("forbidden", 403, "You do not have access to this conversation.");
  }

  const canonicalConversationId = getChatConversationId(canonicalLeft, canonicalRight);
  const canonicalMessageId = canonicalizeMessageId(params.messageId, canonicalConversationId);

  const messageRow = await findChatMessageById(canonicalMessageId);
  if (!messageRow) {
    throw new ChatServiceError("message_not_found", 404, "That message no longer exists.");
  }

  let messageParticipants: { left: string; right: string };
  try {
    messageParticipants = parseConversationId(messageRow.conversation_id);
  } catch {
    throw new ChatServiceError("message_not_found", 404, "That message no longer exists.");
  }

  if (actorId !== messageParticipants.left && actorId !== messageParticipants.right) {
    throw new ChatServiceError("forbidden", 403, "You do not have access to this message.");
  }

  const otherParticipantId =
    actorId === messageParticipants.left ? messageParticipants.right : messageParticipants.left;

  const otherResolved =
    otherParticipantId && otherParticipantId !== actorId
      ? await resolveIdentity(identityCache, otherParticipantId, otherParticipantId)
      : null;

  const participantIds = Array.from(
    new Set([messageParticipants.left, messageParticipants.right].filter(Boolean)),
  );
  const participantRows = await fetchUsersByIds(participantIds);
  const participantMap = new Map(participantRows.map((row) => [row.id, row]));
  const fallbackProfiles: ResolvedIdentity[] = [actorResolved];
  if (otherResolved) fallbackProfiles.push(otherResolved);
  mergeParticipantMaps(participantMap, fallbackProfiles);

  const participantSummaries = participantIds
    .map((id) => toParticipantSummary(participantMap.get(id), id))
    .filter(
      (participant, index, list) =>
        list.findIndex((item) => item.id === participant.id) === index,
    );

  const actorSummary = toParticipantSummary(participantMap.get(actorId), actorId);

  return {
    messageRow,
    participantMap,
    participantSummaries,
    actorSummary,
    actorId,
  };
}

async function finalizeReactionMutation(
  context: ReactionContext,
  emoji: string,
  action: "added" | "removed",
): Promise<ChatReactionMutationResult> {
  const reactionRows = await listChatMessageReactions([context.messageRow.id]);
  if (reactionRows.length > 0) {
    const missingParticipantIds = Array.from(
      new Set(
        reactionRows
          .map((row) => row.user_id)
          .filter((userId) => !context.participantMap.has(userId)),
      ),
    );
    if (missingParticipantIds.length > 0) {
      const additionalParticipants = await fetchUsersByIds(missingParticipantIds);
      additionalParticipants.forEach((row) => context.participantMap.set(row.id, row));
    }
  }
  const reactionMap = buildReactionSummaries(reactionRows, context.participantMap);
  const reactions = reactionMap.get(context.messageRow.id) ?? [];

  return {
    conversationId: context.messageRow.conversation_id,
    messageId: context.messageRow.id,
    reactions,
    participants: context.participantSummaries,
    actor: context.actorSummary,
    emoji,
    action,
  };
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
    reactions: messageRecord.reactions.map((reaction) => ({
      emoji: reaction.emoji,
      users: reaction.users,
    })),
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

  let messageReactionMap = new Map<string, ChatMessageReactionRecord[]>();
  if (messages.length > 0) {
    const reactionRows = await listChatMessageReactions(messages.map((message) => message.id));
    if (reactionRows.length > 0) {
      const missingParticipantIds = Array.from(
        new Set(
          reactionRows
            .map((row) => row.user_id)
            .filter((userId) => !participantMap.has(userId)),
        ),
      );
      if (missingParticipantIds.length > 0) {
        const additionalParticipants = await fetchUsersByIds(missingParticipantIds);
        additionalParticipants.forEach((row) => participantMap.set(row.id, row));
      }
      messageReactionMap = buildReactionSummaries(reactionRows, participantMap);
    }
  }

  return {
    conversationId: messages.length ? canonicalConversationId : params.conversationId,
    participants: participantSummaries,
    messages: messages.map((message) =>
      toMessageRecord(message, messageReactionMap.get(message.id) ?? []),
    ),
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

  const lastMessageRows = conversationEntries.map(({ row }) => row);
  let lastMessageReactionMap = new Map<string, ChatMessageReactionRecord[]>();
  if (lastMessageRows.length > 0) {
    const reactionRows = await listChatMessageReactions(lastMessageRows.map((row) => row.id));
    if (reactionRows.length > 0) {
      const missingIds = Array.from(
        new Set(
          reactionRows
            .map((row) => row.user_id)
            .filter((userId) => !participantMap.has(userId)),
        ),
      );
      if (missingIds.length > 0) {
        const additional = await fetchUsersByIds(missingIds);
        additional.forEach((row) => participantMap.set(row.id, row));
      }
      lastMessageReactionMap = buildReactionSummaries(reactionRows, participantMap);
    }
  }

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

    const messageRecord = toMessageRecord(row, lastMessageReactionMap.get(row.id) ?? []);
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
