import type {
  ChatMessageEventPayload,
  ChatMessageUpdatedEventPayload,
  ChatParticipant,
  ChatSessionType,
} from "@/lib/chat/events";

import type { TimerAdapter } from "@/components/providers/chat-store/scheduler";

export type ChatMessageReaction = {
  emoji: string;
  count: number;
  users: ChatParticipant[];
  selfReacted: boolean;
};

export type ChatMessageAttachment = {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  url: string;
  thumbnailUrl: string | null;
  storageKey: string | null;
  sessionId: string | null;
};

export type ChatMessage = {
  id: string;
  authorId: string;
  body: string;
  sentAt: string;
  status: "pending" | "sent" | "failed";
  reactions: ChatMessageReaction[];
  attachments: ChatMessageAttachment[];
};

export type ChatTypingEventPayload = {
  type: "chat.typing";
  conversationId: string;
  senderId: string;
  typing: boolean;
  sender?: Partial<ChatParticipant> | null;
  participants?: ChatParticipant[];
  expiresAt?: string | null;
};

export type ChatSession = {
  id: string;
  type: ChatSessionType;
  title: string;
  avatar: string | null;
  createdBy: string | null;
  participants: ChatParticipant[];
  messages: ChatMessage[];
  unreadCount: number;
  lastMessageAt: string | null;
  lastMessagePreview: string | null;
  typing: ChatParticipant[];
};

export type StoredMessageReaction = {
  emoji: string;
  users: StoredParticipant[];
};

export type StoredParticipant = {
  id: string;
  name: string;
  avatar: string | null;
};

export type StoredMessageAttachment = {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  url: string;
  thumbnailUrl?: string | null;
  storageKey?: string | null;
  sessionId?: string | null;
};

export type StoredMessage = {
  id: string;
  authorId: string;
  body: string;
  sentAt: string;
  reactions?: StoredMessageReaction[];
  attachments?: StoredMessageAttachment[];
};

export type StoredSession = {
  id: string;
  type: ChatSessionType;
  title: string;
  avatar: string | null;
  createdBy: string | null;
  participants: StoredParticipant[];
  messages: StoredMessage[];
};

export type LegacyStoredSession = {
  id: string;
  friendUserId: string;
  friendName: string;
  friendAvatar: string | null;
  messages: StoredMessage[];
};

export type StoredState = {
  activeSessionId: string | null;
  sessions: Array<StoredSession | LegacyStoredSession>;
};

export type StorageAdapter = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export type ChatStoreSnapshot = {
  sessions: ChatSession[];
  activeSessionId: string | null;
  activeSession: ChatSession | null;
  unreadCount: number;
};

export interface ChatStorePersistenceAdapter {
  load(): StoredState | null;
  save(state: StoredState): void;
  setStorage(storage: StorageAdapter | null): void;
  isEnabled(): boolean;
}

export type ChatStoreConfig = {
  storage?: StorageAdapter | null;
  storageKey?: string;
  messageLimit?: number;
  now?: () => number;
  timers?: TimerAdapter | null;
  persistence?: ChatStorePersistenceAdapter | null;
};

export type MessageAttachmentInput =
  | ChatMessageEventPayload["message"]["attachments"]
  | ChatMessageUpdatedEventPayload["attachments"];
