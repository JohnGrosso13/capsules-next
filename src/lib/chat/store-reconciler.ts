"use client";

import { isGroupConversationId } from "@/lib/chat/channels";
import type { ChatStore } from "@/components/providers/chat-store";
import type {
  ChatMessage,
  ChatMessageAttachment,
  ChatMessageReaction,
  ChatParticipant,
  ChatSession,
} from "@/components/providers/chat-store";
import type {
  ChatParticipantDTO,
  ChatMessageAttachmentDTO,
  ChatMessageDTO,
  ChatReactionDTO,
} from "@/services/chat/schema";

type MessageCommittedCallback = (payload: { conversationId: string; message: ChatMessage }) => void;

export type ChatStoreReconcilerOptions = {
  store: ChatStore;
  resolveSession: (conversationId: string) => ChatSession | null;
  isSelfUser: (userId: string | null | undefined) => boolean;
  onMessageCommitted?: MessageCommittedCallback | undefined;
};

export class ChatStoreReconciler {
  private readonly store: ChatStore;
  private readonly resolveSession: ChatStoreReconcilerOptions["resolveSession"];
  private readonly isSelfUser: ChatStoreReconcilerOptions["isSelfUser"];
  private readonly onMessageCommitted: MessageCommittedCallback | undefined;

  constructor(options: ChatStoreReconcilerOptions) {
    this.store = options.store;
    this.resolveSession = options.resolveSession;
    this.isSelfUser = options.isSelfUser;
    this.onMessageCommitted = options.onMessageCommitted;
  }

  applyParticipants(conversationId: string, participants: ChatParticipantDTO[]): void {
    if (!Array.isArray(participants) || participants.length === 0) return;
    const existingSession = this.resolveSession(conversationId);
    const descriptor = {
      id: conversationId,
      type:
        existingSession?.type ??
        (isGroupConversationId(conversationId) ? ("group" as const) : ("direct" as const)),
      title: existingSession?.title ?? "",
      avatar: existingSession?.avatar ?? null,
      createdBy: existingSession?.createdBy ?? null,
      participants: participants
        .map((participant) => ({
          id: participant.id,
          name: participant.name || participant.id,
          avatar: participant.avatar ?? null,
        }))
        .filter((participant): participant is ChatParticipant => Boolean(participant.id)),
    };
    this.store.applySessionEvent(descriptor);
  }

  upsertMessage(conversationId: string, dto: ChatMessageDTO): void {
    if (!dto?.id) return;
    const sanitized =
      typeof dto.body === "string" ? dto.body.replace(/\s+/g, " ").trim() : "";
    const attachments = this.normalizeAttachmentsFromDto(dto.attachments);
    if (!sanitized && attachments.length === 0) return;
    const reactions = this.normalizeReactionsFromDto(dto.reactions);
    const taskId =
      typeof dto.taskId === "string" && dto.taskId.trim().length ? dto.taskId.trim() : null;
    const taskTitle =
      typeof dto.taskTitle === "string" && dto.taskTitle.trim().length
        ? dto.taskTitle.trim()
        : null;
    const chatMessage: ChatMessage = {
      id: dto.id,
      authorId: dto.senderId,
      body: sanitized,
      sentAt: dto.sentAt,
      status: "sent",
      reactions,
      attachments,
      taskId,
      taskTitle,
    };
    const isLocal = this.isSelfUser(dto.senderId);
    this.store.addMessage(conversationId, chatMessage, { isLocal });
    this.onMessageCommitted?.({ conversationId, message: chatMessage });
  }

  normalizeAttachmentsFromDto(
    attachments: ChatMessageAttachmentDTO[] | undefined,
  ): ChatMessageAttachment[] {
    if (!Array.isArray(attachments) || attachments.length === 0) {
      return [];
    }
    const merged = new Map<string, ChatMessageAttachment>();
    attachments.forEach((attachment) => {
      if (!attachment) return;
      const id = typeof attachment.id === "string" ? attachment.id.trim() : "";
      if (!id || merged.has(id)) return;
      const name =
        typeof attachment.name === "string" && attachment.name.trim().length
          ? attachment.name.trim()
          : id;
      const mimeType =
        typeof attachment.mimeType === "string" && attachment.mimeType.trim().length
          ? attachment.mimeType.trim()
          : "application/octet-stream";
      const url = typeof attachment.url === "string" && attachment.url.trim().length ? attachment.url.trim() : "";
      if (!url) return;
      const size =
        typeof attachment.size === "number" && Number.isFinite(attachment.size) && attachment.size >= 0
          ? Math.floor(attachment.size)
          : 0;
      merged.set(id, {
        id,
        name,
        mimeType,
        size,
        url,
        thumbnailUrl:
          typeof attachment.thumbnailUrl === "string" && attachment.thumbnailUrl.trim().length
            ? attachment.thumbnailUrl.trim()
            : null,
        storageKey:
          typeof attachment.storageKey === "string" && attachment.storageKey.trim().length
            ? attachment.storageKey.trim()
            : null,
        sessionId:
          typeof attachment.sessionId === "string" && attachment.sessionId.trim().length
            ? attachment.sessionId.trim()
            : null,
      });
    });
    return Array.from(merged.values());
  }

  normalizeReactionsFromDto(reactions: ChatReactionDTO[] | undefined): ChatMessageReaction[] {
    if (!Array.isArray(reactions) || reactions.length === 0) {
      return [];
    }
    const aggregation = new Map<string, Map<string, ChatParticipant>>();
    reactions.forEach((reaction) => {
      if (!reaction) return;
      const emoji = typeof reaction.emoji === "string" ? reaction.emoji.trim() : "";
      if (!emoji) return;
      const users = Array.isArray(reaction.users) ? reaction.users : [];
      let bucket = aggregation.get(emoji);
      if (!bucket) {
        bucket = new Map<string, ChatParticipant>();
        aggregation.set(emoji, bucket);
      }
      users.forEach((user) => {
        if (!user?.id) return;
        const normalized: ChatParticipant = {
          id: user.id,
          name: typeof user.name === "string" && user.name.trim().length
            ? user.name.trim()
            : user.id,
          avatar: user.avatar ?? null,
        };
        bucket!.set(normalized.id, normalized);
      });
    });
    const normalized: ChatMessageReaction[] = [];
    aggregation.forEach((bucket, emoji) => {
      const users = Array.from(bucket.values()).sort((a, b) => {
        const nameCompare = a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
        if (nameCompare !== 0) return nameCompare;
        return a.id.localeCompare(b.id);
      });
      normalized.push({
        emoji,
        count: users.length,
        users,
        selfReacted: users.some((user) => this.isSelfUser(user.id)),
      });
    });
    normalized.sort((a, b) => {
      if (b.count !== a.count) return b.count - a.count;
      return a.emoji.localeCompare(b.emoji);
    });
    return normalized;
  }
}
