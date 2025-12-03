import type {
  ChatParticipant,
  ChatMessageEventPayload,
  ChatReactionEventPayload,
  ChatSessionDescriptor,
} from "@/lib/chat/events";

import {
  mergeParticipants,
  normalizeParticipant,
  normalizeReactions,
  participantsEqual,
  reactionsEqual,
  sanitizeIncomingAttachments,
  sanitizeMessageBody,
  typingKey,
} from "../helpers";
import type { ChatMessage, ChatTypingEventPayload } from "../types";
import { TYPING_MIN_DURATION_MS, TYPING_TTL_MS, pruneTypingEntries } from "../typing";
import { ChatMessageMachine } from "./messages";
import type { MessageDeletePayload, MessageUpdatePayload } from "./types";

export class ChatEventMachine extends ChatMessageMachine {
  applySessionEvent(descriptor: ChatSessionDescriptor): boolean {
    const effective = {
      ...descriptor,
      participants: descriptor.participants.map((participant) => ({
        id: participant.id,
        name: participant.name,
        avatar: participant.avatar ?? null,
      })),
    };
    const hasSelf = effective.participants.some((participant) => this.isSelfId(participant.id));
    if (!hasSelf) return false;
    const { created, changed } = this.ensureSession(effective);
    return created || changed;
  }

  applyMessageEvent(payload: ChatMessageEventPayload): boolean {
    if (!payload || payload.type !== "chat.message") return false;
    const { conversationId } = payload;
    if (!conversationId) return false;
    const participants = Array.isArray(payload.participants) ? payload.participants : [];
    const normalizedParticipants = participants
      .map((participant) => normalizeParticipant(participant))
      .filter((participant): participant is ChatParticipant => Boolean(participant));
    const hasSelf =
      normalizedParticipants.some((participant) => this.isSelfId(participant.id)) ||
      this.isSelfId(payload.senderId);
    if (!hasSelf) return false;
    const descriptor: ChatSessionDescriptor = {
      id: conversationId,
      type:
        payload.session?.type ??
        (normalizedParticipants.length > 2 ||
        normalizedParticipants.some((participant) => participant.id.startsWith("capsule:"))
          ? "group"
          : "direct"),
      title: payload.session?.title ?? "",
      avatar: payload.session?.avatar ?? null,
      createdBy: payload.session?.createdBy ?? null,
      participants: normalizedParticipants,
    };
    const { session, changed } = this.ensureSession(descriptor);
    let mutated = changed;

    const authorId = payload.senderId;
    const sanitizedBody = sanitizeMessageBody(payload.message.body);
    const attachments = sanitizeIncomingAttachments(payload.message.attachments);

    const message: ChatMessage = {
      id: payload.message.id,
      authorId,
      body: sanitizedBody,
      sentAt: payload.message.sentAt || new Date().toISOString(),
      status: "sent",
      reactions: normalizeReactions(
        (payload.message.reactions ?? []).map((reaction) => ({
          emoji: reaction?.emoji ?? "",
          users: Array.isArray(reaction?.users) ? reaction.users : [],
        })),
        (id) => this.isSelfId(id),
      ),
      attachments,
      taskId:
        typeof payload.message.taskId === "string" && payload.message.taskId.trim().length
          ? payload.message.taskId.trim()
          : null,
      taskTitle:
        typeof payload.message.taskTitle === "string" && payload.message.taskTitle.trim().length
          ? payload.message.taskTitle.trim()
          : null,
    };

    if (this.addMessage(session.id, message, { isLocal: false })) {
      mutated = true;
    }

    if (!mutated) return false;

    const sessions = { ...this.state.sessions };
    sessions[session.id] = { ...session };
    this.state = {
      ...this.state,
      sessions,
    };

    return true;
  }

  applyReactionEvent(payload: ChatReactionEventPayload): boolean {
    if (!payload || payload.type !== "chat.reaction") return false;
    const { conversationId, messageId } = payload;
    if (!conversationId || !messageId) return false;
    const session = this.state.sessions[conversationId];
    if (!session) return false;
    const index = session.messageIndex[messageId];
    if (typeof index !== "number") return false;
    const message = session.messages[index];
    const participants = Array.isArray(payload.participants) ? payload.participants : [];
    const normalizedParticipants = participants
      .map((participant) => normalizeParticipant(participant))
      .filter((participant): participant is ChatParticipant => Boolean(participant));
    const hasSelf =
      normalizedParticipants.some((participant) => this.isSelfId(participant.id)) ||
      this.isSelfId(payload.actor?.id) ||
      session.participants.some((participant) => this.isSelfId(participant.id));
    if (!message) return false;
    if (!hasSelf) return false;

    let mutated = false;
    if (normalizedParticipants.length > 0) {
      const merged = mergeParticipants(session.participants, normalizedParticipants);
      if (!participantsEqual(session.participants, merged)) {
        session.participants = merged;
        mutated = true;
      }
    }

    const reactions = normalizeReactions(
      payload.reactions?.map((entry) => ({
        emoji: entry?.emoji ?? "",
        users: Array.isArray(entry?.users) ? entry.users : [],
      })) ?? [],
      (id) => this.isSelfId(id),
    );
    if (!reactionsEqual(message.reactions, reactions)) {
      session.messages[index] = { ...message, reactions };
      mutated = true;
    }

    if (!mutated) return false;

    const sessions = { ...this.state.sessions };
    sessions[session.id] = { ...session };
    this.state = {
      ...this.state,
      sessions,
    };
    return true;
  }

  applyMessageUpdateEvent(
    conversationId: string,
    messageId: string,
    payload: MessageUpdatePayload,
  ): boolean {
    const session = this.state.sessions[conversationId];
    if (!session) return false;
    const hasSelf =
      (payload.participants ?? []).some((participant) => this.isSelfId(participant.id)) ||
      this.isSelfId(payload.senderId) ||
      session.participants.some((participant) => this.isSelfId(participant.id));
    if (!hasSelf) return false;

    const index = session.messageIndex[messageId];
    if (typeof index !== "number") return false;
    const message = session.messages[index];
    if (!message) return false;
    let mutated = false;

    const sanitizedBody = typeof payload.body === "string" ? sanitizeMessageBody(payload.body) : null;
    if (sanitizedBody !== null && sanitizedBody !== message.body) {
      message.body = sanitizedBody;
      mutated = true;
    }
    if (typeof payload.sentAt === "string" && payload.sentAt.length > 0) {
      message.sentAt = payload.sentAt;
      mutated = true;
    }
    const attachments = sanitizeIncomingAttachments(payload.attachments);
    if (Array.isArray(payload.attachments) && attachments.length >= 0) {
      message.attachments = attachments;
      mutated = true;
    }
    if (typeof payload.taskId === "string") {
      const taskId = payload.taskId.trim();
      const nextTaskId = taskId.length ? taskId : null;
      if (message.taskId !== nextTaskId) {
        message.taskId = nextTaskId;
        mutated = true;
      }
    }
    if (typeof payload.taskTitle === "string") {
      const taskTitle = payload.taskTitle.trim();
      const nextTaskTitle = taskTitle.length ? taskTitle : null;
      if (message.taskTitle !== nextTaskTitle) {
        message.taskTitle = nextTaskTitle;
        mutated = true;
      }
    }

    if (Array.isArray(payload.participants) && payload.participants.length > 0) {
      const participants = payload.participants.map((participant) => normalizeParticipant(participant));
      const normalizedParticipants = participants.filter(
        (participant): participant is ChatParticipant => Boolean(participant),
      );
      if (normalizedParticipants.length > 0) {
        const merged = mergeParticipants(session.participants, normalizedParticipants);
        if (!participantsEqual(session.participants, merged)) {
          session.participants = merged;
          mutated = true;
        }
      }
    }

    if (!mutated) return false;

    const timestamp = Date.parse(message.sentAt);
    if (Number.isFinite(timestamp)) {
      session.lastMessageTimestamp = Math.max(session.lastMessageTimestamp, timestamp);
    }

    const sessions = { ...this.state.sessions };
    sessions[session.id] = { ...session, messages: [...session.messages] };
    this.state = {
      ...this.state,
      sessions,
    };
    return true;
  }

  applyMessageDeleteEvent(
    conversationId: string,
    messageId: string,
    payload: MessageDeletePayload,
  ): boolean {
    const session = this.state.sessions[conversationId];
    if (!session) return false;
    const hasSelf =
      (payload.participants ?? []).some((participant) => this.isSelfId(participant.id)) ||
      session.participants.some((participant) => this.isSelfId(participant.id));
    if (!hasSelf) return false;

    const index = session.messageIndex[messageId];
    if (typeof index !== "number") return false;
    const messages = session.messages.filter((message) => message.id !== messageId);
    const messageIndex = this.buildMessageIndex(messages);
    const unreadCount = Math.max(0, session.unreadCount - 1);
    session.messages = messages;
    session.messageIndex = messageIndex;
    session.unreadCount = unreadCount;

    const sessions = { ...this.state.sessions };
    sessions[session.id] = { ...session };
    this.state = {
      ...this.state,
      sessions,
    };
    return true;
  }

  resetUnread(sessionId: string): boolean {
    const session = this.state.sessions[sessionId];
    if (!session) return false;
    if (session.unreadCount === 0) return false;
    session.unreadCount = 0;
    const sessions = { ...this.state.sessions };
    sessions[session.id] = { ...session };
    this.state = {
      ...this.state,
      sessions,
    };
    return true;
  }

  applyTypingEvent(payload: ChatTypingEventPayload): boolean {
    if (!payload || payload.type !== "chat.typing") return false;
    const { conversationId } = payload;
    if (!conversationId) return false;
    let session = this.state.sessions[conversationId];
    const participants = Array.isArray(payload.participants) ? payload.participants : [];
    const normalizedParticipants = participants
      .map((participant) => normalizeParticipant(participant))
      .filter((participant): participant is ChatParticipant => Boolean(participant));
    if (!session) {
      const descriptor: ChatSessionDescriptor = {
        id: conversationId,
        type: normalizedParticipants.length > 2 ? "group" : "direct",
        title: "",
        avatar: null,
        createdBy: null,
        participants: normalizedParticipants,
      };
      session = this.ensureSession(descriptor).session;
    }
    const hasSelf =
      normalizedParticipants.some((participant) => this.isSelfId(participant.id)) ||
      this.isSelfId(payload.senderId) ||
      session.participants.some((participant) => this.isSelfId(participant.id));
    if (!hasSelf) return false;

    const senderParticipant = normalizeParticipant({
      id: payload.senderId ?? payload.sender?.id ?? null,
      name: payload.sender?.name ?? payload.senderId,
      avatar: payload.sender?.avatar ?? null,
    });
    if (!senderParticipant) return false;
    const senderKey = typingKey(senderParticipant.id);
    if (!senderKey) return false;
    const participantsForSession = normalizedParticipants.filter((participant) => {
      const key = typingKey(participant.id);
      return key !== null && key !== senderKey;
    });
    if (!participantsForSession.some((participant) => typingKey(participant.id) === senderKey)) {
      participantsForSession.push(senderParticipant);
    }

    const participantsChanged = this.upsertParticipants(conversationId, participantsForSession);

    const now = this.now();
    const expiresAtIso =
      typeof payload.expiresAt === "string" ? Date.parse(payload.expiresAt) : Number.NaN;
    const expiresAt =
      Number.isFinite(expiresAtIso) && expiresAtIso > now
        ? Math.max(expiresAtIso, now + TYPING_MIN_DURATION_MS)
        : now + TYPING_TTL_MS;

    const typing = { ...session.typing };
    const selfSender = this.isSelfId(senderParticipant.id);
    let changed = participantsChanged;

    if (payload.typing && !selfSender) {
      const existing = typing[senderKey];
      const existingExpires = existing?.expiresAt ?? 0;
      const existingName = existing?.participant?.name ?? null;
      typing[senderKey] = { participant: senderParticipant, expiresAt };
      if (!existing || existingExpires !== expiresAt || existingName !== senderParticipant.name) {
        changed = true;
      }
    } else {
      if (typing[senderKey]) {
        delete typing[senderKey];
        changed = true;
      }
    }

    const pruned = pruneTypingEntries(typing, now);
    const finalTyping = pruned.typing;
    if (pruned.changed) {
      changed = true;
    }

    session.typing = finalTyping;
    const sessions = { ...this.state.sessions, [conversationId]: { ...session } };
    this.state = {
      ...this.state,
      sessions,
    };
    return changed;
  }
}
