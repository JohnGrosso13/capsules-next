import { isGroupConversationId } from "@/lib/chat/channels";
import {
  publishDirectMessageEvent,
  publishMessageDeletedEvent,
  publishMessageUpdateEvent,
  publishSessionDeletedEvent,
  publishSessionEvent,
} from "@/services/realtime/chat";

import {
  addGroupParticipants,
  createGroupConversation,
  deleteGroupConversation,
  deleteGroupMessageById,
  findGroupMessageById,
  listGroupConversationsByIds,
  listGroupParticipants,
  removeGroupParticipant,
  updateGroupConversation,
  updateGroupMessageBody,
  upsertGroupMessage,
  fetchUsersByIds,
} from "./repository";
import {
  ChatMessageAttachmentRecord,
  ChatMessageRecord,
  ChatParticipantSummary,
  ChatServiceError,
} from "./types";
import {
  MAX_BODY_LENGTH,
  buildGroupConversationTitle,
  canonicalizeMessageId,
  decodeMessagePayload,
  encodeMessagePayload,
  mergeParticipantMaps,
  normalizeId,
  sanitizeAttachments,
  sanitizeBody,
  toMessageRecord,
  toParticipantSummary,
  ResolvedIdentity,
} from "./utils";
import { resolveIdentity } from "./identity";

const DEFAULT_MAX_GROUP_PARTICIPANTS = 50;
const MAX_GROUP_PARTICIPANTS = (() => {
  const raw = process.env.CHAT_GROUP_MAX_PARTICIPANTS;
  if (!raw) return DEFAULT_MAX_GROUP_PARTICIPANTS;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 2) return DEFAULT_MAX_GROUP_PARTICIPANTS;
  return Math.floor(parsed);
})();

export function assertGroupParticipantLimit(nextCount: number): void {
  if (nextCount > MAX_GROUP_PARTICIPANTS) {
    throw new ChatServiceError(
      "group_too_large",
      400,
      "Group chats can include at most " + MAX_GROUP_PARTICIPANTS + " participants.",
    );
  }
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

export async function updateMessageAttachments(params: {
  conversationId: string;
  messageId: string;
  requesterId: string;
  removeSet: Set<string>;
}): Promise<{ message: ChatMessageRecord; participants: ChatParticipantSummary[] }> {
  const trimmedConversationId = params.conversationId.trim();
  const requesterTrimmed = params.requesterId?.trim();
  if (!requesterTrimmed) {
    throw new ChatServiceError("auth_required", 401, "Sign in to modify this message.");
  }

  const identityCache = new Map<string, ResolvedIdentity | null>();
  const requesterResolved = await resolveIdentity(identityCache, requesterTrimmed, requesterTrimmed);
  if (!requesterResolved) {
    throw new ChatServiceError("auth_required", 401, "Sign in to modify this message.");
  }
  const canonicalRequester = normalizeId(requesterResolved.canonicalId);
  if (!canonicalRequester) {
    throw new ChatServiceError("auth_required", 401, "Sign in to modify this message.");
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
  if (!participantIds.includes(canonicalRequester)) {
    throw new ChatServiceError("forbidden", 403, "You do not have access to this conversation.");
  }

  const canonicalMessageId = canonicalizeMessageId(params.messageId, trimmedConversationId);
  const messageRow = await findGroupMessageById(canonicalMessageId);
  if (!messageRow || normalizeId(messageRow.conversation_id) !== trimmedConversationId) {
    throw new ChatServiceError("message_not_found", 404, "That message could not be found.");
  }
  if (normalizeId(messageRow.sender_id) !== canonicalRequester) {
    throw new ChatServiceError(
      "forbidden",
      403,
      "You can only modify attachments on messages you sent.",
    );
  }

  const payload = decodeMessagePayload(messageRow.body ?? "");
  if (!payload.attachments.length) {
    throw new ChatServiceError("invalid_request", 400, "That message has no attachments.");
  }
  const filteredAttachments = payload.attachments.filter(
    (attachment) => !params.removeSet.has(attachment.id),
  );
  const memberSet = new Set(participantIds);
  if (filteredAttachments.length === payload.attachments.length) {
    const unchanged = toMessageRecord(messageRow);
    const participantSummaries = await buildGroupParticipantSummaries(
      memberSet,
      [requesterResolved],
    );
    return { message: unchanged, participants: participantSummaries };
  }

  if (!payload.text && filteredAttachments.length === 0) {
    throw new ChatServiceError(
      "invalid_request",
      400,
      "Remove the message instead of deleting all attachments.",
    );
  }

  const serializedBody = encodeMessagePayload(payload.text, filteredAttachments);
  const updatedRow =
    (await updateGroupMessageBody({ id: messageRow.id, body: serializedBody })) ?? {
      ...messageRow,
      body: serializedBody,
    };
  const messageRecord = toMessageRecord(updatedRow);
  const participantSummaries = await buildGroupParticipantSummaries(
    memberSet,
    [requesterResolved],
  );
  const sessionTitle = buildGroupConversationTitle(participantSummaries, conversationRow.title);
  const sessionAvatar = conversationRow.avatar_url ?? null;

  await publishMessageUpdateEvent({
    conversationId: messageRecord.conversationId,
    messageId: messageRecord.id,
    body: messageRecord.body,
    attachments: messageRecord.attachments,
    participants: participantSummaries,
    senderId: messageRecord.senderId,
    sentAt: messageRecord.sentAt,
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

async function deleteDirectMessage(params: {
  conversationId: string;
  messageId: string;
  requesterId: string;
}): Promise<{ conversationId: string; messageId: string; participants: ChatParticipantSummary[] }> {
  const { left, right } = parseConversationId(params.conversationId);
  const identityCache = new Map<string, ResolvedIdentity | null>();
  const leftResolved = await resolveIdentity(identityCache, left, left);
  const rightResolved = await resolveIdentity(identityCache, right, right);
  const requesterResolved = await resolveIdentity(
    identityCache,
    params.requesterId,
    params.requesterId,
  );
  if (!leftResolved || !rightResolved || !requesterResolved) {
    throw new ChatServiceError("invalid_conversation", 404, "That conversation could not be found.");
  }

  const canonicalLeft = normalizeId(leftResolved.canonicalId);
  const canonicalRight = normalizeId(rightResolved.canonicalId);
  const canonicalRequester = normalizeId(requesterResolved.canonicalId);
  if (!canonicalLeft || !canonicalRight || !canonicalRequester) {
    throw new ChatServiceError("invalid_conversation", 404, "That conversation could not be found.");
  }

  const canonicalConversationId = getChatConversationId(canonicalLeft, canonicalRight);
  const canonicalMessageId = canonicalizeMessageId(params.messageId, canonicalConversationId);
  const messageRow = await findChatMessageById(canonicalMessageId);
  if (!messageRow || normalizeId(messageRow.conversation_id) !== canonicalConversationId) {
    throw new ChatServiceError("message_not_found", 404, "That message could not be found.");
  }
  if (normalizeId(messageRow.sender_id) !== canonicalRequester) {
    throw new ChatServiceError(
      "forbidden",
      403,
      "You can only delete messages you sent.",
    );
  }

  await deleteChatMessageById(messageRow.id);
  const participantSummaries = await buildDirectParticipantSummaries(leftResolved, rightResolved);

  await publishMessageDeletedEvent({
    conversationId: canonicalConversationId,
    messageId: canonicalMessageId,
    participants: participantSummaries,
  });

  return {
    conversationId: canonicalConversationId,
    messageId: canonicalMessageId,
    participants: participantSummaries,
  };
}

export async function deleteGroupMessage(params: {
  conversationId: string;
  messageId: string;
  requesterId: string;
}): Promise<{ conversationId: string; messageId: string; participants: ChatParticipantSummary[] }> {
  const trimmedConversationId = params.conversationId.trim();
  const requesterTrimmed = params.requesterId?.trim();
  if (!requesterTrimmed) {
    throw new ChatServiceError("auth_required", 401, "Sign in to delete that message.");
  }

  const identityCache = new Map<string, ResolvedIdentity | null>();
  const requesterResolved = await resolveIdentity(identityCache, requesterTrimmed, requesterTrimmed);
  if (!requesterResolved) {
    throw new ChatServiceError("auth_required", 401, "Sign in to delete that message.");
  }
  const canonicalRequester = normalizeId(requesterResolved.canonicalId);
  if (!canonicalRequester) {
    throw new ChatServiceError("auth_required", 401, "Sign in to delete that message.");
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
  if (!participantIds.includes(canonicalRequester)) {
    throw new ChatServiceError("forbidden", 403, "You do not have access to this conversation.");
  }

  const canonicalMessageId = canonicalizeMessageId(params.messageId, trimmedConversationId);
  const messageRow = await findGroupMessageById(canonicalMessageId);
  if (!messageRow || normalizeId(messageRow.conversation_id) !== trimmedConversationId) {
    throw new ChatServiceError("message_not_found", 404, "That message could not be found.");
  }
  if (normalizeId(messageRow.sender_id) !== canonicalRequester) {
    throw new ChatServiceError(
      "forbidden",
      403,
      "You can only delete messages you sent.",
    );
  }

  await deleteGroupMessageById(messageRow.id);
  const memberSet = new Set(participantIds);
  const participantSummaries = await buildGroupParticipantSummaries(
    memberSet,
    [requesterResolved],
  );

  await publishMessageDeletedEvent({
    conversationId: trimmedConversationId,
    messageId: canonicalMessageId,
    participants: participantSummaries,
    session: {
      type: "group",
      title: buildGroupConversationTitle(participantSummaries, conversationRow.title),
      avatar: conversationRow.avatar_url ?? null,
      createdBy: conversationRow.created_by ?? null,
    },
  });

  return {
    conversationId: trimmedConversationId,
    messageId: canonicalMessageId,
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
