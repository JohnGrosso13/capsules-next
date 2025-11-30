export type ChatParticipantDTO = {
  id: string;
  name: string;
  avatar: string | null;
};

export type ChatMessageAttachmentDTO = {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  url: string;
  thumbnailUrl: string | null;
  storageKey: string | null;
  sessionId: string | null;
};

export type ChatReactionDTO = {
  emoji: string;
  count: number;
  users: ChatParticipantDTO[];
};

export type ChatMessageDTO = {
  id: string;
  conversationId: string;
  senderId: string;
  body: string;
  sentAt: string;
  reactions: ChatReactionDTO[];
  attachments: ChatMessageAttachmentDTO[];
  taskId?: string | null;
  taskTitle?: string | null;
};

export type ChatConversationSessionDTO = {
  type: "direct" | "group";
  title: string;
  avatar: string | null;
  createdBy: string | null;
};

export type ChatConversationDTO = {
  conversationId: string;
  participants: ChatParticipantDTO[];
  session: ChatConversationSessionDTO;
  lastMessage: ChatMessageDTO | null;
};

export type ChatSendMessageInput = {
  conversationId: string;
  messageId: string;
  body: string;
  attachments?: ChatMessageAttachmentDTO[];
  clientSentAt?: string | null;
  task?: { id?: string | null; title?: string | null } | null;
};

export type ChatSendMessageResult = {
  message: ChatMessageDTO;
  participants: ChatParticipantDTO[];
};

export type ChatUpdateAttachmentsInput = {
  conversationId: string;
  messageId: string;
  removeAttachmentIds: string[];
};

export type ChatDeleteMessageResult = {
  conversationId: string;
  messageId: string;
  participants: ChatParticipantDTO[];
};

export type ChatCreateGroupInput = {
  conversationId: string;
  title?: string | null;
  avatarUrl?: string | null;
  participantIds: string[];
};

export type ChatCreateGroupResult = {
  conversationId: string;
  participants: ChatParticipantDTO[];
  session: ChatConversationSessionDTO;
};

export type ChatAddParticipantsInput = {
  conversationId: string;
  participantIds: string[];
};

export type ChatRenameGroupInput = {
  conversationId: string;
  title: string;
};

export type ChatToggleReactionInput = {
  conversationId: string;
  messageId: string;
  emoji: string;
  action: "add" | "remove";
};

export type ChatToggleReactionResult = {
  conversationId: string;
  messageId: string;
  emoji: string;
  action: "added" | "removed";
  reactions: ChatReactionDTO[];
  participants: ChatParticipantDTO[];
};

export type ChatHistoryRequest = {
  conversationId: string;
  before?: string | null;
  limit?: number;
};

export type ChatHistoryResult = {
  conversationId: string;
  participants: ChatParticipantDTO[];
  messages: ChatMessageDTO[];
};

export type ChatInboxResult = {
  conversations: ChatConversationDTO[];
};
