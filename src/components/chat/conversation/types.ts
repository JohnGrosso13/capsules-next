"use client";

import type {
  ChatMessage,
  ChatParticipant,
  ChatSession,
} from "@/components/providers/ChatProvider";
import type { ChatMessageSendInput } from "@/components/providers/ChatProvider";

export type ChatConversationProps = {
  session: ChatSession;
  currentUserId: string | null;
  selfClientId: string | null;
  onSend: (input: ChatMessageSendInput) => Promise<void>;
  onBack?: () => void;
  onDelete?: () => void;
  onInviteParticipants?: () => void;
  onRenameGroup?: () => void;
  onTypingChange?: (conversationId: string, typing: boolean) => void;
  onToggleReaction?: (conversationId: string, messageId: string, emoji: string) => Promise<void>;
  onRemoveAttachments?: (messageId: string, attachmentIds: string[]) => Promise<void>;
  onDeleteMessage?: (messageId: string) => Promise<void>;
};

export type ReactionPickerAnchor = {
  targetId: string | null;
  anchorRect: DOMRect | null;
  anchorLabel: string | null;
};

export type ReactionPickerViewModel = ReactionPickerAnchor & {
  onSelect: (emoji: string) => void;
  onClose: () => void;
};

export type MessageContextMenuState = {
  messageId: string | null;
  messageIndex: number;
  messageKey: string;
  x: number;
  y: number;
  isSelf: boolean;
};

export type MessageIdentityResolver = {
  selfIdentifiers: Set<string>;
  participantMap: Map<string, ChatParticipant>;
  selfName: string;
  selfAvatar: string | null;
};

export type MessageDescriptor = {
  message: ChatMessage;
  index: number;
  key: string;
};

export type ConversationParticipantsViewModel = {
  participants: ChatParticipant[];
  onInviteParticipants?: (() => void) | undefined;
};
