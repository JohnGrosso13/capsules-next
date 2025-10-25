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
  createGroupConversation,
  updateGroupConversation,
  deleteGroupConversation,
  listGroupConversationsByIds,
  listGroupMembershipsForUser,
  addGroupParticipants,
  removeGroupParticipant,
  listGroupParticipants,
  upsertGroupMessage,
  listGroupMessages,
  findGroupMessageById,
  listRecentGroupMessagesForUser,
  upsertGroupMessageReaction,
  deleteGroupMessageReaction,
  listGroupMessageReactions,
  type ChatMessageRow,
  type ChatParticipantRow,
  type ChatMessageReactionRow,
  type ChatGroupMessageRow,
  type ChatGroupMessageReactionRow,
} from "./repository";
import {
  publishDirectMessageEvent,
  publishReactionEvent,
  publishSessionEvent,
  publishSessionDeletedEvent,
} from "@/services/realtime/chat";

export type ChatMessageAttachmentRecord = {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  url: string;
  thumbnailUrl: string | null;
  storageKey: string | null;
  sessionId: string | null;
};

export type ChatMessageRecord = {
  id: string;
  conversationId: string;
  senderId: string;
  body: string;
  sentAt: string;
  reactions: ChatMessageReactionRecord[];
  attachments: ChatMessageAttachmentRecord[];
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
    type: "direct" | "group";
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
const DEFAULT_MAX_GROUP_PARTICIPANTS = 50;
const MAX_GROUP_PARTICIPANTS = (() => {
  const raw = process.env.CHAT_GROUP_MAX_PARTICIPANTS;
  if (!raw) return DEFAULT_MAX_GROUP_PARTICIPANTS;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 2) return DEFAULT_MAX_GROUP_PARTICIPANTS;
  return Math.floor(parsed);
})();

function sanitizeBody(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

type RawChatMessagePayload = {
  text?: string;
  attachments?: unknown;
};

type RawChatMessageAttachment = {
  id?: unknown;
  name?: unknown;
  mimeType?: unknown;
  size?: unknown;
  url?: unknown;
  thumbnailUrl?: unknown;
  storageKey?: unknown;
  sessionId?: unknown;
};

function sanitizeAttachment(value: unknown): ChatMessageAttachmentRecord | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as RawChatMessageAttachment;
  const id = typeof raw.id === "string" && raw.id.trim().length ? raw.id.trim() : null;
  const name = typeof raw.name === "string" && raw.name.trim().length ? raw.name.trim() : null;
  const mimeType =
    typeof raw.mimeType === "string" && raw.mimeType.trim().length ? raw.mimeType.trim() : null;
  const url = typeof raw.url === "string" && raw.url.trim().length ? raw.url.trim() : null;
  if (!id || !name || !mimeType || !url) return null;
  const size =
    typeof raw.size === "number" && Number.isFinite(raw.size) && raw.size >= 0
      ? Math.floor(raw.size)
      : 0;
  const thumbnailUrl =
    typeof raw.thumbnailUrl === "string" && raw.thumbnailUrl.trim().length
      ? raw.thumbnailUrl.trim()
      : null;
  const storageKey =
    typeof raw.storageKey === "string" && raw.storageKey.trim().length
      ? raw.storageKey.trim()
      : null;
  const sessionId =
    typeof raw.sessionId === "string" && raw.sessionId.trim().length
      ? raw.sessionId.trim()
      : null;
  return {
    id,
    name,
    mimeType,
    size,
    url,
    thumbnailUrl,
    storageKey,
    sessionId,
  };
}

function sanitizeAttachments(value: unknown): ChatMessageAttachmentRecord[] {
  if (!Array.isArray(value)) return [];
  const sanitized = value
    .map((entry) => sanitizeAttachment(entry))
    .filter((entry): entry is ChatMessageAttachmentRecord => Boolean(entry));
  if (!sanitized.length) return [];
  const unique = new Map<string, ChatMessageAttachmentRecord>();
  sanitized.forEach((attachment) => {
    if (!unique.has(attachment.id)) {
      unique.set(attachment.id, attachment);
    }
  });
  return Array.from(unique.values());
}

function encodeMessagePayload(body: string, attachments: ChatMessageAttachmentRecord[]): string {
  const text = sanitizeBody(body ?? "");
  if (!attachments.length) return text;
  try {
    return JSON.stringify({
      text,
      attachments,
    });
  } catch {
    return text;
  }
}

function decodeMessagePayload(raw: string): {
  text: string;
  attachments: ChatMessageAttachmentRecord[];
} {
  if (!raw || typeof raw !== "string") {
    return { text: "", attachments: [] };
  }
  const trimmed = raw.trim();
  if (!trimmed.startsWith("{")) {
    return { text: sanitizeBody(raw), attachments: [] };
  }
  try {
    const parsed = JSON.parse(trimmed) as RawChatMessagePayload;
    const text =
      typeof parsed?.text === "string" && parsed.text.trim().length
        ? sanitizeBody(parsed.text)
        : "";
    const attachments = sanitizeAttachments(parsed?.attachments);
    if (!attachments.length && !text) {
      return { text: sanitizeBody(raw), attachments: [] };
    }
    return { text, attachments };
  } catch {
    return { text: sanitizeBody(raw), attachments: [] };
  }
}

function sanitizeReactionEmoji(value: string): string {
  if (typeof value !== "string") return "";
  const trimmed = value.trim();
  if (!trimmed) return "";
  const limited =
    trimmed.length > MAX_REACTION_EMOJI_LENGTH ? trimmed.slice(0, MAX_REACTION_EMOJI_LENGTH) : trimmed;
  // Require at least one emoji-like codepoint. This prevents corrupt placeholders like "??" from being stored.
  // Extended_Pictographic covers most emoji; include VS16 (FE0F) and ZWJ sequences implicitly.
  const hasEmoji = /\p{Extended_Pictographic}/u.test(limited);
  if (!hasEmoji) return "";
  return limited;
}

function normalizeId(value: string | null | undefined): string {
  if (typeof value !== "string") return "";
  return value.trim().toLowerCase();
}

function resolveSentAt(row: ChatMessageRow | ChatGroupMessageRow): string {
  return row.client_sent_at ?? row.created_at;
}

function toMessageRecord(
  row: ChatMessageRow | ChatGroupMessageRow,
  reactions: ChatMessageReactionRecord[] = [],
): ChatMessageRecord {
  const payload = decodeMessagePayload(row.body ?? "");
  return {
    id: row.id,
    conversationId: row.conversation_id,
    senderId: row.sender_id,
    body: payload.text,
    sentAt: resolveSentAt(row),
    reactions,
    attachments: payload.attachments,
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
  rows: Array<ChatMessageReactionRow | ChatGroupMessageReactionRow>,
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
  const context = isGroupConversationId(params.conversationId)
    ? await resolveGroupReactionContext({
        conversationId: params.conversationId,
        messageId: params.messageId,
        userId: params.userId,
      })
    : await resolveDirectReactionContext({
        conversationId: params.conversationId,
        messageId: params.messageId,
        userId: params.userId,
      });

  if (context.conversationType === "group") {
    await upsertGroupMessageReaction({
      message_id: context.messageRow.id,
      user_id: context.actorId,
      emoji,
    });
  } else {
    await upsertChatMessageReaction({
      message_id: context.messageRow.id,
      user_id: context.actorId,
      emoji,
    });
  }

  const result = await finalizeReactionMutation(
    context,
    emoji,
    "added",
    context.conversationType === "group" ? listGroupMessageReactions : listChatMessageReactions,
  );
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
  const context = isGroupConversationId(params.conversationId)
    ? await resolveGroupReactionContext({
        conversationId: params.conversationId,
        messageId: params.messageId,
        userId: params.userId,
      })
    : await resolveDirectReactionContext({
        conversationId: params.conversationId,
        messageId: params.messageId,
        userId: params.userId,
      });

  if (context.conversationType === "group") {
    await deleteGroupMessageReaction(context.messageRow.id, context.actorId, emoji);
  } else {
    await deleteChatMessageReaction({
      message_id: context.messageRow.id,
      user_id: context.actorId,
      emoji,
    });
  }

  const result = await finalizeReactionMutation(
    context,
    emoji,
    "removed",
    context.conversationType === "group" ? listGroupMessageReactions : listChatMessageReactions,
  );
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

function buildGroupConversationTitle(
  participants: ChatParticipantSummary[],
  explicitTitle?: string | null,
): string {
  const trimmed = typeof explicitTitle === "string" ? explicitTitle.trim() : "";
  if (trimmed) return trimmed;
  if (!participants.length) return "Group chat";
  if (participants.length === 1) {
    return `${participants[0]?.name ?? "Member"} & others`;
  }
  if (participants.length === 2) {
    return `${participants[0]?.name ?? "Member"} & ${participants[1]?.name ?? "Member"}`;
  }
  return `${participants[0]?.name ?? "Member"}, ${participants[1]?.name ?? "Member"} +${
    participants.length - 2
  }`;
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
  messageRow: ChatMessageRow | ChatGroupMessageRow;
  participantMap: Map<string, ChatParticipantRow>;
  participantSummaries: ChatParticipantSummary[];
  actorSummary: ChatParticipantSummary;
  actorId: string;
  conversationType: "direct" | "group";
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
    conversationType: "direct",
  };
}

async function resolveGroupReactionContext(params: {
  conversationId: string;
  messageId: string;
  userId: string;
}): Promise<ReactionContext> {
  const trimmedConversationId =
    typeof params.conversationId === "string" ? params.conversationId.trim() : "";
  if (!trimmedConversationId) {
    throw new ChatServiceError("invalid_conversation", 400, "A conversation id is required.");
  }
  if (!isGroupConversationId(trimmedConversationId)) {
    throw new ChatServiceError("invalid_conversation", 400, "That group cannot be found.");
  }

  const [conversationRow] = await listGroupConversationsByIds([trimmedConversationId]);
  if (!conversationRow) {
    throw new ChatServiceError("invalid_conversation", 404, "That group cannot be found.");
  }

  const membershipRows = await listGroupParticipants(trimmedConversationId);
  if (!membershipRows.length) {
    throw new ChatServiceError("invalid_conversation", 404, "That group has no participants.");
  }

  const identityCache = new Map<string, ResolvedIdentity | null>();
  const actorResolved = await resolveIdentity(identityCache, params.userId, params.userId);
  if (!actorResolved) {
    throw new ChatServiceError("auth_required", 401, "Sign in to react to this message.");
  }
  const actorId = normalizeId(actorResolved.canonicalId);
  if (!actorId) {
    throw new ChatServiceError("auth_required", 401, "Sign in to react to this message.");
  }

  const membershipSet = new Set(
    membershipRows.map((row) => normalizeId(row.user_id)).filter((value): value is string => Boolean(value)),
  );
  if (!membershipSet.has(actorId)) {
    throw new ChatServiceError("forbidden", 403, "You do not have access to this conversation.");
  }

  const participantIds = Array.from(membershipSet);
  const participantProfiles = await fetchUsersByIds(participantIds);
  const participantMap = new Map(participantProfiles.map((row) => [normalizeId(row.id), row]));
  mergeParticipantMaps(participantMap, [actorResolved]);

  const canonicalMessageId = canonicalizeMessageId(params.messageId, trimmedConversationId);
  let messageRow = await findGroupMessageById(canonicalMessageId);
  if (!messageRow && canonicalMessageId !== params.messageId.trim()) {
    messageRow = await findGroupMessageById(params.messageId.trim());
  }
  if (!messageRow || normalizeId(messageRow.conversation_id) !== trimmedConversationId) {
    throw new ChatServiceError("message_not_found", 404, "That message no longer exists.");
  }

  const participantSummaries = participantIds
    .map((id) => toParticipantSummary(participantMap.get(id) ?? undefined, id))
    .filter(
      (participant, index, list) =>
        list.findIndex((item) => item.id === participant.id) === index,
    );

  const actorSummary = toParticipantSummary(participantMap.get(actorId) ?? undefined, actorId);

  return {
    messageRow,
    participantMap,
    participantSummaries,
    actorSummary,
    actorId,
    conversationType: "group",
  };
}

async function finalizeReactionMutation(
  context: ReactionContext,
  emoji: string,
  action: "added" | "removed",
  fetchReactions: (
    messageIds: string[],
  ) => Promise<Array<ChatMessageReactionRow | ChatGroupMessageReactionRow>>,
): Promise<ChatReactionMutationResult> {
  const reactionRows = await fetchReactions([context.messageRow.id]);
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
  attachments?: ChatMessageAttachmentRecord[];
  clientSentAt?: string | null;
}): Promise<{
  message: ChatMessageRecord;
  participants: ChatParticipantSummary[];
}> {
  if (!params.conversationId.trim()) {
    throw new ChatServiceError("invalid_conversation", 400, "A conversation id is required.");
  }
  if (isGroupConversationId(params.conversationId)) {
    return sendGroupMessage(params);
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
  const attachments = Array.isArray(params.attachments)
    ? sanitizeAttachments(params.attachments)
    : [];
  if (!bodySanitized && attachments.length === 0) {
    throw new ChatServiceError(
      "invalid_body",
      400,
      "A message must include text or at least one attachment.",
    );
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

  const serializedBody = encodeMessagePayload(bodySanitized, attachments);

  const messageRow = await upsertChatMessage({
    id: canonicalMessageId,
    conversation_id: canonicalConversationId,
    sender_id: canonicalSenderId,
    body: serializedBody,
    client_sent_at: clientSentAt,
  });

  const messageRecord = toMessageRecord(messageRow);

  await publishDirectMessageEvent({
    conversationId: messageRecord.conversationId,
    messageId: messageRecord.id,
    senderId: messageRecord.senderId,
    body: messageRecord.body,
    attachments: messageRecord.attachments,
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

export async function sendGroupMessage(params: {
  conversationId: string;
  senderId: string;
  messageId: string;
  body: string;
  attachments?: ChatMessageAttachmentRecord[];
  clientSentAt?: string | null;
}): Promise<{
  message: ChatMessageRecord;
  participants: ChatParticipantSummary[];
}> {
  const trimmedConversationId = params.conversationId?.trim();
  if (!trimmedConversationId) {
    throw new ChatServiceError("invalid_conversation", 400, "A conversation id is required.");
  }
  if (!isGroupConversationId(trimmedConversationId)) {
    throw new ChatServiceError("invalid_conversation", 400, "That group cannot be found.");
  }

  const senderTrimmed = params.senderId?.trim();
  if (!senderTrimmed) {
    throw new ChatServiceError("auth_required", 401, "Sign in to send a message.");
  }
  const identityCache = new Map<string, ResolvedIdentity | null>();
  const senderResolved = await resolveIdentity(identityCache, senderTrimmed, senderTrimmed);
  if (!senderResolved) {
    throw new ChatServiceError("auth_required", 401, "Sign in to send a message.");
  }
  const senderId = normalizeId(senderResolved.canonicalId);
  if (!senderId) {
    throw new ChatServiceError("auth_required", 401, "Sign in to send a message.");
  }

  const [conversationRow] = await listGroupConversationsByIds([trimmedConversationId]);
  if (!conversationRow) {
    throw new ChatServiceError("invalid_conversation", 404, "That group could not be found.");
  }

  const membershipRows = await listGroupParticipants(trimmedConversationId);
  if (!membershipRows.length) {
    throw new ChatServiceError("invalid_conversation", 404, "That group has no participants.");
  }

  const participantIds = Array.from(
    new Set(
      membershipRows
        .map((row) => normalizeId(row.user_id))
        .filter((value): value is string => Boolean(value)),
    ),
  );

  if (!participantIds.includes(senderId)) {
    throw new ChatServiceError("forbidden", 403, "You do not have access to this conversation.");
  }

  const bodySanitized = sanitizeBody(params.body ?? "");
  const attachments = Array.isArray(params.attachments)
    ? sanitizeAttachments(params.attachments)
    : [];
  if (!bodySanitized && attachments.length === 0) {
    throw new ChatServiceError(
      "invalid_body",
      400,
      "A message must include text or at least one attachment.",
    );
  }
  if (bodySanitized.length > MAX_BODY_LENGTH) {
    throw new ChatServiceError(
      "message_too_long",
      400,
      `Message text must be ${MAX_BODY_LENGTH} characters or fewer.`,
    );
  }

  let clientSentAt: string | null = null;
  if (typeof params.clientSentAt === "string" && params.clientSentAt.trim().length) {
    const parsedTimestamp = Date.parse(params.clientSentAt);
    if (!Number.isNaN(parsedTimestamp)) {
      clientSentAt = new Date(parsedTimestamp).toISOString();
    }
  }

  const canonicalMessageId = canonicalizeMessageId(params.messageId, trimmedConversationId);
  const serializedBody = encodeMessagePayload(bodySanitized, attachments);
  const messageRow = await upsertGroupMessage({
    id: canonicalMessageId,
    conversation_id: trimmedConversationId,
    sender_id: senderId,
    body: serializedBody,
    client_sent_at: clientSentAt,
  });

  const participantProfiles = await fetchUsersByIds(participantIds);
  const participantMap = new Map(participantProfiles.map((row) => [normalizeId(row.id), row]));
  mergeParticipantMaps(participantMap, [senderResolved]);

  const participantSummaries = participantIds
    .map((id) => toParticipantSummary(participantMap.get(id) ?? undefined, id))
    .filter(
      (participant, index, list) =>
        list.findIndex((item) => item.id === participant.id) === index,
    );

  const messageRecord = toMessageRecord(messageRow);

  const sessionTitle = buildGroupConversationTitle(participantSummaries, conversationRow.title);
  const sessionAvatar = conversationRow.avatar_url ?? null;

  await publishDirectMessageEvent({
    conversationId: trimmedConversationId,
    messageId: messageRecord.id,
    senderId: messageRecord.senderId,
    body: messageRecord.body,
    attachments: messageRecord.attachments,
    sentAt: messageRecord.sentAt,
    participants: participantSummaries,
    reactions: [],
    session: {
      type: "group",
      title: sessionTitle,
      avatar: sessionAvatar,
      createdBy: conversationRow.created_by ?? null,
    },
  });

  return {
    message: messageRecord,
    participants: participantSummaries,
  };
}

export async function createGroupConversationSession(params: {
  conversationId: string;
  creatorId: string;
  participantIds: string[];
  title?: string | null;
  avatarUrl?: string | null;
}): Promise<{
  conversationId: string;
  participants: ChatParticipantSummary[];
  session: { type: "group"; title: string; avatar: string | null; createdBy: string | null };
}> {
  const trimmedConversationId = params.conversationId?.trim();
  if (!trimmedConversationId) {
    throw new ChatServiceError("invalid_conversation", 400, "A conversation id is required.");
  }
  if (!isGroupConversationId(trimmedConversationId)) {
    throw new ChatServiceError("invalid_conversation", 400, "That group id is invalid.");
  }

  const identityCache = new Map<string, ResolvedIdentity | null>();
  const creatorResolved = await resolveIdentity(identityCache, params.creatorId, params.creatorId);
  if (!creatorResolved) {
    throw new ChatServiceError("auth_required", 401, "Sign in to create a group.");
  }
  const creatorId = normalizeId(creatorResolved.canonicalId);
  if (!creatorId) {
    throw new ChatServiceError("auth_required", 401, "Sign in to create a group.");
  }

  const participantSet = new Map<string, ResolvedIdentity>();
  participantSet.set(creatorId, creatorResolved);

  for (const rawId of params.participantIds ?? []) {
    if (typeof rawId !== "string" || !rawId.trim()) continue;
    const resolved = await resolveIdentity(identityCache, rawId, rawId);
    if (!resolved) continue;
    const normalized = normalizeId(resolved.canonicalId);
    if (!normalized || participantSet.has(normalized)) continue;
    participantSet.set(normalized, resolved);
  }

  if (participantSet.size < 2) {
    throw new ChatServiceError(
      "invalid_participants",
      400,
      "Add at least one other participant to create a group chat.",
    );
  }
  assertGroupParticipantLimit(participantSet.size);

  const explicitTitle =
    typeof params.title === "string" && params.title.trim().length ? params.title.trim() : null;
  const avatarUrl =
    typeof params.avatarUrl === "string" && params.avatarUrl.trim().length
      ? params.avatarUrl.trim()
      : null;

  await createGroupConversation({
    id: trimmedConversationId,
    created_by: creatorResolved.canonicalId,
    title: explicitTitle,
    avatar_url: avatarUrl,
  });

  await addGroupParticipants(
    Array.from(participantSet.values()).map((resolved) => ({
      conversation_id: trimmedConversationId,
      user_id: resolved.canonicalId,
      joined_at: new Date().toISOString(),
    })),
  );

  const participantIds = Array.from(participantSet.keys());
  const participantProfiles = await fetchUsersByIds(participantIds);
  const participantMap = new Map(participantProfiles.map((row) => [normalizeId(row.id), row]));
  mergeParticipantMaps(participantMap, participantSet.values());

  const participantSummaries = participantIds
    .map((id) => toParticipantSummary(participantMap.get(id) ?? undefined, id))
    .filter(
      (participant, index, list) =>
        list.findIndex((item) => item.id === participant.id) === index,
    );

  const sessionTitle = buildGroupConversationTitle(participantSummaries, explicitTitle);
  await publishSessionEvent({
    conversationId: trimmedConversationId,
    participants: participantSummaries,
    session: { type: "group", title: sessionTitle, avatar: avatarUrl, createdBy: creatorResolved.canonicalId },
  });
  return {
    conversationId: trimmedConversationId,
    participants: participantSummaries,
    session: {
      type: "group",
      title: sessionTitle,
      avatar: avatarUrl,
      createdBy: creatorResolved.canonicalId ?? null,
    },
  };
}

export async function addParticipantsToGroupConversation(params: {
  conversationId: string;
  requesterId: string;
  participantIds: string[];
}): Promise<ChatParticipantSummary[]> {
  const trimmedConversationId = params.conversationId?.trim();
  if (!trimmedConversationId) {
    throw new ChatServiceError("invalid_conversation", 400, "A conversation id is required.");
  }
  if (!isGroupConversationId(trimmedConversationId)) {
    throw new ChatServiceError("invalid_conversation", 400, "That group cannot be found.");
  }
  if (!Array.isArray(params.participantIds) || params.participantIds.length === 0) {
    throw new ChatServiceError("invalid_participants", 400, "Select members to invite.");
  }

  const identityCache = new Map<string, ResolvedIdentity | null>();
  const requesterResolved = await resolveIdentity(
    identityCache,
    params.requesterId,
    params.requesterId,
  );
  if (!requesterResolved) {
    throw new ChatServiceError("auth_required", 401, "Sign in to invite participants.");
  }
  const requesterId = normalizeId(requesterResolved.canonicalId);
  if (!requesterId) {
    throw new ChatServiceError("auth_required", 401, "Sign in to invite participants.");
  }

  const membershipRows = await listGroupParticipants(trimmedConversationId);
  const memberSet = new Set(
    membershipRows.map((row) => normalizeId(row.user_id)).filter((value): value is string => Boolean(value)),
  );
  if (!memberSet.has(requesterId)) {
    throw new ChatServiceError("forbidden", 403, "You do not have access to this conversation.");
  }

  const [conversationRow] = await listGroupConversationsByIds([trimmedConversationId]);
  if (!conversationRow) {
    throw new ChatServiceError("invalid_conversation", 404, "That group could not be found.");
  }

  const newParticipants: ResolvedIdentity[] = [];
  for (const rawId of params.participantIds) {
    if (typeof rawId !== "string" || !rawId.trim()) continue;
    const resolved = await resolveIdentity(identityCache, rawId, rawId);
    if (!resolved) continue;
    const normalized = normalizeId(resolved.canonicalId);
    if (!normalized || memberSet.has(normalized)) continue;
    memberSet.add(normalized);
    newParticipants.push(resolved);
  }

  assertGroupParticipantLimit(memberSet.size);

  if (!newParticipants.length) {
    return membershipRows.length
      ? await buildGroupParticipantSummaries(memberSet, [requesterResolved])
      : [];
  }

  await addGroupParticipants(
    newParticipants.map((resolved) => ({
      conversation_id: trimmedConversationId,
      user_id: resolved.canonicalId,
      joined_at: new Date().toISOString(),
    })),
  );
  const updatedParticipants = await buildGroupParticipantSummaries(memberSet, [
    requesterResolved,
    ...newParticipants,
  ]);
  await publishSessionEvent({
    conversationId: trimmedConversationId,
    participants: updatedParticipants,
    session: {
      type: "group",
      title: conversationRow.title ?? "",
      avatar: conversationRow.avatar_url ?? null,
      createdBy: conversationRow.created_by ?? null,
    },
  });
  return updatedParticipants;
}

export async function removeParticipantFromGroupConversation(params: {
  conversationId: string;
  requesterId: string;
  targetUserId: string;
  allowSelf?: boolean;
}): Promise<ChatParticipantSummary[]> {
  const trimmedConversationId = params.conversationId?.trim();
  if (!trimmedConversationId) {
    throw new ChatServiceError("invalid_conversation", 400, "A conversation id is required.");
  }
  if (!isGroupConversationId(trimmedConversationId)) {
    throw new ChatServiceError("invalid_conversation", 400, "That group cannot be found.");
  }

  const identityCache = new Map<string, ResolvedIdentity | null>();
  const requesterResolved = await resolveIdentity(
    identityCache,
    params.requesterId,
    params.requesterId,
  );
  const targetResolved = await resolveIdentity(identityCache, params.targetUserId, params.targetUserId);
  if (!requesterResolved || !targetResolved) {
    throw new ChatServiceError("auth_required", 401, "Sign in to manage participants.");
  }
  const requesterId = normalizeId(requesterResolved.canonicalId);
  const targetId = normalizeId(targetResolved.canonicalId);
  if (!requesterId || !targetId) {
    throw new ChatServiceError("auth_required", 401, "Sign in to manage participants.");
  }

  const [conversationRow] = await listGroupConversationsByIds([trimmedConversationId]);
  if (!conversationRow) {
    throw new ChatServiceError("invalid_conversation", 404, "That group could not be found.");
  }

  const membershipRows = await listGroupParticipants(trimmedConversationId);
  const memberSet = new Set(
    membershipRows.map((row) => normalizeId(row.user_id)).filter((value): value is string => Boolean(value)),
  );

  if (!memberSet.has(requesterId)) {
    throw new ChatServiceError("forbidden", 403, "You do not have access to this conversation.");
  }
  if (!memberSet.has(targetId)) {
    return buildGroupParticipantSummaries(memberSet, [requesterResolved]);
  }
  const isCreator = conversationRow.created_by
    ? normalizeId(conversationRow.created_by) === requesterId
    : false;
  const removingSelf = requesterId === targetId;
  if (!isCreator && !removingSelf && !params.allowSelf) {
    throw new ChatServiceError(
      "forbidden",
      403,
      "Only the conversation owner can remove other participants.",
    );
  }

  await removeGroupParticipant(trimmedConversationId, targetResolved.canonicalId);
  memberSet.delete(targetId);
  const updated = await buildGroupParticipantSummaries(memberSet, [requesterResolved]);
  await publishSessionEvent({
    conversationId: trimmedConversationId,
    participants: updated,
    session: {
      type: "group",
      title: conversationRow.title ?? "",
      avatar: conversationRow.avatar_url ?? null,
      createdBy: conversationRow.created_by ?? null,
    },
  });
  return updated;
}

export async function renameGroupConversation(params: {
  conversationId: string;
  requesterId: string;
  title: string;
}): Promise<{ conversationId: string; title: string }> {
  const trimmedConversationId = params.conversationId?.trim();
  if (!trimmedConversationId) {
    throw new ChatServiceError("invalid_conversation", 400, "A conversation id is required.");
  }
  if (!isGroupConversationId(trimmedConversationId)) {
    throw new ChatServiceError("invalid_conversation", 400, "That group cannot be found.");
  }
  const requesterTrimmed = params.requesterId?.trim();
  if (!requesterTrimmed) {
    throw new ChatServiceError("auth_required", 401, "Sign in to rename this conversation.");
  }
  const identityCache = new Map<string, ResolvedIdentity | null>();
  const requesterResolved = await resolveIdentity(identityCache, requesterTrimmed, requesterTrimmed);
  if (!requesterResolved) {
    throw new ChatServiceError("auth_required", 401, "Sign in to rename this conversation.");
  }
  const requesterId = normalizeId(requesterResolved.canonicalId);
  if (!requesterId) {
    throw new ChatServiceError("auth_required", 401, "Sign in to rename this conversation.");
  }

  const membershipRows = await listGroupParticipants(trimmedConversationId);
  const memberSet = new Set(
    membershipRows.map((row) => normalizeId(row.user_id)).filter((value): value is string => Boolean(value)),
  );
  if (!memberSet.has(requesterId)) {
    throw new ChatServiceError("forbidden", 403, "You do not have access to this conversation.");
  }

  const normalizedTitle =
    typeof params.title === "string" && params.title.trim().length ? params.title.trim() : "";

  const updated = await updateGroupConversation(trimmedConversationId, {
    title: normalizedTitle,
  });
  const participants = await buildGroupParticipantSummaries(memberSet, [requesterResolved]);
  await publishSessionEvent({
    conversationId: trimmedConversationId,
    participants,
    session: {
      type: "group",
      title: updated?.title ?? normalizedTitle ?? "",
      avatar: updated?.avatar_url ?? null,
      createdBy: updated?.created_by ?? null,
    },
  });
  return {
    conversationId: trimmedConversationId,
    title: updated?.title ?? normalizedTitle ?? "",
  };
}

export async function deleteGroupConversationSession(params: {
  conversationId: string;
  requesterId: string;
}): Promise<void> {
  const trimmedConversationId = params.conversationId?.trim();
  if (!trimmedConversationId) {
    throw new ChatServiceError("invalid_conversation", 400, "A conversation id is required.");
  }
  if (!isGroupConversationId(trimmedConversationId)) {
    throw new ChatServiceError("invalid_conversation", 400, "That group cannot be found.");
  }

  const identityCache = new Map<string, ResolvedIdentity | null>();
  const requesterResolved = await resolveIdentity(identityCache, params.requesterId, params.requesterId);
  if (!requesterResolved) {
    throw new ChatServiceError("auth_required", 401, "Sign in to manage this conversation.");
  }
  const requesterId = normalizeId(requesterResolved.canonicalId);
  if (!requesterId) {
    throw new ChatServiceError("auth_required", 401, "Sign in to manage this conversation.");
  }

  const [conversationRow] = await listGroupConversationsByIds([trimmedConversationId]);
  if (!conversationRow) {
    throw new ChatServiceError("invalid_conversation", 404, "That group could not be found.");
  }
  const membershipRows = await listGroupParticipants(trimmedConversationId);
  const memberSet = new Set(
    membershipRows.map((row) => normalizeId(row.user_id)).filter((value): value is string => Boolean(value)),
  );
  if (!memberSet.has(requesterId)) {
    throw new ChatServiceError("forbidden", 403, "You do not have access to this conversation.");
  }
  const isCreator = conversationRow.created_by
    ? normalizeId(conversationRow.created_by) === requesterId
    : false;
  if (!isCreator) {
    throw new ChatServiceError("forbidden", 403, "Only the group owner can delete this conversation.");
  }

  const participants = await buildGroupParticipantSummaries(memberSet, [requesterResolved]);
  await deleteGroupConversation(trimmedConversationId);
  await publishSessionDeletedEvent({
    conversationId: trimmedConversationId,
    participants,
  });
}

async function buildGroupParticipantSummaries(
  memberSet: Set<string>,
  fallbackIdentities: Iterable<ResolvedIdentity>,
): Promise<ChatParticipantSummary[]> {
  if (!memberSet.size) return [];
  const participantIds = Array.from(memberSet);
  const participantProfiles = await fetchUsersByIds(participantIds);
  const participantMap = new Map(participantProfiles.map((row) => [normalizeId(row.id), row]));
  const fallbackList = Array.from(fallbackIdentities).filter(
    (entry): entry is ResolvedIdentity => Boolean(entry),
  );
  mergeParticipantMaps(participantMap, fallbackList);
  return participantIds
    .map((id) => toParticipantSummary(participantMap.get(id) ?? undefined, id))
    .filter(
      (participant, index, list) =>
        list.findIndex((item) => item.id === participant.id) === index,
    );
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
    return getGroupConversationHistory(params);
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

export async function getGroupConversationHistory(params: {
  conversationId: string;
  requesterId: string;
  before?: string | null;
  limit?: number;
}): Promise<{
  conversationId: string;
  participants: ChatParticipantSummary[];
  messages: ChatMessageRecord[];
}> {
  const trimmedConversationId = params.conversationId?.trim();
  if (!trimmedConversationId) {
    throw new ChatServiceError("invalid_conversation", 400, "A conversation id is required.");
  }
  if (!isGroupConversationId(trimmedConversationId)) {
    throw new ChatServiceError("invalid_conversation", 400, "That group cannot be found.");
  }
  const requesterTrimmed = params.requesterId?.trim();
  if (!requesterTrimmed) {
    throw new ChatServiceError("auth_required", 401, "Sign in to view this conversation.");
  }

  const identityCache = new Map<string, ResolvedIdentity | null>();
  const requesterResolved = await resolveIdentity(identityCache, requesterTrimmed, requesterTrimmed);
  if (!requesterResolved) {
    throw new ChatServiceError("auth_required", 401, "Sign in to view this conversation.");
  }
  const requesterId = normalizeId(requesterResolved.canonicalId);
  if (!requesterId) {
    throw new ChatServiceError("auth_required", 401, "Sign in to view this conversation.");
  }

  const [conversationRow] = await listGroupConversationsByIds([trimmedConversationId]);
  if (!conversationRow) {
    throw new ChatServiceError("invalid_conversation", 404, "That group could not be found.");
  }

  const membershipRows = await listGroupParticipants(trimmedConversationId);
  if (!membershipRows.length) {
    throw new ChatServiceError("invalid_conversation", 404, "That group has no participants.");
  }

  const participantIds = Array.from(
    new Set(
      membershipRows
        .map((row) => normalizeId(row.user_id))
        .filter((value): value is string => Boolean(value)),
    ),
  );

  if (!participantIds.includes(requesterId)) {
    throw new ChatServiceError("forbidden", 403, "You do not have access to this conversation.");
  }

  const participantProfiles = await fetchUsersByIds(participantIds);
  const participantMap = new Map(participantProfiles.map((row) => [normalizeId(row.id), row]));
  mergeParticipantMaps(participantMap, [requesterResolved]);

  const participantSummaries = participantIds
    .map((id) => toParticipantSummary(participantMap.get(id) ?? undefined, id))
    .filter(
      (participant, index, list) =>
        list.findIndex((item) => item.id === participant.id) === index,
    );

  const messages = await listGroupMessages(trimmedConversationId, {
    limit: params.limit ?? 50,
    before: params.before ?? null,
  });

  let messageReactionMap = new Map<string, ChatMessageReactionRecord[]>();
  if (messages.length > 0) {
    const reactionRows = await listGroupMessageReactions(messages.map((message) => message.id));
    if (reactionRows.length > 0) {
      const missingParticipantIds = Array.from(
        new Set(
          reactionRows
            .map((row) => normalizeId(row.user_id))
            .filter((userId) => userId && !participantMap.has(userId)),
        ),
      );
      if (missingParticipantIds.length > 0) {
        const additionalProfiles = await fetchUsersByIds(missingParticipantIds);
        additionalProfiles.forEach((row) => participantMap.set(normalizeId(row.id), row));
      }
      messageReactionMap = buildReactionSummaries(reactionRows, participantMap);
    }
  }

  return {
    conversationId: trimmedConversationId,
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

export async function listRecentGroupConversations(params: {
  userId: string;
  limit?: number;
}): Promise<ChatConversationSummary[]> {
  const trimmedUser = params.userId?.trim();
  if (!trimmedUser) {
    throw new ChatServiceError("auth_required", 401, "Sign in to view messages.");
  }

  const identityCache = new Map<string, ResolvedIdentity | null>();
  const requesterResolved = await resolveIdentity(identityCache, trimmedUser, trimmedUser);
  if (!requesterResolved) {
    throw new ChatServiceError("auth_required", 401, "Sign in to view messages.");
  }
  const canonicalUserId = normalizeId(requesterResolved.canonicalId);
  if (!canonicalUserId) {
    throw new ChatServiceError("auth_required", 401, "Sign in to view messages.");
  }

  const membershipRows = await listGroupMembershipsForUser(canonicalUserId);
  if (!membershipRows.length) return [];

  const membershipMap = new Map(
    membershipRows.map((row) => [row.conversation_id, row] as const),
  );
  const conversationIds = Array.from(
    new Set(membershipRows.map((row) => row.conversation_id).filter(Boolean)),
  );
  if (!conversationIds.length) return [];

  const requestedLimit = Number.isFinite(params.limit) ? Number(params.limit) : 25;
  const conversationLimit = Math.max(1, Math.min(100, requestedLimit));
  const fetchLimit = Math.min(500, conversationLimit * 15);

  const recentMessages = await listRecentGroupMessagesForUser(canonicalUserId, {
    limit: fetchLimit,
  });

  const latestByConversation = new Map<string, ChatGroupMessageRow>();
  recentMessages.forEach((row) => {
    if (!row?.conversation_id) return;
    const existing = latestByConversation.get(row.conversation_id);
    if (!existing || Date.parse(resolveSentAt(row)) > Date.parse(resolveSentAt(existing))) {
      latestByConversation.set(row.conversation_id, row);
    }
  });

  const activityEntries = conversationIds.map((id) => {
    const latest = latestByConversation.get(id) ?? null;
    const membership = membershipMap.get(id) ?? null;
    const activityTimestamp = latest
      ? Date.parse(resolveSentAt(latest))
      : membership?.joined_at
        ? Date.parse(membership.joined_at)
        : 0;
    return { id, latest, activityTimestamp };
  });

  activityEntries.sort((a, b) => b.activityTimestamp - a.activityTimestamp);

  const selectedEntries = activityEntries.slice(0, conversationLimit);
  if (!selectedEntries.length) return [];

  const conversationRows = await listGroupConversationsByIds(selectedEntries.map((entry) => entry.id));
  const conversationMap = new Map(conversationRows.map((row) => [row.id, row]));

  const summaries: ChatConversationSummary[] = [];

  for (const entry of selectedEntries) {
    const conversation = conversationMap.get(entry.id) ?? null;
    const participantRows = await listGroupParticipants(entry.id);
    const participantIds = Array.from(
      new Set(
        participantRows
          .map((row) => normalizeId(row.user_id))
          .concat([canonicalUserId])
          .filter((value): value is string => Boolean(value)),
      ),
    );
    const participantProfiles = await fetchUsersByIds(participantIds);
    const participantMap = new Map(participantProfiles.map((row) => [normalizeId(row.id), row]));
    mergeParticipantMaps(participantMap, [requesterResolved]);

    const participantSummaries = participantIds
      .map((id) => toParticipantSummary(participantMap.get(id) ?? undefined, id))
      .filter(
        (participant, index, list) =>
          list.findIndex((item) => item.id === participant.id) === index,
      );

    let messageRecord: ChatMessageRecord | null = null;
    if (entry.latest) {
      const reactionRows = await listGroupMessageReactions([entry.latest.id]);
      let reactionMap = new Map<string, ChatMessageReactionRecord[]>();
      if (reactionRows.length > 0) {
        const missingParticipantIds = Array.from(
          new Set(
            reactionRows
              .map((row) => normalizeId(row.user_id))
              .filter((userId) => userId && !participantMap.has(userId)),
          ),
        );
        if (missingParticipantIds.length > 0) {
          const additionalProfiles = await fetchUsersByIds(missingParticipantIds);
          additionalProfiles.forEach((row) => participantMap.set(normalizeId(row.id), row));
        }
        reactionMap = buildReactionSummaries(reactionRows, participantMap);
      }
      messageRecord = toMessageRecord(entry.latest, reactionMap.get(entry.latest.id) ?? []);
    }

    const sessionTitle = buildGroupConversationTitle(participantSummaries, conversation?.title ?? null);
    summaries.push({
      conversationId: entry.id,
      participants: participantSummaries,
      lastMessage: messageRecord,
      session: {
        type: "group",
        title: sessionTitle,
        avatar: conversation?.avatar_url ?? null,
        createdBy: conversation?.created_by ?? null,
      },
    });
  }

  return summaries;
}
function assertGroupParticipantLimit(nextCount: number): void {
  if (nextCount > MAX_GROUP_PARTICIPANTS) {
    throw new ChatServiceError(
      "group_too_large",
      400,
      `Group chats can include at most ${MAX_GROUP_PARTICIPANTS} participants.`,
    );
  }
}
