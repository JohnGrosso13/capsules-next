import type {
  ChatMessageEventPayload,
  ChatMessageUpdatedEventPayload,
  ChatParticipant,
  ChatSessionType,
} from "@/lib/chat/events";

import type { FriendItem } from "@/hooks/useFriendsData";
import type { ChatMessage, ChatMessageAttachment } from "../types";
import type { TypingState } from "../typing";

export type ChatSessionState = {
  id: string;
  type: ChatSessionType;
  title: string;
  avatar: string | null;
  createdBy: string | null;
  participants: ChatParticipant[];
  messages: ChatMessage[];
  messageIndex: Record<string, number>;
  lastMessageTimestamp: number;
  unreadCount: number;
  typing: TypingState;
};

export type ChatState = {
  sessions: Record<string, ChatSessionState>;
  activeSessionId: string | null;
  hydrated: boolean;
  self: {
    currentUserId: string | null;
    selfClientId: string | null;
    aliases: string[];
  };
};

export type SessionEnsureResult = {
  session: ChatSessionState;
  created: boolean;
  changed: boolean;
};

export type MessageAckPayload = {
  id: string;
  authorId: string;
  body: string;
  sentAt: string;
  reactions?: Array<{ emoji: string; users?: ChatParticipant[] }>;
  attachments?: ChatMessageEventPayload["message"]["attachments"];
  taskId?: string | null;
  taskTitle?: string | null;
};

export type MessageUpdatePayload = {
  senderId?: string | null;
  body?: string | null;
  sentAt?: string | null;
  attachments?: ChatMessageUpdatedEventPayload["attachments"];
  participants?: ChatParticipant[];
  taskId?: string | null;
  taskTitle?: string | null;
};

export type MessageDeletePayload = {
  participants?: ChatParticipant[];
};

export type SelfParticipantOptions = {
  participant: ChatParticipant;
  aliases: string[];
};

export type PrepareLocalMessageOptions = {
  selfParticipant?: ChatParticipant | null;
  attachments?: ChatMessageAttachment[];
  selfIdentity: string | null;
  now: () => number;
};

export type PrepareLocalMessageResult = {
  message: ChatMessage;
  session: {
    id: string;
    type: ChatSessionType;
    title: string;
    avatar: string | null;
    createdBy: string | null;
    participants: ChatParticipant[];
  };
};

export type FriendDirectory = Map<string, FriendItem>;
