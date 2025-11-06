"use server";

import { isGroupConversationId } from "@/lib/chat/channels";

import {
  sendDirectMessage,
  updateMessageAttachments,
  deleteMessage,
  createGroupConversationSession,
  addParticipantsToGroupConversation,
  removeParticipantFromGroupConversation,
  renameGroupConversation,
  deleteGroupConversationSession,
  addMessageReaction,
  removeMessageReaction,
  getDirectConversationHistory,
  getGroupConversationHistory,
  listRecentDirectConversations,
  listRecentGroupConversations,
} from "@/server/chat/service";
import {
  type ChatConversationSummary,
  type ChatMessageAttachmentRecord,
  type ChatMessageRecord,
  type ChatParticipantSummary,
  type ChatReactionMutationResult,
  ChatServiceError,
} from "@/server/chat/types";
import { ensureUserSession } from "@/server/actions/session";

import type {
  ChatAddParticipantsInput,
  ChatConversationDTO,
  ChatCreateGroupInput,
  ChatCreateGroupResult,
  ChatDeleteMessageResult,
  ChatHistoryRequest,
  ChatHistoryResult,
  ChatInboxResult,
  ChatMessageAttachmentDTO,
  ChatMessageDTO,
  ChatParticipantDTO,
  ChatRenameGroupInput,
  ChatSendMessageInput,
  ChatSendMessageResult,
  ChatToggleReactionInput,
  ChatToggleReactionResult,
  ChatUpdateAttachmentsInput,
} from "./schema";

function mapParticipant(summary: ChatParticipantSummary): ChatParticipantDTO {
  return {
    id: summary.id,
    name: summary.name,
    avatar: summary.avatar ?? null,
  };
}

function mapParticipants(summaries: ChatParticipantSummary[]): ChatParticipantDTO[] {
  return summaries.map(mapParticipant);
}

function mapAttachments(
  attachments: ChatMessageAttachmentRecord[],
): ChatMessageAttachmentDTO[] {
  return attachments.map((attachment) => ({
    id: attachment.id,
    name: attachment.name,
    mimeType: attachment.mimeType,
    size: attachment.size,
    url: attachment.url,
    thumbnailUrl: attachment.thumbnailUrl ?? null,
    storageKey: attachment.storageKey ?? null,
    sessionId: attachment.sessionId ?? null,
  }));
}

function mapMessage(record: ChatMessageRecord): ChatMessageDTO {
  return {
    id: record.id,
    conversationId: record.conversationId,
    senderId: record.senderId,
    body: record.body,
    sentAt: record.sentAt,
    attachments: mapAttachments(record.attachments),
    reactions: record.reactions.map((reaction) => ({
      emoji: reaction.emoji,
      count: reaction.count,
      users: mapParticipants(reaction.users),
    })),
  };
}

function mapConversation(summary: ChatConversationSummary): ChatConversationDTO {
  return {
    conversationId: summary.conversationId,
    participants: mapParticipants(summary.participants),
    session: {
      type: summary.session.type,
      title: summary.session.title,
      avatar: summary.session.avatar ?? null,
      createdBy: summary.session.createdBy ?? null,
    },
    lastMessage: summary.lastMessage ? mapMessage(summary.lastMessage) : null,
  };
}

function toAttachmentRecord(input: ChatMessageAttachmentDTO): ChatMessageAttachmentRecord {
  const size = Number.isFinite(input.size) ? Math.max(0, Math.floor(input.size)) : 0;
  return {
    id: input.id,
    name: input.name,
    mimeType: input.mimeType,
    size,
    url: input.url,
    thumbnailUrl: input.thumbnailUrl ?? null,
    storageKey: input.storageKey ?? null,
    sessionId: input.sessionId ?? null,
  };
}

function ensureAttachments(
  attachments: ChatMessageAttachmentDTO[] | undefined,
): ChatMessageAttachmentRecord[] | undefined {
  if (!Array.isArray(attachments) || attachments.length === 0) {
    return undefined;
  }
  return attachments.map(toAttachmentRecord);
}

function mapReactionResult(
  result: ChatReactionMutationResult,
): ChatToggleReactionResult {
  return {
    conversationId: result.conversationId,
    messageId: result.messageId,
    emoji: result.emoji,
    action: result.action,
    reactions: result.reactions.map((reaction) => ({
      emoji: reaction.emoji,
      count: reaction.count,
      users: mapParticipants(reaction.users),
    })),
    participants: mapParticipants(result.participants),
  };
}

function rethrowChatError(error: unknown): never {
  if (error instanceof ChatServiceError) {
    throw error;
  }
  if (error instanceof Error) {
    throw error;
  }
  throw new Error("Unexpected chat error");
}

export async function sendChatMessageAction(
  input: ChatSendMessageInput,
): Promise<ChatSendMessageResult> {
  const { supabaseUserId } = await ensureUserSession();
  try {
    const attachments = ensureAttachments(input.attachments);
    const result = await sendDirectMessage({
      conversationId: input.conversationId,
      messageId: input.messageId,
      senderId: supabaseUserId,
      body: input.body,
      clientSentAt: input.clientSentAt ?? null,
      ...(attachments ? { attachments } : {}),
    });

    return {
      message: mapMessage(result.message),
      participants: mapParticipants(result.participants),
    };
  } catch (error) {
    rethrowChatError(error);
  }
}

export async function updateChatMessageAttachmentsAction(
  input: ChatUpdateAttachmentsInput,
): Promise<ChatSendMessageResult> {
  const { supabaseUserId } = await ensureUserSession();
  try {
    const result = await updateMessageAttachments({
      conversationId: input.conversationId,
      messageId: input.messageId,
      requesterId: supabaseUserId,
      removeAttachmentIds: input.removeAttachmentIds,
    });
    return {
      message: mapMessage(result.message),
      participants: mapParticipants(result.participants),
    };
  } catch (error) {
    rethrowChatError(error);
  }
}

export async function deleteChatMessageAction(
  input: { conversationId: string; messageId: string },
): Promise<ChatDeleteMessageResult> {
  const { supabaseUserId } = await ensureUserSession();
  try {
    const result = await deleteMessage({
      conversationId: input.conversationId,
      messageId: input.messageId,
      requesterId: supabaseUserId,
    });
    return {
      conversationId: result.conversationId,
      messageId: result.messageId,
      participants: mapParticipants(result.participants),
    };
  } catch (error) {
    rethrowChatError(error);
  }
}

export async function createGroupConversationAction(
  input: ChatCreateGroupInput,
): Promise<ChatCreateGroupResult> {
  const { supabaseUserId } = await ensureUserSession();
  try {
    const result = await createGroupConversationSession({
      conversationId: input.conversationId,
      creatorId: supabaseUserId,
      participantIds: input.participantIds,
      title: input.title ?? null,
      avatarUrl: input.avatarUrl ?? null,
    });
    return {
      conversationId: result.conversationId,
      participants: mapParticipants(result.participants),
      session: result.session,
    };
  } catch (error) {
    rethrowChatError(error);
  }
}

export async function addGroupParticipantsAction(
  input: ChatAddParticipantsInput,
): Promise<ChatParticipantDTO[]> {
  const { supabaseUserId } = await ensureUserSession();
  try {
    const participants = await addParticipantsToGroupConversation({
      conversationId: input.conversationId,
      requesterId: supabaseUserId,
      participantIds: input.participantIds,
    });
    return mapParticipants(participants);
  } catch (error) {
    rethrowChatError(error);
  }
}

export async function removeGroupParticipantAction(
  input: { conversationId: string; targetUserId: string },
): Promise<ChatParticipantDTO[]> {
  const { supabaseUserId } = await ensureUserSession();
  try {
    const participants = await removeParticipantFromGroupConversation({
      conversationId: input.conversationId,
      requesterId: supabaseUserId,
      targetUserId: input.targetUserId,
      allowSelf: true,
    });
    return mapParticipants(participants);
  } catch (error) {
    rethrowChatError(error);
  }
}

export async function renameGroupConversationAction(
  input: ChatRenameGroupInput,
): Promise<{ conversationId: string; title: string }> {
  const { supabaseUserId } = await ensureUserSession();
  try {
    return await renameGroupConversation({
      conversationId: input.conversationId,
      requesterId: supabaseUserId,
      title: input.title,
    });
  } catch (error) {
    rethrowChatError(error);
  }
}

export async function deleteGroupConversationAction(
  conversationId: string,
): Promise<{ conversationId: string }> {
  const { supabaseUserId } = await ensureUserSession();
  try {
    await deleteGroupConversationSession({
      conversationId,
      requesterId: supabaseUserId,
    });
    return { conversationId };
  } catch (error) {
    rethrowChatError(error);
  }
}

export async function toggleChatReactionAction(
  input: ChatToggleReactionInput,
): Promise<ChatToggleReactionResult> {
  const { supabaseUserId } = await ensureUserSession();
  try {
    const result =
      input.action === "remove"
        ? await removeMessageReaction({
            conversationId: input.conversationId,
            messageId: input.messageId,
            emoji: input.emoji,
            userId: supabaseUserId,
          })
        : await addMessageReaction({
            conversationId: input.conversationId,
            messageId: input.messageId,
            emoji: input.emoji,
            userId: supabaseUserId,
          });
    return mapReactionResult(result);
  } catch (error) {
    rethrowChatError(error);
  }
}

export async function loadChatHistoryAction(
  input: ChatHistoryRequest,
): Promise<ChatHistoryResult> {
  const { supabaseUserId } = await ensureUserSession();
  try {
    const params: {
      conversationId: string;
      requesterId: string;
      before?: string | null;
      limit?: number;
    } = {
      conversationId: input.conversationId,
      requesterId: supabaseUserId,
    };
    if (input.before !== undefined) {
      params.before = input.before ?? null;
    }
    if (input.limit !== undefined) {
      params.limit = input.limit;
    }

    const history = await (isGroupConversationId(input.conversationId)
      ? getGroupConversationHistory(params)
      : getDirectConversationHistory(params));

    return {
      conversationId: history.conversationId,
      participants: mapParticipants(history.participants),
      messages: history.messages.map(mapMessage),
    };
  } catch (error) {
    rethrowChatError(error);
  }
}

export async function loadChatInboxAction(
  limit?: number,
): Promise<ChatInboxResult> {
  const { supabaseUserId } = await ensureUserSession();
  try {
    const normalizedLimit =
      limit !== undefined && Number.isFinite(limit)
        ? Math.max(1, Math.min(100, Math.floor(limit)))
        : undefined;

    const [direct, group] = await Promise.all([
      listRecentDirectConversations({
        userId: supabaseUserId,
        ...(normalizedLimit !== undefined ? { limit: normalizedLimit } : {}),
      }),
      listRecentGroupConversations({
        userId: supabaseUserId,
        ...(normalizedLimit !== undefined ? { limit: normalizedLimit } : {}),
      }),
    ]);

    const combined = [...direct, ...group].sort((a, b) => {
      const left = a.lastMessage ? Date.parse(a.lastMessage.sentAt) : 0;
      const right = b.lastMessage ? Date.parse(b.lastMessage.sentAt) : 0;
      return right - left;
    });

    const limited =
      normalizedLimit !== undefined ? combined.slice(0, normalizedLimit) : combined;

    return {
      conversations: limited.map(mapConversation),
    };
  } catch (error) {
    rethrowChatError(error);
  }
}
