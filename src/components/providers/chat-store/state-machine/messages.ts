import type { ChatSessionDescriptor } from "@/lib/chat/events";

import {
  mergeParticipants,
  normalizeLocalAttachments,
  normalizeReactions,
  sanitizeIncomingAttachments,
  sanitizeMessageBody,
} from "../helpers";
import type { ChatMessage } from "../types";
import { ChatSessionMachine } from "./sessions";
import type {
  MessageAckPayload,
  PrepareLocalMessageOptions,
  PrepareLocalMessageResult,
} from "./types";

export class ChatMessageMachine extends ChatSessionMachine {
  addMessage(sessionId: string, message: ChatMessage, options: { isLocal: boolean }): boolean {
    const session = this.state.sessions[sessionId];
    if (!session) return false;
    let changed = false;
    const attachments = normalizeLocalAttachments(message.attachments);
    const existingIndex = session.messageIndex[message.id];

    if (typeof existingIndex === "number") {
      const existing = session.messages[existingIndex];
      const reactions =
        Array.isArray(message.reactions) && message.reactions.length >= 0
          ? message.reactions
          : existing?.reactions ?? [];
      const nextMessage = {
        ...existing,
        ...message,
        reactions,
        attachments: attachments.length > 0 ? attachments : existing?.attachments ?? [],
      };
      session.messages[existingIndex] = nextMessage;
      changed = true;
    } else {
      const nextMessage = {
        ...message,
        reactions: Array.isArray(message.reactions) ? message.reactions : [],
        attachments,
      };
      session.messages = [...session.messages, nextMessage];
      session.messageIndex[nextMessage.id] = session.messages.length - 1;
      if (!options.isLocal && this.state.activeSessionId !== session.id) {
        session.unreadCount += 1;
      }
      if (session.messages.length > this.messageLimit) {
        const excess = session.messages.length - this.messageLimit;
        const trimmed = session.messages.slice(excess);
        session.messages = trimmed;
        session.messageIndex = this.buildMessageIndex(trimmed);
      }
      changed = true;
    }

    const timestamp = Date.parse(message.sentAt);
    session.lastMessageTimestamp = Number.isFinite(timestamp) ? timestamp : this.now();

    if (options.isLocal && this.state.activeSessionId === session.id) {
      session.unreadCount = 0;
    }

    if (!changed) return false;

    const sessions = { ...this.state.sessions };
    sessions[sessionId] = { ...session };
    this.state = {
      ...this.state,
      sessions,
    };

    return true;
  }

  acknowledgeMessage(sessionId: string, clientMessageId: string, payload: MessageAckPayload): boolean {
    const session = this.state.sessions[sessionId];
    if (!session) return false;
    if (!payload || typeof payload.id !== "string") return false;
    const sanitizedBody = sanitizeMessageBody(payload.body ?? "");
    const attachments = sanitizeIncomingAttachments(payload.attachments);
    if (!sanitizedBody && attachments.length === 0) return false;
    const normalizedReactions = normalizeReactions(payload.reactions, (id) => this.isSelfId(id));
    const taskId =
      typeof payload.taskId === "string" && payload.taskId.trim().length
        ? payload.taskId.trim()
        : null;
    const taskTitle =
      typeof payload.taskTitle === "string" && payload.taskTitle.trim().length
        ? payload.taskTitle.trim()
        : null;

    const baseMessage: ChatMessage = {
      id: payload.id,
      authorId: payload.authorId || payload.id,
      body: sanitizedBody,
      sentAt: payload.sentAt || new Date().toISOString(),
      status: "sent",
      reactions: normalizedReactions,
      attachments,
      taskId,
      taskTitle,
    };
    const clientIndex = session.messageIndex[clientMessageId];
    const serverIndex = session.messageIndex[baseMessage.id];
    let changed = false;

    if (typeof clientIndex === "number") {
      const existing = session.messages[clientIndex];
      const merged = existing
        ? { ...existing, ...baseMessage, reactions: normalizedReactions }
        : { ...baseMessage, reactions: normalizedReactions };
      session.messages[clientIndex] = merged;
      if (baseMessage.id !== clientMessageId) {
        delete session.messageIndex[clientMessageId];
        session.messageIndex[baseMessage.id] = clientIndex;
      }
      const timestamp = Date.parse(merged.sentAt);
      if (Number.isFinite(timestamp)) {
        session.lastMessageTimestamp = Math.max(session.lastMessageTimestamp, timestamp);
      }
      changed = true;
    } else if (typeof serverIndex === "number") {
      const existing = session.messages[serverIndex];
      const merged = existing
        ? { ...existing, ...baseMessage, reactions: normalizedReactions }
        : { ...baseMessage, reactions: normalizedReactions };
      if (
        !existing ||
        existing.id !== merged.id ||
        existing.body !== merged.body ||
        existing.sentAt !== merged.sentAt ||
        existing.status !== merged.status ||
        existing.authorId !== merged.authorId
      ) {
        session.messages[serverIndex] = merged;
        const timestamp = Date.parse(merged.sentAt);
        if (Number.isFinite(timestamp)) {
          session.lastMessageTimestamp = Math.max(session.lastMessageTimestamp, timestamp);
        }
        changed = true;
      }
    } else {
      const isLocal = this.isSelfId(baseMessage.authorId);
      return this.addMessage(sessionId, baseMessage, { isLocal });
    }

    if (!changed) return false;

    const sessions = { ...this.state.sessions };
    sessions[sessionId] = { ...session };
    this.state = {
      ...this.state,
      sessions,
    };
    return true;
  }

  markMessageStatus(sessionId: string, messageId: string, status: ChatMessage["status"]): boolean {
    const session = this.state.sessions[sessionId];
    if (!session) return false;
    const index = session.messageIndex[messageId];
    if (typeof index !== "number") return false;
    const existing = session.messages[index];
    if (!existing || existing.status === status) return false;
    session.messages[index] = { ...existing, status };

    const sessions = { ...this.state.sessions };
    sessions[sessionId] = { ...session };
    this.state = {
      ...this.state,
      sessions,
    };
    return true;
  }

  prepareLocalMessage(
    conversationId: string,
    body: string,
    options: PrepareLocalMessageOptions,
  ): PrepareLocalMessageResult | null {
    const session = this.state.sessions[conversationId];
    if (!session) return null;
    const trimmed = sanitizeMessageBody(body);
    const attachments = normalizeLocalAttachments(options.attachments);
    if (!trimmed && attachments.length === 0) return null;
    const selfIdentity = options.selfIdentity;
    if (!selfIdentity) {
      throw new Error("Chat identity is not ready yet.");
    }
    const preferredSelf = options.selfParticipant ?? null;
    if (!session.participants.some((participant) => participant.id === selfIdentity)) {
      const fallbackName = preferredSelf?.name ?? this.state.self.currentUserId ?? selfIdentity;
      session.participants = mergeParticipants(session.participants, [
        {
          id: selfIdentity,
          name: fallbackName,
          avatar: preferredSelf?.avatar ?? null,
        },
      ]);
    } else if (preferredSelf) {
      session.participants = mergeParticipants(session.participants, [preferredSelf]);
    }
    const messageId = this.createMessageId();
    const sentAt = new Date(options.now()).toISOString();
    const localMessage: ChatMessage = {
      id: messageId,
      authorId: this.state.self.currentUserId ?? selfIdentity,
      body: trimmed,
      sentAt,
      status: "pending",
      reactions: [],
      attachments,
    };
    this.addMessage(session.id, localMessage, { isLocal: true });
    return {
      message: localMessage,
      session: {
        id: session.id,
        type: session.type,
        title: session.title,
        avatar: session.avatar,
        createdBy: session.createdBy,
        participants: session.participants.map((participant) => ({ ...participant })),
      },
    };
  }

  startSession(
    descriptor: ChatSessionDescriptor,
    options?: { activate?: boolean },
  ): { created: boolean; changed: boolean } {
    const { session, created, changed } = this.ensureSession(descriptor);
    let mutated = changed;
    if (options?.activate) {
      session.unreadCount = 0;
      this.state = {
        ...this.state,
        activeSessionId: session.id,
      };
      mutated = true;
    }
    if (mutated) {
      const sessions = { ...this.state.sessions };
      sessions[session.id] = { ...session };
      this.state = {
        ...this.state,
        sessions,
      };
    }
    return { created, changed: mutated };
  }
}
