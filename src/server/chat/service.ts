import { isGroupConversationId } from "@/lib/chat/channels";

import {
  sendDirectMessage as sendDirectMessageCore,
  updateDirectMessageAttachments,
  deleteDirectMessage,
  createAssistantDependenciesForUser,
} from "./direct";
import {
  sendGroupMessage as sendGroupMessageCore,
  updateGroupMessageAttachments as updateGroupMessageAttachmentsCore,
  deleteGroupMessage as deleteGroupMessageCore,
  createGroupConversationSession,
  addParticipantsToGroupConversation,
  removeParticipantFromGroupConversation,
  renameGroupConversation,
  deleteGroupConversationSession,
  assertGroupParticipantLimit,
} from "./group";
import {
  getDirectConversationHistory,
  getGroupConversationHistory,
  listRecentDirectConversations,
  listRecentGroupConversations,
} from "./history";
import {
  ChatConversationSummary,
  ChatMessageAttachmentRecord,
  ChatMessageReactionRecord,
  ChatMessageRecord,
  ChatParticipantSummary,
  ChatReactionMutationResult,
  ChatServiceError,
} from "./types";

export type {
  ChatConversationSummary,
  ChatMessageAttachmentRecord,
  ChatMessageReactionRecord,
  ChatMessageRecord,
  ChatParticipantSummary,
  ChatReactionMutationResult,
} from "./types";
export { ChatServiceError } from "./types";
export { createAssistantDependenciesForUser } from "./direct";
export {
  sendGroupMessage,
  updateGroupMessageAttachments,
  deleteGroupMessage,
  createGroupConversationSession,
  addParticipantsToGroupConversation,
  removeParticipantFromGroupConversation,
  renameGroupConversation,
  deleteGroupConversationSession,
  assertGroupParticipantLimit,
} from "./group";
export {
  getDirectConversationHistory,
  getGroupConversationHistory,
  listRecentDirectConversations,
  listRecentGroupConversations,
} from "./history";
export { addMessageReaction, removeMessageReaction } from "./reactions";

export async function sendDirectMessage(params: {
  conversationId: string;
  senderId: string;
  messageId: string;
  body: string;
  attachments?: ChatMessageAttachmentRecord[];
  clientSentAt?: string | null;
}): Promise<{ message: ChatMessageRecord; participants: ChatParticipantSummary[] }> {
  if (isGroupConversationId(params.conversationId)) {
    return sendGroupMessageCore(params);
  }
  return sendDirectMessageCore(params);
}

export async function updateMessageAttachments(params: {
  conversationId: string;
  messageId: string;
  requesterId: string;
  removeAttachmentIds: string[];
}): Promise<{ message: ChatMessageRecord; participants: ChatParticipantSummary[] }> {
  const trimmedConversationId = params.conversationId?.trim();
  if (!trimmedConversationId) {
    throw new ChatServiceError("invalid_conversation", 400, "A conversation id is required.");
  }
  const removeSet = new Set(
    (Array.isArray(params.removeAttachmentIds) ? params.removeAttachmentIds : [])
      .map((value) => (typeof value === "string" ? value.trim() : ""))
      .filter((value): value is string => Boolean(value)),
  );
  if (!removeSet.size) {
    throw new ChatServiceError("invalid_request", 400, "No attachments specified for removal.");
  }

  if (isGroupConversationId(trimmedConversationId)) {
    return updateGroupMessageAttachmentsCore({
      conversationId: trimmedConversationId,
      messageId: params.messageId,
      requesterId: params.requesterId,
      removeSet,
    });
  }

  return updateDirectMessageAttachments({
    conversationId: trimmedConversationId,
    messageId: params.messageId,
    requesterId: params.requesterId,
    removeSet,
  });
}

export async function deleteMessage(params: {
  conversationId: string;
  messageId: string;
  requesterId: string;
}): Promise<{ conversationId: string; messageId: string; participants: ChatParticipantSummary[] }> {
  const trimmedConversationId = params.conversationId?.trim();
  if (!trimmedConversationId) {
    throw new ChatServiceError("invalid_conversation", 400, "A conversation id is required.");
  }

  if (isGroupConversationId(trimmedConversationId)) {
    return deleteGroupMessageCore({
      conversationId: trimmedConversationId,
      messageId: params.messageId,
      requesterId: params.requesterId,
    });
  }

  return deleteDirectMessage({
    conversationId: trimmedConversationId,
    messageId: params.messageId,
    requesterId: params.requesterId,
  });
}
