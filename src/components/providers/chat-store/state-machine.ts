import type {
  ChatMessageEventPayload,
  ChatMessageUpdatedEventPayload,
  ChatParticipant,
  ChatReactionEventPayload,
  ChatSessionDescriptor,
  ChatSessionType,
} from "@/lib/chat/events";
import { isGroupConversationId } from "@/lib/chat/channels";

import type { ChatTypingEventPayload } from "@/components/providers/chat-store/types";
import type { FriendItem } from "@/hooks/useFriendsData";
import type {
  ChatMessage,
  ChatMessageAttachment,
  ChatSession,
  StoredMessage,
  StoredState,
} from "@/components/providers/chat-store/types";
import {
  canonicalParticipantKey,
  computeDefaultTitle,
  hydrateMessageAttachments,
  isLegacyStoredSession,
  isValidStoredSession,
  mergeParticipants,
  normalizeLocalAttachments,
  normalizeParticipant,
  normalizeReactions,
  participantsEqual,
  persistMessageAttachments,
  reactionsEqual,
  sanitizeIncomingAttachments,
  sanitizeMessageBody,
  sanitizeSessionDescriptor,
  sanitizeStoredAttachments,
  typingKey,
} from "@/components/providers/chat-store/helpers";
import type { TypingState } from "@/components/providers/chat-store/typing";
import {
  collectTypingSnapshot,
  pruneTypingEntries,
  TYPING_MIN_DURATION_MS,
  TYPING_TTL_MS,
} from "@/components/providers/chat-store/typing";

export const DEFAULT_MESSAGE_LIMIT = 100;

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

type MessageAckPayload = {
  id: string;
  authorId: string;
  body: string;
  sentAt: string;
  reactions?: Array<{ emoji: string; users?: ChatParticipant[] }>;
  attachments?: ChatMessageEventPayload["message"]["attachments"];
  taskId?: string | null;
  taskTitle?: string | null;
};

type MessageUpdatePayload = {
  senderId?: string | null;
  body?: string | null;
  sentAt?: string | null;
  attachments?: ChatMessageUpdatedEventPayload["attachments"];
  participants?: ChatParticipant[];
  taskId?: string | null;
  taskTitle?: string | null;
};

type MessageDeletePayload = {
  participants?: ChatParticipant[];
};

type SelfParticipantOptions = {
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

function looksLikeParticipantIdentifier(value: string | null | undefined): boolean {
  if (typeof value !== "string") return false;
  const trimmed = value.trim();
  if (!trimmed) return false;
  if (/^[0-9a-f-]{24,}$/i.test(trimmed)) {
    return true;
  }
  return (
    trimmed.startsWith("user_") ||
    trimmed.startsWith("clerk_") ||
    trimmed.startsWith("capsule:") ||
    trimmed.startsWith("urn:")
  );
}

export class ChatStateMachine {
  private state: ChatState;
  private readonly messageLimit: number;
  private readonly now: () => number;
  private readonly createMessageId: () => string;
  private friendDirectory = new Map<string, FriendItem>();

  constructor(options?: {
    now?: () => number;
    messageLimit?: number;
    createMessageId?: () => string;
  }) {
    this.messageLimit = options?.messageLimit ?? DEFAULT_MESSAGE_LIMIT;
    this.now = options?.now ?? Date.now;
    this.createMessageId = options?.createMessageId ?? this.defaultMessageIdFactory;
    this.state = {
      sessions: {},
      activeSessionId: null,
      hydrated: false,
      self: {
        currentUserId: null,
        selfClientId: null,
        aliases: [],
      },
    };
  }

  getState(): ChatState {
    return this.state;
  }

  replaceState(next: ChatState) {
    this.state = {
      ...next,
      sessions: { ...next.sessions },
      self: {
        currentUserId: next.self.currentUserId,
        selfClientId: next.self.selfClientId,
        aliases: [...next.self.aliases],
      },
    };
  }

  setHydrated(): void {
    this.state = { ...this.state, hydrated: true };
  }

  isHydrated(): boolean {
    return this.state.hydrated;
  }

  setCurrentUserId(userId: string | null): boolean {
    const normalized = typeof userId === "string" ? userId.trim() : "";
    const nextId = normalized.length > 0 ? normalized : null;
    if (this.state.self.currentUserId === nextId) return false;
    this.state = {
      ...this.state,
      self: {
        ...this.state.self,
        currentUserId: nextId,
        aliases: this.registerAliasList(this.state.self.aliases, nextId),
      },
    };
    return true;
  }

  setSelfClientId(clientId: string | null): boolean {
    const normalized = typeof clientId === "string" ? clientId.trim() : "";
    const nextId = normalized.length > 0 ? normalized : null;
    if (this.state.self.selfClientId === nextId) return false;
    this.state = {
      ...this.state,
      self: {
        ...this.state.self,
        selfClientId: nextId,
        aliases: this.registerAliasList(this.state.self.aliases, nextId),
      },
    };
    return true;
  }

  applySelfParticipant(options: SelfParticipantOptions): boolean {
    const normalizedSelf = normalizeParticipant(options.participant);
    if (!normalizedSelf) return false;
    const aliasSet = new Set<string>();
    const addAlias = (value: string | null | undefined) => {
      if (!value || typeof value !== "string") return;
      const trimmed = value.trim();
      if (!trimmed) return;
      aliasSet.add(trimmed);
      const canonical = canonicalParticipantKey(trimmed);
      if (canonical) aliasSet.add(canonical);
    };
    addAlias(normalizedSelf.id);
    options.aliases.forEach((alias) => addAlias(alias));

    const nextAliases = Array.from(
      new Set(this.registerAliasSet(this.state.self.aliases, Array.from(aliasSet))),
    );

    const sessions = { ...this.state.sessions };
    let mutated = false;
    Object.values(sessions).forEach((session) => {
      const participants = session.participants.map((existing) => {
        const existingKey = canonicalParticipantKey(existing.id);
        if (aliasSet.has(existing.id) || (existingKey && aliasSet.has(existingKey))) {
          return { ...normalizedSelf };
        }
        return existing;
      });
      if (!participants.some((entry) => entry.id === normalizedSelf.id)) {
        participants.push({ ...normalizedSelf });
      }
      const merged = mergeParticipants(participants);
      if (!participantsEqual(session.participants, merged)) {
        session.participants = merged;
        mutated = true;
      }

      let messageChanged = false;
      session.messages.forEach((message, index) => {
        const author = typeof message.authorId === "string" ? message.authorId.trim() : "";
        if (!author) return;
        const canonicalAuthor = canonicalParticipantKey(author);
        if (aliasSet.has(author) || (canonicalAuthor && aliasSet.has(canonicalAuthor))) {
          if (message.authorId !== normalizedSelf.id) {
            session.messages[index] = { ...message, authorId: normalizedSelf.id };
            messageChanged = true;
          }
        }
      });
      if (messageChanged) {
        session.messageIndex = this.buildMessageIndex(session.messages);
        mutated = true;
      }
      if (session.createdBy) {
        const creator = session.createdBy.trim();
        const canonicalCreator = canonicalParticipantKey(creator);
        if (
          (creator && aliasSet.has(creator) && session.createdBy !== normalizedSelf.id) ||
          (canonicalCreator && aliasSet.has(canonicalCreator) && session.createdBy !== normalizedSelf.id)
        ) {
          session.createdBy = normalizedSelf.id;
          mutated = true;
        }
      }
    });

    if (!mutated && nextAliases.length === this.state.self.aliases.length) {
      return false;
    }

    this.state = {
      ...this.state,
      sessions,
      self: {
        ...this.state.self,
        aliases: nextAliases,
      },
    };

    return true;
  }

  getCurrentUserId(): string | null {
    return this.state.self.currentUserId;
  }

  getSelfClientId(): string | null {
    return this.state.self.selfClientId;
  }

  getSelfIds(): Set<string> {
    const set = new Set<string>(this.state.self.aliases);
    if (this.state.self.currentUserId) set.add(this.state.self.currentUserId);
    if (this.state.self.selfClientId) set.add(this.state.self.selfClientId);
    return set;
  }

  ensureSession(descriptor: ChatSessionDescriptor): SessionEnsureResult {
    const sanitized = this.sanitizeDescriptor(descriptor);
    const sessions = { ...this.state.sessions };
    let session = sessions[sanitized.id];
    let created = false;
    let changed = false;
    if (!session) {
      session = {
        id: sanitized.id,
        type: sanitized.type,
        title: sanitized.title,
        avatar: sanitized.avatar,
        createdBy: sanitized.createdBy,
        participants: sanitized.participants,
        messages: [],
        messageIndex: {},
        lastMessageTimestamp: 0,
        unreadCount: 0,
        typing: {},
      };
      sessions[session.id] = session;
      created = true;
      changed = true;
    } else {
      if (
        session.type !== sanitized.type ||
        session.title !== sanitized.title ||
        session.avatar !== sanitized.avatar ||
        session.createdBy !== sanitized.createdBy
      ) {
        session.type = sanitized.type;
        session.title = sanitized.title;
        session.avatar = sanitized.avatar;
        session.createdBy = sanitized.createdBy;
        changed = true;
      }

      const mergedParticipants = mergeParticipants(session.participants, sanitized.participants);
      if (!participantsEqual(session.participants, mergedParticipants)) {
        session.participants = mergedParticipants;
        changed = true;
      }

      if (!session.typing) {
        session.typing = {};
      }
    }

    if (created || changed) {
      this.state = {
        ...this.state,
        sessions,
      };
    }

    return { session: session!, created, changed };
  }

  setActiveSession(sessionId: string | null): boolean {
    if (this.state.activeSessionId === sessionId) return false;
    const sessions = { ...this.state.sessions };
    if (sessionId && sessions[sessionId]) {
      sessions[sessionId] = { ...sessions[sessionId], unreadCount: 0 };
    }
    this.state = {
      ...this.state,
      sessions,
      activeSessionId: sessionId,
    };
    return true;
  }

  deleteSession(sessionId: string): boolean {
    if (!this.state.sessions[sessionId]) return false;
    const sessions = { ...this.state.sessions };
    delete sessions[sessionId];
    const activeSessionId =
      this.state.activeSessionId === sessionId ? null : this.state.activeSessionId;
    this.state = {
      ...this.state,
      sessions,
      activeSessionId,
    };
    return true;
  }

  remapSessionId(oldId: string, newId: string): boolean {
    const sourceId = typeof oldId === "string" ? oldId.trim() : "";
    const targetId = typeof newId === "string" ? newId.trim() : "";
    if (!sourceId || !targetId || sourceId === targetId) return false;

    const sessions = { ...this.state.sessions };
    const sourceSession = sessions[sourceId];
    if (!sourceSession) return false;

    const resolveMessage = (existing: ChatMessage | undefined, incoming: ChatMessage): ChatMessage => {
      if (!existing) return { ...incoming };
      if (existing.status === "sent") return existing;
      if (incoming.status === "sent") return { ...incoming };
      if (existing.status === "failed" && incoming.status === "pending") return { ...incoming };
      return existing;
    };

    const accumulateMessages = (base: Map<string, ChatMessage>, messages: ChatMessage[]) => {
      messages.forEach((message) => {
        const current = base.get(message.id);
        base.set(message.id, resolveMessage(current, message));
      });
    };

    let targetSession = sessions[targetId];
    if (!targetSession || targetSession === sourceSession) {
      delete sessions[sourceId];
      sourceSession.id = targetId;
      sessions[targetId] = sourceSession;
      targetSession = sourceSession;
    } else {
      const participantMerge = mergeParticipants(
        targetSession.participants,
        sourceSession.participants,
      );
      targetSession.participants = participantMerge;

      const messageMap = new Map<string, ChatMessage>();
      accumulateMessages(messageMap, targetSession.messages);
      accumulateMessages(messageMap, sourceSession.messages);

      const mergedMessages = Array.from(messageMap.values()).sort((a, b) => {
        const leftTs = Date.parse(a.sentAt);
        const rightTs = Date.parse(b.sentAt);
        if (Number.isFinite(leftTs) && Number.isFinite(rightTs)) {
          return leftTs - rightTs;
        }
        if (Number.isFinite(leftTs)) return -1;
        if (Number.isFinite(rightTs)) return 1;
        return a.sentAt.localeCompare(b.sentAt);
      });

      targetSession.messages = mergedMessages;
      targetSession.messageIndex = this.buildMessageIndex(mergedMessages);
      targetSession.lastMessageTimestamp = mergedMessages.reduce((latest, message) => {
        const ts = Date.parse(message.sentAt);
        return Number.isFinite(ts) ? Math.max(latest, ts) : latest;
      }, Math.max(targetSession.lastMessageTimestamp, sourceSession.lastMessageTimestamp));
      targetSession.unreadCount = Math.max(targetSession.unreadCount, sourceSession.unreadCount);
      if (!targetSession.createdBy && sourceSession.createdBy) {
        targetSession.createdBy = sourceSession.createdBy;
      }
      if (!targetSession.title && sourceSession.title) {
        targetSession.title = sourceSession.title;
      }
      if (!targetSession.avatar && sourceSession.avatar) {
        targetSession.avatar = sourceSession.avatar;
      }
      delete sessions[sourceId];
    }

    const activeSessionId =
      this.state.activeSessionId === sourceId ? targetId : this.state.activeSessionId;

    this.state = {
      ...this.state,
      sessions,
      activeSessionId,
    };
    return true;
  }

  upsertParticipants(sessionId: string, participants: ChatParticipant[]): boolean {
    const session = this.state.sessions[sessionId];
    if (!session) return false;
    const enriched = participants.map((participant) => this.enrichParticipant(participant));
    const merged = mergeParticipants(session.participants, enriched);
    if (participantsEqual(session.participants, merged)) {
      return false;
    }
    const sessions = { ...this.state.sessions };
    sessions[sessionId] = { ...session, participants: merged };
    this.state = {
      ...this.state,
      sessions,
    };
    return true;
  }

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
        (payload.session?.type === "group" && normalizedParticipants.length > 0)
          ? "group"
          : "direct"),
      title: payload.session?.title ?? "",
      avatar: payload.session?.avatar ?? null,
      createdBy:
        payload.session?.createdBy ?? (payload.session?.type === "group" ? payload.senderId : null),
      participants: normalizedParticipants,
    };

    const { session } = this.ensureSession(descriptor);
    if (
      !payload.message ||
      typeof payload.message.id !== "string" ||
      typeof payload.message.body !== "string"
    ) {
      return false;
    }

    const messageBody = sanitizeMessageBody(payload.message.body);
    const attachments = sanitizeIncomingAttachments(payload.message.attachments);
    if (!messageBody && attachments.length === 0) return false;
    const authorId = payload.senderId || payload.message.id;
    const reactions = normalizeReactions(
      Array.isArray(payload.message.reactions)
        ? payload.message.reactions.map((reaction) => ({
            emoji: reaction.emoji,
            users: reaction.users ?? [],
          }))
        : undefined,
      (id) => this.isSelfId(id),
    );
    const taskId =
      typeof payload.message.taskId === "string" && payload.message.taskId.trim().length
        ? payload.message.taskId.trim()
        : null;
    const taskTitle =
      typeof payload.message.taskTitle === "string" && payload.message.taskTitle.trim().length
        ? payload.message.taskTitle.trim()
        : null;
    const chatMessage: ChatMessage = {
      id: payload.message.id,
      authorId,
      body: messageBody,
      sentAt: payload.message.sentAt ?? new Date().toISOString(),
      status: "sent",
      reactions,
      attachments,
      taskId,
      taskTitle,
    };
    const isLocal = this.isSelfId(authorId);
    return this.addMessage(session.id, chatMessage, { isLocal });
  }

  applyReactionEvent(payload: ChatReactionEventPayload): boolean {
    if (!payload || payload.type !== "chat.reaction") return false;
    const conversationId =
      typeof payload.conversationId === "string" ? payload.conversationId.trim() : "";
    const messageId = typeof payload.messageId === "string" ? payload.messageId.trim() : "";
    if (!conversationId || !messageId) return false;
    let session = this.state.sessions[conversationId];
    if (!session) return false;
    let participantsChanged = false;
    const participantUpdates: ChatParticipant[] = [];
    if (payload.actor) {
      const normalizedActor = normalizeParticipant(payload.actor);
      if (normalizedActor) {
        participantUpdates.push(normalizedActor);
      }
    }
    if (Array.isArray(payload.participants) && payload.participants.length > 0) {
      participantUpdates.push(...payload.participants);
    }
    if (participantUpdates.length > 0) {
      participantsChanged = this.upsertParticipants(conversationId, participantUpdates);
      session = this.state.sessions[conversationId] ?? session;
    }
    const messageIndex = session.messageIndex[messageId];
    if (typeof messageIndex !== "number") return participantsChanged;
    const existing = session.messages[messageIndex];
    if (!existing) return participantsChanged;
    const reactions = normalizeReactions(
      Array.isArray(payload.reactions)
        ? payload.reactions.map((reaction) => ({
            emoji: reaction.emoji,
            users: reaction.users ?? [],
          }))
        : undefined,
      (id) => this.isSelfId(id),
    );
    if (reactionsEqual(existing.reactions, reactions)) return participantsChanged;
    session.messages[messageIndex] = { ...existing, reactions };

    const sessions = { ...this.state.sessions };
    sessions[conversationId] = { ...session };
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
    let session = this.state.sessions[conversationId];
    if (!session) return false;
    if (Array.isArray(payload.participants) && payload.participants.length > 0) {
      this.upsertParticipants(conversationId, payload.participants);
      session = this.state.sessions[conversationId] ?? session;
    }
    const attachments = sanitizeIncomingAttachments(payload.attachments);
    const sanitizedBody = sanitizeMessageBody(payload.body ?? "");
    const sentAt =
      typeof payload.sentAt === "string" && payload.sentAt.trim().length
        ? payload.sentAt.trim()
        : undefined;
    const hasTaskId = Object.prototype.hasOwnProperty.call(payload, "taskId");
    const hasTaskTitle = Object.prototype.hasOwnProperty.call(payload, "taskTitle");
    const taskId =
      typeof payload.taskId === "string" && payload.taskId.trim().length
        ? payload.taskId.trim()
        : null;
    const taskTitle =
      typeof payload.taskTitle === "string" && payload.taskTitle.trim().length
        ? payload.taskTitle.trim()
        : null;
    const messageIndex = session.messageIndex[messageId];
    if (typeof messageIndex !== "number") {
      const authorId =
        typeof payload.senderId === "string" && payload.senderId.trim().length
          ? payload.senderId.trim()
          : messageId;
      const message: ChatMessage = {
        id: messageId,
        authorId,
        body: sanitizedBody,
        sentAt: sentAt ?? new Date().toISOString(),
        status: "sent",
        reactions: [],
        attachments,
        taskId: hasTaskId ? taskId : null,
        taskTitle: hasTaskTitle ? taskTitle : null,
      };
      return this.addMessage(conversationId, message, { isLocal: false });
    }
    const existing = session.messages[messageIndex];
    if (!existing) return false;
    const updatedMessage: ChatMessage = {
      ...existing,
      body: sanitizedBody.length > 0 ? sanitizedBody : existing.body,
      attachments,
      sentAt: sentAt ?? existing.sentAt,
      taskId: hasTaskId ? taskId : existing.taskId ?? null,
      taskTitle: hasTaskTitle ? taskTitle : existing.taskTitle ?? null,
    };
    session.messages[messageIndex] = updatedMessage;
    session.messageIndex[updatedMessage.id] = messageIndex;
    const timestamp = Date.parse(updatedMessage.sentAt);
    if (Number.isFinite(timestamp)) {
      session.lastMessageTimestamp = Math.max(session.lastMessageTimestamp, timestamp);
    }
    const sessions = { ...this.state.sessions };
    sessions[conversationId] = { ...session };
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
    let session = this.state.sessions[conversationId];
    if (!session) return false;
    if (Array.isArray(payload.participants) && payload.participants.length > 0) {
      this.upsertParticipants(conversationId, payload.participants);
      session = this.state.sessions[conversationId] ?? session;
    }
    const messageIndex = session.messageIndex[messageId];
    if (typeof messageIndex !== "number") return false;
    const nextMessages = session.messages.slice();
    nextMessages.splice(messageIndex, 1);
    const nextIndex = this.buildMessageIndex(nextMessages);
    const lastMessage = nextMessages[nextMessages.length - 1] ?? null;
    const nextSession: ChatSessionState = {
      ...session,
      messages: nextMessages,
      messageIndex: nextIndex,
      lastMessageTimestamp: lastMessage ? Date.parse(lastMessage.sentAt) || 0 : 0,
    };
    const sessions = { ...this.state.sessions, [conversationId]: nextSession };
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
    const sessions = { ...this.state.sessions };
    sessions[sessionId] = { ...session, unreadCount: 0 };
    this.state = {
      ...this.state,
      sessions,
    };
    return true;
  }

  applyTypingEvent(payload: ChatTypingEventPayload): boolean {
    if (!payload || payload.type !== "chat.typing") return false;
    const conversationId =
      typeof payload.conversationId === "string" ? payload.conversationId.trim() : "";
    if (!conversationId) return false;

    const { session } = this.ensureSession({
      id: conversationId,
      type: isGroupConversationId(conversationId) ? "group" : "direct",
      title: "",
      avatar: null,
      createdBy: null,
      participants: [],
    });
    if (!session.typing) {
      session.typing = {};
    }

    const senderIdRaw = typeof payload.senderId === "string" ? payload.senderId.trim() : "";
    if (!senderIdRaw) return false;
    const senderKey = typingKey(senderIdRaw);
    if (!senderKey) return false;

    const normalizedParticipants = Array.isArray(payload.participants)
      ? mergeParticipants(
          payload.participants
            .map((participant) => normalizeParticipant(participant))
            .filter((participant): participant is ChatParticipant => Boolean(participant)),
        )
      : [];

    const participantsForSession = normalizedParticipants.map((participant) =>
      this.enrichParticipant(participant),
    );

    let senderParticipant: ChatParticipant | null = null;
    const inferredFromPayload =
      payload.sender && typeof payload.sender === "object"
        ? normalizeParticipant({
            id: (payload.sender.id ?? payload.senderId ?? senderIdRaw) as string,
            name: (payload.sender as ChatParticipant | undefined)?.name ?? senderIdRaw,
            avatar: (payload.sender as ChatParticipant | undefined)?.avatar ?? null,
          } as ChatParticipant)
        : null;

    if (inferredFromPayload) {
      senderParticipant = inferredFromPayload;
    }

    if (!senderParticipant) {
      senderParticipant =
        participantsForSession.find((participant) => typingKey(participant.id) === senderKey) ?? null;
    }

    if (!senderParticipant) {
      senderParticipant = {
        id: senderIdRaw,
        name: senderIdRaw,
        avatar: null,
      };
    }

    if (!participantsForSession.some((participant) => typingKey(participant.id) === senderKey)) {
      participantsForSession.push(senderParticipant);
    }

    this.upsertParticipants(conversationId, participantsForSession);

    const now = this.now();
    const expiresAtIso =
      typeof payload.expiresAt === "string" ? Date.parse(payload.expiresAt) : Number.NaN;
    const expiresAt =
      Number.isFinite(expiresAtIso) && expiresAtIso > now
        ? Math.max(expiresAtIso, now + TYPING_MIN_DURATION_MS)
        : now + TYPING_TTL_MS;

    const typing = { ...session.typing };
    const selfSender = this.isSelfId(senderParticipant.id);
    let changed = false;

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

  updateFromFriends(friends: FriendItem[]): boolean {
    const normalized = Array.isArray(friends) ? friends : [];
    const directory = new Map<string, FriendItem>();
    normalized.forEach((friend) => {
      this.registerFriendLookup(directory, friend.userId, friend);
      this.registerFriendLookup(directory, friend.key, friend);
    });
    this.friendDirectory = directory;
    if (normalized.length === 0) return false;
    const selfIds = this.getSelfIds();
    const sessions = { ...this.state.sessions };
    let changed = false;
    Object.values(sessions).forEach((session) => {
      const updatedParticipants = session.participants.map((participant) =>
        this.enrichParticipant(participant),
      );
      const mergedParticipants = mergeParticipants(updatedParticipants);
      if (!participantsEqual(session.participants, mergedParticipants)) {
        session.participants = mergedParticipants;
        changed = true;
      }
      if (session.type === "direct") {
        const nextTitle = computeDefaultTitle(session.participants, selfIds, "direct");
        if (session.title !== nextTitle) {
          session.title = nextTitle;
          changed = true;
        }
      }
    });
    if (!changed) return false;
    this.state = {
      ...this.state,
      sessions,
    };
    return true;
  }

  refreshSessionTitles(): boolean {
    const selfIds = this.getSelfIds();
    const sessions = { ...this.state.sessions };
    let changed = false;
    Object.values(sessions).forEach((session) => {
      if (session.type === "direct") {
        const nextTitle = computeDefaultTitle(session.participants, selfIds, "direct");
        if (session.title !== nextTitle) {
          session.title = nextTitle;
          changed = true;
        }
      }
    });
    if (!changed) return false;
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

  toStoredState(): StoredState {
    const sessions = Object.values(this.state.sessions).map((session) => ({
      id: session.id,
      type: session.type,
      title: session.title,
      avatar: session.avatar,
      createdBy: session.createdBy ?? null,
      participants: session.participants.map((participant) => ({
        id: participant.id,
        name: participant.name,
        avatar: participant.avatar,
      })),
      messages: session.messages.slice(-this.messageLimit).map((message) => {
        const storedMessage: StoredMessage = {
          id: message.id,
          authorId: message.authorId,
          body: message.body,
          sentAt: message.sentAt,
        };
        if (message.reactions.length > 0) {
          storedMessage.reactions = message.reactions.map((reaction) => ({
            emoji: reaction.emoji,
            users: reaction.users.map((user) => ({
              id: user.id,
              name: user.name,
              avatar: user.avatar,
            })),
          }));
        }
        const persistedAttachments = persistMessageAttachments(message.attachments);
        if (persistedAttachments && persistedAttachments.length > 0) {
          storedMessage.attachments = persistedAttachments;
        }
        if (message.taskId) {
          const trimmedId = message.taskId.trim();
          if (trimmedId) {
            storedMessage.taskId = trimmedId;
          }
        }
        if (message.taskTitle) {
          const trimmedTitle = message.taskTitle.trim();
          if (trimmedTitle) {
            storedMessage.taskTitle = trimmedTitle;
          }
        }
        return storedMessage;
      }),
    }));
    return {
      activeSessionId: this.state.activeSessionId,
      sessions,
    };
  }

  hydrate(stored: StoredState): void {
    const sessions: Record<string, ChatSessionState> = {};
    stored.sessions.forEach((entry) => {
      let descriptor: ChatSessionDescriptor | null = null;
      if (isValidStoredSession(entry)) {
        const participants = entry.participants
          .map((participant) => normalizeParticipant(participant))
          .filter((participant): participant is ChatParticipant => Boolean(participant));
        descriptor = {
          id: entry.id,
          type: entry.type,
          title: entry.title,
          avatar: entry.avatar ?? null,
          createdBy: entry.createdBy ?? null,
          participants,
        };
      } else if (isLegacyStoredSession(entry)) {
        const participant = normalizeParticipant({
          id: entry.friendUserId,
          name: entry.friendName,
          avatar: entry.friendAvatar ?? null,
        });
        if (participant) {
          descriptor = {
            id: entry.id,
            type: "direct",
            title: entry.friendName,
            avatar: entry.friendAvatar ?? null,
            createdBy: null,
            participants: [participant],
          };
        }
      }
      if (!descriptor) return;
      const sanitized = this.sanitizeDescriptor(descriptor);
      const session: ChatSessionState = {
        id: sanitized.id,
        type: sanitized.type,
        title: sanitized.title,
        avatar: sanitized.avatar,
        createdBy: sanitized.createdBy,
        participants: sanitized.participants,
        messages: [],
        messageIndex: {},
        lastMessageTimestamp: 0,
        unreadCount: 0,
        typing: {},
      };
      entry.messages.slice(-this.messageLimit).forEach((storedMessage) => {
        if (
          storedMessage &&
          typeof storedMessage.id === "string" &&
          typeof storedMessage.authorId === "string" &&
          typeof storedMessage.body === "string" &&
          typeof storedMessage.sentAt === "string"
        ) {
          const reactionDescriptors =
            Array.isArray(storedMessage.reactions) && storedMessage.reactions.length > 0
              ? storedMessage.reactions.map((reaction) => ({
                  emoji: typeof reaction?.emoji === "string" ? reaction.emoji : "",
                  users: Array.isArray(reaction?.users) ? reaction.users : [],
                }))
              : [];
          const reactions = normalizeReactions(reactionDescriptors, (id) => this.isSelfId(id));
          const taskId =
            typeof storedMessage.taskId === "string" && storedMessage.taskId.trim().length
              ? storedMessage.taskId.trim()
              : null;
          const taskTitle =
            typeof storedMessage.taskTitle === "string" && storedMessage.taskTitle.trim().length
              ? storedMessage.taskTitle.trim()
              : null;
          const restoredMessage: ChatMessage = {
            id: storedMessage.id,
            authorId: storedMessage.authorId,
            body: storedMessage.body,
            sentAt: storedMessage.sentAt,
            status: "sent",
            reactions,
            attachments: hydrateMessageAttachments(
              sanitizeStoredAttachments(storedMessage.attachments),
            ),
            taskId,
            taskTitle,
          };
          session.messages.push(restoredMessage);
          session.messageIndex[restoredMessage.id] = session.messages.length - 1;
          const ts = Date.parse(restoredMessage.sentAt);
          if (Number.isFinite(ts)) {
            session.lastMessageTimestamp = ts;
          }
        }
      });
      sessions[session.id] = session;
    });
    this.state = {
      ...this.state,
      sessions,
      activeSessionId: typeof stored.activeSessionId === "string" ? stored.activeSessionId : null,
    };
  }

  buildSnapshot(now: number = this.now()): {
    sessions: ChatSession[];
    activeSessionId: string | null;
    activeSession: ChatSession | null;
    unreadCount: number;
  } {
    const selfIds = this.getSelfIds();
    const entries: Array<{ order: number; session: ChatSession }> = [];
    Object.values(this.state.sessions).forEach((session) => {
      const typingSnapshot = collectTypingSnapshot(session.typing ?? {}, now, { selfIds });
      const messages = session.messages.map((message) => ({ ...message }));
      const lastMessage = messages[messages.length - 1] ?? null;
      entries.push({
        order:
          session.lastMessageTimestamp || (lastMessage ? Date.parse(lastMessage.sentAt) : 0) || 0,
        session: {
          id: session.id,
          type: session.type,
          title: session.title,
          avatar: session.avatar,
          createdBy: session.createdBy,
          participants: session.participants.map((participant) => ({ ...participant })),
          messages,
          unreadCount: session.unreadCount,
          lastMessageAt: lastMessage?.sentAt ?? null,
          lastMessagePreview:
            (lastMessage?.body && lastMessage.body.trim().length ? lastMessage.body : "") ||
            (lastMessage &&
            Array.isArray(lastMessage.attachments) &&
            lastMessage.attachments.length
              ? lastMessage.attachments.length === 1
                ? `Attachment: ${lastMessage.attachments[0]?.name ?? "Attachment"}`
                : `Attachments (${lastMessage.attachments.length})`
              : null),
          typing: typingSnapshot.participants,
        },
      });
      if (typingSnapshot.changed) {
        session.typing = typingSnapshot.typing;
      }
    });

    entries.sort((a, b) => b.order - a.order);
    const sessions = entries.map((entry) => entry.session);
    const activeSession = this.state.activeSessionId
      ? sessions.find((session) => session.id === this.state.activeSessionId) ?? null
      : null;
    const unreadCount = sessions.reduce((total, session) => total + session.unreadCount, 0);
    return {
      sessions,
      activeSessionId: this.state.activeSessionId,
      activeSession,
      unreadCount,
    };
  }

  pruneTyping(now: number = this.now()): boolean {
    const sessions = { ...this.state.sessions };
    let changed = false;
    Object.entries(sessions).forEach(([id, session]) => {
      const snapshot = pruneTypingEntries(session.typing ?? {}, now);
      if (snapshot.changed) {
        sessions[id] = {
          ...session,
          typing: snapshot.typing,
        };
        changed = true;
      }
    });
    if (!changed) return false;
    this.state = {
      ...this.state,
      sessions,
    };
    return true;
  }

  private registerFriendLookup(directory: Map<string, FriendItem>, value: string | null | undefined, friend: FriendItem): void {
    if (typeof value !== "string") return;
    const trimmed = value.trim();
    if (!trimmed) return;
    directory.set(trimmed.toLowerCase(), friend);
    const canonical = canonicalParticipantKey(trimmed);
    if (canonical) {
      directory.set(canonical.toLowerCase(), friend);
    }
  }

  private findFriendProfile(identifier: string | null | undefined): FriendItem | null {
    if (typeof identifier !== "string") return null;
    const trimmed = identifier.trim();
    if (!trimmed) return null;
    const direct = this.friendDirectory.get(trimmed.toLowerCase());
    if (direct) return direct;
    const canonical = canonicalParticipantKey(trimmed);
    if (canonical) {
      return this.friendDirectory.get(canonical.toLowerCase()) ?? null;
    }
    return null;
  }

  private enrichParticipant(participant: ChatParticipant): ChatParticipant {
    const friend = this.findFriendProfile(participant.id);
    if (!friend) {
      if (!participant.name || looksLikeParticipantIdentifier(participant.name)) {
        return { ...participant, name: participant.name || participant.id };
      }
      return participant;
    }
    const nextId = friend.userId?.trim() || participant.id;
    const friendName = friend.name?.trim();
    const fallbackName =
      participant.name && !looksLikeParticipantIdentifier(participant.name)
        ? participant.name
        : nextId;
    const nextName = friendName && friendName.length > 0 ? friendName : fallbackName;
    const nextAvatar = friend.avatar ?? participant.avatar ?? null;
    if (
      nextId === participant.id &&
      nextName === participant.name &&
      nextAvatar === participant.avatar
    ) {
      return participant;
    }
    return {
      ...participant,
      id: nextId,
      name: nextName,
      avatar: nextAvatar,
    };
  }
  private registerAliasList(list: string[], value: string | null): string[] {
    if (!value) return list;
    const trimmed = value.trim();
    if (!trimmed) return list;
    const aliases = new Set(list);
    aliases.add(trimmed);
    const canonical = canonicalParticipantKey(trimmed);
    if (canonical) {
      aliases.add(canonical);
    }
    return Array.from(aliases);
  }

  private registerAliasSet(list: string[], entries: string[]): string[] {
    const aliases = new Set(list);
    entries.forEach((value) => {
      const trimmed = value.trim();
      if (!trimmed) return;
      aliases.add(trimmed);
      const canonical = canonicalParticipantKey(trimmed);
      if (canonical) aliases.add(canonical);
    });
    return Array.from(aliases);
  }

  private isSelfId(id: string | null | undefined): boolean {
    if (!id) return false;
    const normalized = id.trim();
    if (!normalized) return false;
    if (normalized === this.state.self.currentUserId || normalized === this.state.self.selfClientId) {
      return true;
    }
    if (this.state.self.aliases.includes(normalized)) return true;
    const canonical = canonicalParticipantKey(normalized);
    return canonical ? this.state.self.aliases.includes(canonical) : false;
  }

  private sanitizeDescriptor(descriptor: ChatSessionDescriptor): ChatSessionDescriptor {
    const primarySelfId = this.state.self.currentUserId?.trim() || null;
    const secondarySelfId = this.state.self.selfClientId?.trim() || null;
    const selfIds = this.getSelfIds();
    return sanitizeSessionDescriptor(descriptor, {
      selfIds,
      primarySelfId,
      secondarySelfId,
      isGroupConversation: (id) => isGroupConversationId(id),
    });
  }

  private buildMessageIndex(messages: ChatMessage[]): Record<string, number> {
    const index: Record<string, number> = {};
    messages.forEach((message, idx) => {
      index[message.id] = idx;
    });
    return index;
  }

  private defaultMessageIdFactory(): string {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      return crypto.randomUUID();
    }
    return `msg_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
  }
}
