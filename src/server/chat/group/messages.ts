import { isGroupConversationId } from "@/lib/chat/channels";
import {
  publishDirectMessageEvent,
  publishMessageDeletedEvent,
  publishMessageUpdateEvent,
} from "@/services/realtime/chat";

import {
  deleteGroupMessageById,
  findGroupMessageById,
  listGroupConversationsByIds,
  listGroupParticipants,
  updateGroupMessageBody,
  upsertGroupMessage,
  fetchUsersByIds,
} from "../repository";
import {
  type ChatMessageAttachmentRecord,
  type ChatMessageRecord,
  type ChatParticipantSummary,
  ChatServiceError,
} from "../types";
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
  type ResolvedIdentity,
} from "../utils";
import { resolveIdentity } from "../identity";
import { buildGroupParticipantSummaries } from "./participants";
export async function sendGroupMessage(params: {
  conversationId: string;
  senderId: string;
  messageId: string;
  body: string;
  attachments?: ChatMessageAttachmentRecord[];
  clientSentAt?: string | null;
  task?: { id?: string | null; title?: string | null } | null;
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
  const serializedBody = encodeMessagePayload(bodySanitized, attachments, params.task);
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
    taskId: messageRecord.taskId ?? null,
    taskTitle: messageRecord.taskTitle ?? null,
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

export async function updateGroupMessageAttachments(params: {
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

  const serializedBody = encodeMessagePayload(payload.text, filteredAttachments, payload.task);
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
    taskId: messageRecord.taskId ?? null,
    taskTitle: messageRecord.taskTitle ?? null,
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
