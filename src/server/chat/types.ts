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

export type ChatMessageReactionRecord = {
  emoji: string;
  count: number;
  users: ChatParticipantSummary[];
};

export type ChatParticipantSummary = {
  id: string;
  name: string;
  avatar: string | null;
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

export type ChatReactionMutationResult = {
  conversationId: string;
  messageId: string;
  reactions: ChatMessageReactionRecord[];
  participants: ChatParticipantSummary[];
  actor: ChatParticipantSummary;
  emoji: string;
  action: "added" | "removed";
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
