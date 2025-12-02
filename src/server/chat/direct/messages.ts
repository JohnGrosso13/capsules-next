import { randomUUID } from "node:crypto";

import { getChatConversationId, parseConversationId } from "@/lib/chat/channels";
import {
  publishDirectMessageEvent,
  publishMessageDeletedEvent,
  publishMessageUpdateEvent,
} from "@/services/realtime/chat";
import { ASSISTANT_USER_ID } from "@/shared/assistant/constants";
import { handleAssistantMessage, handleAssistantTaskResponse } from "../assistant/service";
import type { AssistantDependencies } from "../assistant/service";
import { listSocialGraph } from "@/server/friends/service";
import { listCapsulesForUser } from "@/server/capsules/repository";
import {
  listCapsuleLaddersByCapsule,
  listCapsuleLadderMemberRecords,
} from "@/server/ladders/repository";

import {
  fetchUsersByIds,
  upsertChatMessage,
  findChatMessageById,
  updateChatMessageBody,
  deleteChatMessageById,
  type ChatParticipantRow,
} from "../repository";
import {
  type ChatMessageAttachmentRecord,
  type ChatMessageRecord,
  type ChatParticipantSummary,
  ChatServiceError,
} from "../types";
import {
  MAX_BODY_LENGTH,
  buildConversationTitle,
  canonicalizeMessageId,
  encodeMessagePayload,
  mergeParticipantMaps,
  normalizeId,
  sanitizeAttachments,
  sanitizeBody,
  decodeMessagePayload,
  toMessageRecord,
  toParticipantSummary,
  type ResolvedIdentity,
} from "../utils";
import { resolveIdentity } from "../identity";
import { getDirectConversationHistory } from "../history";

export function createAssistantDependenciesForUser(ownerUserId: string): AssistantDependencies {
  return {
    getConversationHistory: ({ conversationId, limit }) =>
      getDirectConversationHistory({
        conversationId,
        requesterId: ownerUserId,
        ...(typeof limit === "number" ? { limit } : {}),
      }),
    sendAssistantMessage: async ({ conversationId, body, task }) => {
      try {
        await sendDirectMessage({
          conversationId,
          senderId: ASSISTANT_USER_ID,
          messageId: randomUUID(),
          body,
          attachments: [],
          ...(task ? { task } : {}),
        });
      } catch (error) {
        console.error("assistant send message error", error);
      }
    },
    sendUserMessage: async ({ conversationId, senderId, body, messageId, task }) => {
      const result = await sendDirectMessage({
        conversationId,
        senderId,
        messageId: messageId ?? randomUUID(),
        body,
        attachments: [],
        ...(task ? { task } : {}),
      });
      return { messageId: result.message.id };
    },
    listFriends: async (userId: string) => {
      const snapshot = await listSocialGraph(userId);
      return snapshot.friends;
    },
    listCapsules: (userId: string) => listCapsulesForUser(userId),
    listCapsuleLadders: (capsuleId: string) => listCapsuleLaddersByCapsule(capsuleId),
    listLadderMembers: (ladderId: string) => listCapsuleLadderMemberRecords(ladderId),
  };
}

export async function sendDirectMessage(params: {
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
  if (!params.conversationId.trim()) {
    throw new ChatServiceError("invalid_conversation", 400, "A conversation id is required.");
  }

  let parsedConversation: { left: string; right: string };
  try {
    parsedConversation = parseConversationId(params.conversationId);
  } catch {
    throw new ChatServiceError(
      "invalid_conversation",
      400,
      "That conversation could not be found.",
    );
  }
  const { left, right } = parsedConversation;
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

  const serializedBody = encodeMessagePayload(bodySanitized, attachments, params.task);

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
    taskId: messageRecord.taskId ?? null,
    taskTitle: messageRecord.taskTitle ?? null,
    session: {
      type: "direct",
      title: buildConversationTitle(participantSummaries, messageRecord.senderId),
    },
  });

  const isAssistantSender = canonicalSenderId === ASSISTANT_USER_ID;
  const involvesAssistant =
    canonicalLeft === ASSISTANT_USER_ID || canonicalRight === ASSISTANT_USER_ID;

  if (!isAssistantSender && otherCanonicalId === ASSISTANT_USER_ID) {
    const deps = createAssistantDependenciesForUser(canonicalSenderId);
    void (async () => {
      try {
        await handleAssistantMessage(
          {
            ownerUserId: canonicalSenderId,
            conversationId: canonicalConversationId,
            latestMessage: messageRecord,
          },
          deps,
        );
      } catch (error) {
        console.error("assistant conversation error", error);
      }
    })();
  } else if (!involvesAssistant || (involvesAssistant && !isAssistantSender)) {
    const owners = new Set<string>();
    if (canonicalSenderId !== ASSISTANT_USER_ID) owners.add(canonicalSenderId);
    if (otherCanonicalId !== ASSISTANT_USER_ID) owners.add(otherCanonicalId);
    owners.forEach((ownerId) => {
      const deps = createAssistantDependenciesForUser(ownerId);
      void (async () => {
        try {
          await handleAssistantTaskResponse(
            {
              ownerUserId: ownerId,
              conversationId: canonicalConversationId,
              message: messageRecord,
            },
            deps,
          );
        } catch (error) {
          console.error("assistant task response error", error);
        }
      })();
    });
  }

  return {
    message: messageRecord,
    participants: participantSummaries,
  };
}

async function buildDirectParticipantSummaries(
  leftResolved: ResolvedIdentity,
  rightResolved: ResolvedIdentity,
): Promise<ChatParticipantSummary[]> {
  const participantIds = Array.from(
    new Set(
      [leftResolved.canonicalId, rightResolved.canonicalId]
        .map((value) => normalizeId(value))
        .filter((value): value is string => Boolean(value)),
    ),
  );
  if (!participantIds.length) return [];

  const participantRows = await fetchUsersByIds(participantIds);
  const participantMap = new Map<string, ChatParticipantRow>();
  participantRows.forEach((row) => {
    const id = normalizeId(row.id);
    if (id && !participantMap.has(id)) {
      participantMap.set(id, row);
    }
  });
  mergeParticipantMaps(participantMap, [leftResolved, rightResolved]);

  return participantIds
    .map((id) => toParticipantSummary(participantMap.get(id) ?? undefined, id))
    .filter(
      (participant, index, list) =>
        list.findIndex((entry) => entry.id === participant.id) === index,
    );
}

export async function updateDirectMessageAttachments(params: {
  conversationId: string;
  messageId: string;
  requesterId: string;
  removeSet: Set<string>;
}): Promise<{ message: ChatMessageRecord; participants: ChatParticipantSummary[] }> {
  let parsedConversation: { left: string; right: string };
  try {
    parsedConversation = parseConversationId(params.conversationId);
  } catch {
    throw new ChatServiceError(
      "invalid_conversation",
      400,
      "That conversation could not be found.",
    );
  }
  const { left, right } = parsedConversation;
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
  if (filteredAttachments.length === payload.attachments.length) {
    const unchangedRecord = toMessageRecord(messageRow);
    const participants = await buildDirectParticipantSummaries(leftResolved, rightResolved);
    return { message: unchangedRecord, participants };
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
    (await updateChatMessageBody({ id: messageRow.id, body: serializedBody })) ?? {
      ...messageRow,
      body: serializedBody,
    };
  const messageRecord = toMessageRecord(updatedRow);
  const participantSummaries = await buildDirectParticipantSummaries(leftResolved, rightResolved);

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
      type: "direct",
      title: buildConversationTitle(participantSummaries, messageRecord.senderId),
    },
  });

  return {
    message: messageRecord,
    participants: participantSummaries,
  };
}

export async function deleteDirectMessage(params: {
  conversationId: string;
  messageId: string;
  requesterId: string;
}): Promise<{ conversationId: string; messageId: string; participants: ChatParticipantSummary[] }> {
  let parsedConversation: { left: string; right: string };
  try {
    parsedConversation = parseConversationId(params.conversationId);
  } catch {
    throw new ChatServiceError(
      "invalid_conversation",
      400,
      "That conversation could not be found.",
    );
  }
  const { left, right } = parsedConversation;
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
