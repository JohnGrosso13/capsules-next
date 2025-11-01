import type { FriendItem } from "@/hooks/useFriendsData";
import { isGroupConversationId } from "@/lib/chat/channels";
import { DEFAULT_CHAT_STORAGE_KEY, loadChatState, saveChatState } from "@/lib/chat/chat-storage";
import type {
  ChatParticipant,
  ChatSessionType,
  ChatSessionDescriptor,
  ChatMessageEventPayload,
  ChatMessageUpdatedEventPayload,
  ChatMessageDeletedEventPayload,
  ChatReactionEventPayload,
} from "@/lib/chat/events";
import type {
  ChatMessage,
  ChatMessageAttachment,
  ChatMessageReaction,
  ChatSession,
  ChatStoreConfig,
  ChatStoreSnapshot,
  LegacyStoredSession,
  StorageAdapter,
  StoredMessage,
  StoredMessageAttachment,
  StoredMessageReaction,
  StoredParticipant,
  StoredSession,
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
  resolveParticipantId,
  sanitizeIncomingAttachments,
  sanitizeMessageBody,
  sanitizeSessionDescriptor,
  sanitizeStoredAttachments,
  standardizeUserId,
  typingKey,
} from "@/components/providers/chat-store/helpers";

export type {
  ChatParticipant,
  ChatSessionType,
  ChatSessionDescriptor,
  ChatMessageEventPayload,
  ChatMessageUpdatedEventPayload,
  ChatMessageDeletedEventPayload,
  ChatReactionEventPayload,
} from "@/lib/chat/events";
export type {
  ChatMessage,
  ChatMessageAttachment,
  ChatMessageReaction,
  ChatSession,
  ChatStoreConfig,
  ChatStoreSnapshot,
  LegacyStoredSession,
  StorageAdapter,
  StoredMessage,
  StoredMessageAttachment,
  StoredMessageReaction,
  StoredParticipant,
  StoredSession,
  StoredState,
} from "@/components/providers/chat-store/types";

export type ChatTypingEventPayload = {
  type: "chat.typing";
  conversationId: string;
  senderId: string;
  typing: boolean;
  sender?: Partial<ChatParticipant> | null;
  participants?: ChatParticipant[];
  expiresAt?: string | null;
};

type ChatSessionInternal = {
  id: string;
  type: ChatSessionType;
  title: string;
  avatar: string | null;
  createdBy: string | null;
  participants: ChatParticipant[];
  messages: ChatMessage[];
  messageIndex: Map<string, number>;
  lastMessageTimestamp: number;
  unreadCount: number;
  typing: Map<string, { participant: ChatParticipant; expiresAt: number }>;
};

const DEFAULT_MESSAGE_LIMIT = 100;
const TYPING_TTL_MS = 6000;
const TYPING_MIN_DURATION_MS = 1500;

const createMessageId = (): string => {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `msg_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
};

export class ChatStore {
  private sessions: Map<string, ChatSessionInternal> = new Map();
  private activeSessionId: string | null = null;
  private listeners = new Set<(snapshot: ChatStoreSnapshot) => void>();
  private storage: StorageAdapter | null;
  private storageKey: string;
  private messageLimit: number;
  private hydrated = false;
  private snapshot: ChatStoreSnapshot = {
    sessions: [],
    activeSessionId: null,
    activeSession: null,
    unreadCount: 0,
  };
  private now: () => number;
  private currentUserId: string | null = null;
  private selfClientId: string | null = null;
  private selfAliases = new Set<string>();
  private typingSweepTimer: number | null = null;

  constructor(config?: ChatStoreConfig) {
    this.storage = config?.storage ?? null;
    this.storageKey = config?.storageKey ?? DEFAULT_CHAT_STORAGE_KEY;
    this.messageLimit = config?.messageLimit ?? DEFAULT_MESSAGE_LIMIT;
    this.now = config?.now ?? Date.now;
  }

  setStorage(storage: StorageAdapter | null) {
    this.storage = storage;
  }

  private registerSelfAlias(value: string | null) {
    if (!value) return;
    const trimmed = value.trim();
    if (!trimmed) return;
    this.selfAliases.add(trimmed);
    const canonical = canonicalParticipantKey(trimmed);
    if (canonical) {
      this.selfAliases.add(canonical);
    }
  }

  setCurrentUserId(userId: string | null) {
    const normalized = typeof userId === "string" ? userId.trim() : "";
    const nextId = normalized.length > 0 ? normalized : null;
    if (this.currentUserId === nextId) return;
    this.currentUserId = nextId;
    if (nextId) {
      this.registerSelfAlias(nextId);
    }
    this.refreshSessionTitles();
  }

  setSelfClientId(clientId: string | null) {
    const normalized = typeof clientId === "string" ? clientId.trim() : "";
    const nextId = normalized.length > 0 ? normalized : null;
    if (this.selfClientId === nextId) return;
    this.selfClientId = nextId;
    if (nextId) {
      this.registerSelfAlias(nextId);
    }
    this.refreshSessionTitles();
  }

  applySelfParticipant(participant: ChatParticipant, aliases: string[] = []) {
    const normalizedSelf = normalizeParticipant(participant);
    if (!normalizedSelf) return;
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
    aliases.forEach((alias) => addAlias(alias));
    aliasSet.forEach((alias) => this.registerSelfAlias(alias));
    let mutated = false;
    this.sessions.forEach((session) => {
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
        session.messageIndex = new Map(session.messages.map((msg, index) => [msg.id, index]));
        mutated = true;
      }
      if (session.createdBy) {
        const creator = session.createdBy.trim();
        const canonicalCreator = canonicalParticipantKey(creator);
        if (
          (creator && aliasSet.has(creator) && session.createdBy !== normalizedSelf.id) ||
          (canonicalCreator &&
            aliasSet.has(canonicalCreator) &&
            session.createdBy !== normalizedSelf.id)
        ) {
          session.createdBy = normalizedSelf.id;
          mutated = true;
        }
      }
    });
    if (mutated) {
      this.emit();
    }
  }

  getCurrentUserId(): string | null {
    return this.currentUserId;
  }

  getSelfClientId(): string | null {
    return this.selfClientId;
  }

  getSnapshot(): ChatStoreSnapshot {
    return this.snapshot;
  }

  subscribe(listener: (snapshot: ChatStoreSnapshot) => void): () => void {
    this.listeners.add(listener);
    listener(this.snapshot);
    return () => {
      this.listeners.delete(listener);
    };
  }

  hydrateFromStorage(): void {
    if (!this.storage) {
      this.hydrated = true;
      this.emit();
      return;
    }
    const restored = loadChatState(this.storage, this.storageKey);
    if (!restored) {
      this.hydrated = true;
      this.emit();
      return;
    }
    this.sessions.clear();
    restored.sessions.forEach((stored) => {
      let descriptor: ChatSessionDescriptor | null = null;
      if (isValidStoredSession(stored)) {
        const participants = stored.participants
          .map((participant) => normalizeParticipant(participant))
          .filter((participant): participant is ChatParticipant => Boolean(participant));
        descriptor = {
          id: stored.id,
          type: stored.type,
          title: stored.title,
          avatar: stored.avatar ?? null,
          createdBy: stored.createdBy ?? null,
          participants,
        };
      } else if (isLegacyStoredSession(stored)) {
        const participant = normalizeParticipant({
          id: stored.friendUserId,
          name: stored.friendName,
          avatar: stored.friendAvatar ?? null,
        });
        if (participant) {
          descriptor = {
            id: stored.id,
            type: "direct",
            title: stored.friendName,
            avatar: stored.friendAvatar ?? null,
            createdBy: null,
            participants: [participant],
          };
        }
      }
      if (!descriptor) return;
      const { session } = this.ensureSessionInternal(descriptor);
      session.messages = [];
      session.messageIndex = new Map();
      session.lastMessageTimestamp = 0;
      session.unreadCount = 0;
      stored.messages.slice(-this.messageLimit).forEach((storedMessage) => {
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
          };
          session.messages.push(restoredMessage);
          session.messageIndex.set(restoredMessage.id, session.messages.length - 1);
          const ts = Date.parse(restoredMessage.sentAt);
          if (Number.isFinite(ts)) {
            session.lastMessageTimestamp = ts;
          }
        }
      });
    });
    if (typeof restored.activeSessionId === "string") {
      this.activeSessionId = restored.activeSessionId;
    }
    this.hydrated = true;
    this.emit();
  }

  toStoredState(): StoredState {
    const snapshot = this.snapshot;
    return {
      activeSessionId: this.activeSessionId,
      sessions: snapshot.sessions.map((session) => ({
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
          return storedMessage;
        }),
      })),
    };
  }

  setActiveSession(sessionId: string | null) {
    this.activeSessionId = sessionId;
    if (sessionId) {
      const session = this.sessions.get(sessionId);
      if (session) {
        session.unreadCount = 0;
      }
    }
    this.emit();
  }

  deleteSession(sessionId: string) {
    if (!this.sessions.delete(sessionId)) return;
    if (this.activeSessionId === sessionId) {
      this.activeSessionId = null;
    }
    this.emit();
  }

  remapSessionId(oldId: string, newId: string) {
    const sourceId = typeof oldId === "string" ? oldId.trim() : "";
    const targetId = typeof newId === "string" ? newId.trim() : "";
    if (!sourceId || !targetId || sourceId === targetId) return;
    const sourceSession = this.sessions.get(sourceId);
    if (!sourceSession) return;

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

    let targetSession = this.sessions.get(targetId);
    if (!targetSession || targetSession === sourceSession) {
      this.sessions.delete(sourceId);
      sourceSession.id = targetId;
      this.sessions.set(targetId, sourceSession);
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
      targetSession.messageIndex = new Map(
        mergedMessages.map((message, index) => [message.id, index]),
      );
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
      this.sessions.delete(sourceId);
    }

    if (this.activeSessionId === sourceId) {
      this.activeSessionId = targetId;
    }
    this.emit();
  }

  ensureSession(descriptor: ChatSessionDescriptor): ChatSessionInternal {
    const { session, changed } = this.ensureSessionInternal(descriptor);
    if (changed) {
      this.emit();
    }
    return session;
  }

  upsertParticipants(sessionId: string, participants: ChatParticipant[]) {
    const session = this.sessions.get(sessionId);
    if (!session) return;
    const merged = mergeParticipants(session.participants, participants);
    const changed =
      merged.length !== session.participants.length ||
      merged.some((participant, index) => {
        const existing = session.participants[index];
        if (!existing) return true;
        return (
          existing.id !== participant.id ||
          existing.name !== participant.name ||
          existing.avatar !== participant.avatar
        );
      });
    if (!changed) return;
    session.participants = merged;
    this.emit();
  }

  addMessage(sessionId: string, message: ChatMessage, options: { isLocal: boolean }) {
    const session = this.sessions.get(sessionId);
    if (!session) return;
    let changed = false;
    const attachments = normalizeLocalAttachments(message.attachments);
    const existingIndex = session.messageIndex.get(message.id);
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
      session.messages.push(nextMessage);
      session.messageIndex.set(nextMessage.id, session.messages.length - 1);
      if (!options.isLocal && this.activeSessionId !== session.id) {
        session.unreadCount += 1;
      }
      if (session.messages.length > this.messageLimit) {
        const excess = session.messages.length - this.messageLimit;
        const removed = session.messages.splice(0, excess);
        removed.forEach((removedMessage) => {
          session.messageIndex.delete(removedMessage.id);
        });
        session.messages.forEach((msg, index) => {
          session.messageIndex.set(msg.id, index);
        });
      }
      changed = true;
    }
    const timestamp = Date.parse(message.sentAt);
    session.lastMessageTimestamp = Number.isFinite(timestamp) ? timestamp : this.now();
    if (options.isLocal && this.activeSessionId === session.id) {
      session.unreadCount = 0;
    }
    if (changed) {
      this.emit();
    }
  }

  acknowledgeMessage(
    sessionId: string,
    clientMessageId: string,
    serverPayload: {
      id: string;
      authorId: string;
      body: string;
      sentAt: string;
      reactions?: Array<{ emoji: string; users?: ChatParticipant[] }>;
      attachments?: ChatMessageEventPayload["message"]["attachments"];
    },
  ) {
    const session = this.sessions.get(sessionId);
    if (!session) return;
    if (!serverPayload || typeof serverPayload.id !== "string") return;
    const sanitizedBody = sanitizeMessageBody(serverPayload.body ?? "");
    const attachments = sanitizeIncomingAttachments(serverPayload.attachments);
    if (!sanitizedBody && attachments.length === 0) return;
    const normalizedReactions = normalizeReactions(serverPayload.reactions, (id) => this.isSelfId(id));
    const baseMessage: ChatMessage = {
      id: serverPayload.id,
      authorId: serverPayload.authorId || serverPayload.id,
      body: sanitizedBody,
      sentAt: serverPayload.sentAt || new Date().toISOString(),
      status: "sent",
      reactions: normalizedReactions,
      attachments,
    };
    const clientIndex = session.messageIndex.get(clientMessageId);
    const serverIndex = session.messageIndex.get(baseMessage.id);
    let changed = false;
    if (typeof clientIndex === "number") {
      const existing = session.messages[clientIndex];
      const merged = existing
        ? { ...existing, ...baseMessage, reactions: normalizedReactions }
        : { ...baseMessage, reactions: normalizedReactions };
      session.messages[clientIndex] = merged;
      if (baseMessage.id !== clientMessageId) {
        session.messageIndex.delete(clientMessageId);
        session.messageIndex.set(baseMessage.id, clientIndex);
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
      this.addMessage(sessionId, baseMessage, { isLocal });
      return;
    }
    if (changed) {
      this.emit();
    }
  }

  markMessageStatus(sessionId: string, messageId: string, status: ChatMessage["status"]) {
    const session = this.sessions.get(sessionId);
    if (!session) return;
    const index = session.messageIndex.get(messageId);
    if (typeof index !== "number") return;
    const existing = session.messages[index];
    if (!existing || existing.status === status) return;
    session.messages[index] = { ...existing, status };
    this.emit();
  }

  applySessionEvent(descriptor: ChatSessionDescriptor) {
    const effective = {
      ...descriptor,
      participants: descriptor.participants.map((participant) => ({
        id: participant.id,
        name: participant.name,
        avatar: participant.avatar ?? null,
      })),
    };
    const hasSelf = effective.participants.some((participant) => this.isSelfId(participant.id));
    if (!hasSelf) return;
    this.ensureSession(effective);
  }

  applyMessageEvent(payload: ChatMessageEventPayload) {
    if (!payload || payload.type !== "chat.message") return;
    const { conversationId } = payload;
    if (!conversationId) return;
    const participants = Array.isArray(payload.participants) ? payload.participants : [];
    const normalizedParticipants = participants
      .map((participant) => normalizeParticipant(participant))
      .filter((participant): participant is ChatParticipant => Boolean(participant));
    const hasSelf =
      normalizedParticipants.some((participant) => this.isSelfId(participant.id)) ||
      this.isSelfId(payload.senderId);
    if (!hasSelf) return;
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
    const session = this.ensureSessionInternal(descriptor).session;
    if (
      !payload.message ||
      typeof payload.message.id !== "string" ||
      typeof payload.message.body !== "string"
    ) {
      return;
    }
    const messageBody = sanitizeMessageBody(payload.message.body);
    const attachments = sanitizeIncomingAttachments(payload.message.attachments);
    if (!messageBody && attachments.length === 0) return;
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
    const chatMessage: ChatMessage = {
      id: payload.message.id,
      authorId,
      body: messageBody,
      sentAt: payload.message.sentAt ?? new Date().toISOString(),
      status: "sent",
      reactions,
      attachments,
    };
    const isLocal = this.isSelfId(authorId);
    this.addMessage(session.id, chatMessage, { isLocal });
  }

  applyReactionEvent(payload: ChatReactionEventPayload) {
    if (!payload || payload.type !== "chat.reaction") return;
    const conversationId =
      typeof payload.conversationId === "string" ? payload.conversationId.trim() : "";
    const messageId = typeof payload.messageId === "string" ? payload.messageId.trim() : "";
    if (!conversationId || !messageId) return;
    const session = this.sessions.get(conversationId);
    if (!session) return;
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
      this.upsertParticipants(conversationId, participantUpdates);
    }
    const messageIndex = session.messageIndex.get(messageId);
    if (typeof messageIndex !== "number") return;
    const existing = session.messages[messageIndex];
    if (!existing) return;
    const reactions = normalizeReactions(
      Array.isArray(payload.reactions)
        ? payload.reactions.map((reaction) => ({
            emoji: reaction.emoji,
            users: reaction.users ?? [],
          }))
        : undefined,
      (id) => this.isSelfId(id),
    );
    if (reactionsEqual(existing.reactions, reactions)) return;
    session.messages[messageIndex] = { ...existing, reactions };
    this.emit();
  }

  applyMessageUpdateEvent(payload: ChatMessageUpdatedEventPayload) {
    if (!payload || payload.type !== "chat.message.update") return;
    const conversationId =
      typeof payload.conversationId === "string" ? payload.conversationId.trim() : "";
    const messageId = typeof payload.messageId === "string" ? payload.messageId.trim() : "";
    if (!conversationId || !messageId) return;
    const session = this.sessions.get(conversationId);
    if (!session) return;
    if (Array.isArray(payload.participants) && payload.participants.length > 0) {
      this.upsertParticipants(conversationId, payload.participants);
    }
    const attachments = sanitizeIncomingAttachments(payload.attachments);
    const sanitizedBody = sanitizeMessageBody(payload.body ?? "");
    const sentAt =
      typeof payload.sentAt === "string" && payload.sentAt.trim().length
        ? payload.sentAt.trim()
        : undefined;
    const messageIndex = session.messageIndex.get(messageId);
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
      };
      this.addMessage(conversationId, message, { isLocal: false });
      return;
    }
    const existing = session.messages[messageIndex];
    if (!existing) return;
    const updatedMessage: ChatMessage = {
      ...existing,
      body: sanitizedBody.length > 0 ? sanitizedBody : existing.body,
      attachments,
      sentAt: sentAt ?? existing.sentAt,
    };
    session.messages[messageIndex] = updatedMessage;
    session.messageIndex.set(updatedMessage.id, messageIndex);
    const timestamp = Date.parse(updatedMessage.sentAt);
    if (Number.isFinite(timestamp)) {
      session.lastMessageTimestamp = Math.max(session.lastMessageTimestamp, timestamp);
    }
    this.emit();
  }

  applyMessageDeleteEvent(payload: ChatMessageDeletedEventPayload) {
    if (!payload || payload.type !== "chat.message.delete") return;
    const conversationId =
      typeof payload.conversationId === "string" ? payload.conversationId.trim() : "";
    const messageId = typeof payload.messageId === "string" ? payload.messageId.trim() : "";
    if (!conversationId || !messageId) return;
    const session = this.sessions.get(conversationId);
    if (!session) return;
    if (Array.isArray(payload.participants) && payload.participants.length > 0) {
      this.upsertParticipants(conversationId, payload.participants);
    }
    const messageIndex = session.messageIndex.get(messageId);
    if (typeof messageIndex !== "number") return;
    session.messages.splice(messageIndex, 1);
    session.messageIndex.delete(messageId);
    session.messages.forEach((message, index) => {
      session.messageIndex.set(message.id, index);
    });
    const lastMessage = session.messages[session.messages.length - 1] ?? null;
    session.lastMessageTimestamp = lastMessage ? Date.parse(lastMessage.sentAt) || 0 : 0;
    this.emit();
  }

  resetUnread(sessionId: string) {
    const session = this.sessions.get(sessionId);
    if (!session) return;
    if (session.unreadCount === 0) return;
    session.unreadCount = 0;
    this.emit();
  }

  applyTypingEvent(payload: ChatTypingEventPayload) {
    if (!payload || payload.type !== "chat.typing") return;
    const conversationId = typeof payload.conversationId === "string" ? payload.conversationId.trim() : "";
    if (!conversationId) return;
    const senderIdRaw = typeof payload.senderId === "string" ? payload.senderId.trim() : "";
    if (!senderIdRaw) return;
    const senderKey = typingKey(senderIdRaw);
    if (!senderKey) return;

    const normalizedParticipants = Array.isArray(payload.participants)
      ? mergeParticipants(
          payload.participants
            .map((participant) => normalizeParticipant(participant))
            .filter((participant): participant is ChatParticipant => Boolean(participant)),
        )
      : [];

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
        normalizedParticipants.find((participant) => typingKey(participant.id) === senderKey) ?? null;
    }

    if (!senderParticipant) {
      senderParticipant = {
        id: senderIdRaw,
        name: senderIdRaw,
        avatar: null,
      };
    }

    if (!normalizedParticipants.some((participant) => typingKey(participant.id) === senderKey)) {
      normalizedParticipants.push(senderParticipant);
    }

    const descriptor: ChatSessionDescriptor = {
      id: conversationId,
      type: isGroupConversationId(conversationId) ? "group" : "direct",
      title: "",
      avatar: null,
      createdBy: null,
      participants: normalizedParticipants,
    };

    const { session } = this.ensureSessionInternal(descriptor);
    const target = session as ChatSessionInternal;
    if (!target.typing) {
      target.typing = new Map();
    }

    const now = this.now();
    const expiresAtIso = typeof payload.expiresAt === "string" ? Date.parse(payload.expiresAt) : Number.NaN;
    const expiresAt =
      Number.isFinite(expiresAtIso) && expiresAtIso > now
        ? Math.max(expiresAtIso, now + TYPING_MIN_DURATION_MS)
        : now + TYPING_TTL_MS;

    const selfSender = this.isSelfId(senderParticipant.id);
    let changed = false;

    if (payload.typing && !selfSender) {
      const existing = target.typing.get(senderKey);
      const existingExpires = existing?.expiresAt ?? 0;
      const existingName = existing?.participant?.name ?? null;
      target.typing.set(senderKey, { participant: senderParticipant, expiresAt });
      if (!existing || existingExpires !== expiresAt || existingName !== senderParticipant.name) {
        changed = true;
      }
    } else {
      if (target.typing.delete(senderKey)) {
        changed = true;
      }
    }

    if (this.pruneTypingEntries(target, now)) {
      changed = true;
    }

    this.scheduleTypingSweep();

    if (changed) {
      this.emit();
    }
  }

  updateFromFriends(friends: FriendItem[]) {
    if (!Array.isArray(friends) || !friends.length) return;
    const friendIdMap = new Map<string, FriendItem>();
    const friendKeyMap = new Map<string, FriendItem>();
    friends.forEach((friend) => {
      if (friend.userId) {
        const trimmed = friend.userId.trim();
        if (trimmed) {
          friendIdMap.set(trimmed, friend);
          const canonical = canonicalParticipantKey(trimmed);
          if (canonical) {
            friendIdMap.set(canonical, friend);
          }
        }
      }
      if (friend.key) {
        const normalizedKey = friend.key.trim();
        if (normalizedKey) {
          friendKeyMap.set(normalizedKey.toLowerCase(), friend);
          const canonicalKey = canonicalParticipantKey(normalizedKey);
          if (canonicalKey) {
            friendKeyMap.set(canonicalKey.toLowerCase(), friend);
          }
        }
      }
    });
    const selfIds = this.getSelfIds();
    let changed = false;
    this.sessions.forEach((session) => {
      const updatedParticipants = session.participants.map((participant) => {
        const rawId = typeof participant.id === "string" ? participant.id.trim() : "";
        if (!rawId) return participant;
        const canonicalId = canonicalParticipantKey(rawId);
        const lookupFriend =
          friendIdMap.get(rawId) ??
          (canonicalId ? friendIdMap.get(canonicalId) : undefined) ??
          friendKeyMap.get(rawId.toLowerCase()) ??
          (canonicalId ? friendKeyMap.get(canonicalId.toLowerCase()) : undefined);
        if (!lookupFriend) return participant;
        const nextId = lookupFriend.userId?.trim() || participant.id;
        const nextName = lookupFriend.name || participant.name;
        const nextAvatar = lookupFriend.avatar ?? participant.avatar ?? null;
        if (
          nextId !== participant.id ||
          nextName !== participant.name ||
          nextAvatar !== participant.avatar
        ) {
          return {
            id: nextId,
            name: nextName || nextId,
            avatar: nextAvatar,
          };
        }
        return participant;
      });
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
    if (changed) {
      this.emit();
    }
  }

  prepareLocalMessage(
    conversationId: string,
    body: string,
    options?: { selfParticipant?: ChatParticipant | null; attachments?: ChatMessageAttachment[] },
  ): {
    message: ChatMessage;
    session: {
      id: string;
      type: ChatSessionType;
      title: string;
      avatar: string | null;
      createdBy: string | null;
      participants: ChatParticipant[];
    };
  } | null {
    const session = this.sessions.get(conversationId);
    if (!session) return null;
    const trimmed = sanitizeMessageBody(body);
    const attachments = normalizeLocalAttachments(options?.attachments);
    if (!trimmed && attachments.length === 0) return null;
    const selfIdentity = this.selfClientId ?? this.currentUserId;
    if (!selfIdentity) {
      throw new Error("Chat identity is not ready yet.");
    }
    const preferredSelf = options?.selfParticipant ?? null;
    if (!session.participants.some((participant) => participant.id === selfIdentity)) {
      const fallbackName = preferredSelf?.name ?? this.currentUserId ?? selfIdentity;
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
    const messageId = createMessageId();
    const sentAt = new Date().toISOString();
    const localMessage: ChatMessage = {
      id: messageId,
      authorId: this.currentUserId ?? selfIdentity,
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
  ): { created: boolean } {
    const { session, created, changed } = this.ensureSessionInternal(descriptor);
    if (options?.activate) {
      this.activeSessionId = session.id;
      session.unreadCount = 0;
    }
    if (created || changed || options?.activate) {
      this.emit();
    }
    return { created };
  }

  private getSelfIds(): Set<string> {
    const selfIds = new Set<string>(this.selfAliases);
    if (this.currentUserId) selfIds.add(this.currentUserId);
    if (this.selfClientId) selfIds.add(this.selfClientId);
    return selfIds;
  }

  private isSelfId(id: string | null | undefined): boolean {
    if (!id) return false;
    const normalized = id.trim();
    if (!normalized) return false;
    if (normalized === this.currentUserId || normalized === this.selfClientId) return true;
    if (this.selfAliases.has(normalized)) return true;
    const canonical = canonicalParticipantKey(normalized);
    return canonical ? this.selfAliases.has(canonical) : false;
  }

  private sanitizeDescriptor(descriptor: ChatSessionDescriptor): ChatSessionDescriptor {
    const primarySelfId = this.currentUserId?.trim() || null;
    const secondarySelfId = this.selfClientId?.trim() || null;
    const selfIds = this.getSelfIds();
    return sanitizeSessionDescriptor(descriptor, {
      selfIds,
      primarySelfId,
      secondarySelfId,
      isGroupConversation: (id) => isGroupConversationId(id),
    });
  }

  private ensureSessionInternal(descriptor: ChatSessionDescriptor): {
    session: ChatSessionInternal;
    created: boolean;
    changed: boolean;
  } {
    const sanitized = this.sanitizeDescriptor(descriptor);
    const map = this.sessions;
    let session = map.get(sanitized.id);
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
        messageIndex: new Map(),
        lastMessageTimestamp: 0,
        unreadCount: 0,
        typing: new Map(),
      };
      map.set(session.id, session);
      created = true;
      changed = true;
    } else {
      const current = session as ChatSessionInternal;
      if (!current.typing) {
        current.typing = new Map();
      }
      if (
        current.type !== sanitized.type ||
        current.title !== sanitized.title ||
        current.avatar !== sanitized.avatar ||
        current.createdBy !== sanitized.createdBy
      ) {
        current.type = sanitized.type;
        current.title = sanitized.title;
        current.avatar = sanitized.avatar;
        current.createdBy = sanitized.createdBy;
        changed = true;
      }
      const mergedParticipants = mergeParticipants(current.participants, sanitized.participants);
      if (
        mergedParticipants.length !== current.participants.length ||
        mergedParticipants.some((participant, index) => {
          const existing = current.participants[index];
          if (!existing) return true;
          return (
            existing.id !== participant.id ||
            existing.name !== participant.name ||
            existing.avatar !== participant.avatar
          );
        })
      ) {
        current.participants = mergedParticipants;
        changed = true;
      }
    }
    return { session: session!, created, changed };
  }

  private refreshSessionTitles() {
    let changed = false;
    const selfIds = this.getSelfIds();
    this.sessions.forEach((session) => {
      if (session.type === "direct") {
        const nextTitle = computeDefaultTitle(session.participants, selfIds, "direct");
        if (session.title !== nextTitle) {
          session.title = nextTitle;
          changed = true;
        }
      }
    });
    if (changed) {
      this.emit();
    }
  }

  private persist() {
    if (!this.hydrated || !this.storage) return;
    saveChatState(this.storage, this.toStoredState(), this.storageKey);
  }

  private pruneTypingEntries(session: ChatSessionInternal, now: number): boolean {
    if (!session.typing || session.typing.size === 0) return false;
    let changed = false;
    session.typing.forEach((entry, key) => {
      if (!entry || !Number.isFinite(entry.expiresAt) || entry.expiresAt <= now) {
        session.typing.delete(key);
        changed = true;
      }
    });
    return changed;
  }

  private collectTypingSnapshot(
    session: ChatSessionInternal,
    now: number,
  ): { participants: ChatParticipant[]; changed: boolean } {
    if (!session.typing || session.typing.size === 0) {
      return { participants: [], changed: false };
    }
    const expiredKeys: string[] = [];
    const seen = new Set<string>();
    const typingParticipants: ChatParticipant[] = [];
    const selfKeys = new Set(
      Array.from(this.getSelfIds(), (id) => typingKey(id)).filter(
        (value): value is string => typeof value === "string" && value.length > 0,
      ),
    );
    session.typing.forEach((entry, key) => {
      if (!entry || !entry.participant) {
        expiredKeys.push(key);
        return;
      }
      if (!Number.isFinite(entry.expiresAt) || entry.expiresAt <= now) {
        expiredKeys.push(key);
        return;
      }
      const participantKey = typingKey(entry.participant.id);
      if (!participantKey) {
        expiredKeys.push(key);
        return;
      }
      if (selfKeys.has(participantKey)) {
        expiredKeys.push(key);
        return;
      }
      if (seen.has(participantKey)) return;
      seen.add(participantKey);
      typingParticipants.push({ ...entry.participant });
    });
    if (expiredKeys.length) {
      expiredKeys.forEach((key) => session.typing.delete(key));
      return { participants: typingParticipants, changed: true };
    }
    return { participants: typingParticipants, changed: false };
  }

  private scheduleTypingSweep(): void {
    if (typeof window === "undefined") return;
    if (this.typingSweepTimer !== null) {
      window.clearTimeout(this.typingSweepTimer);
      this.typingSweepTimer = null;
    }
    let nextExpiry: number | null = null;
    const now = this.now();
    this.sessions.forEach((session) => {
      const internal = session as ChatSessionInternal;
      if (!internal.typing || internal.typing.size === 0) return;
      internal.typing.forEach((entry) => {
        if (!entry || !Number.isFinite(entry.expiresAt)) return;
        const expiry = entry.expiresAt;
        if (expiry <= now) {
          nextExpiry = now + 100;
        } else if (nextExpiry === null || expiry < nextExpiry) {
          nextExpiry = expiry;
        }
      });
    });
    if (nextExpiry === null) return;
    const delay = Math.max(100, Math.trunc(nextExpiry - now + 50));
    this.typingSweepTimer = window.setTimeout(() => {
      this.runTypingSweep();
    }, delay) as unknown as number;
  }

  private runTypingSweep(): void {
    if (typeof window === "undefined") return;
    this.typingSweepTimer = null;
    const now = this.now();
    let changed = false;
    this.sessions.forEach((session) => {
      const internal = session as ChatSessionInternal;
      if (!internal.typing || internal.typing.size === 0) return;
      if (this.pruneTypingEntries(internal, now)) {
        changed = true;
      }
    });
    if (changed) {
      this.emit();
    }
    this.scheduleTypingSweep();
  }

  private buildSnapshot(): ChatStoreSnapshot {
    const entries: Array<{ session: ChatSession; order: number }> = [];
    const now = this.now();
    this.sessions.forEach((session) => {
      const internal = session as ChatSessionInternal;
      const typingSnapshot = this.collectTypingSnapshot(internal, now);
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
            (lastMessage && Array.isArray(lastMessage.attachments) && lastMessage.attachments.length
              ? lastMessage.attachments.length === 1
                ? `Attachment: ${lastMessage.attachments[0]?.name ?? "Attachment"}`
                : `Attachments (${lastMessage.attachments.length})`
              : null),
          typing: typingSnapshot.participants,
        },
      });
    });
    entries.sort((a, b) => b.order - a.order);
    const sessions = entries.map((entry) => entry.session);
    const activeSession = this.activeSessionId
      ? (sessions.find((session) => session.id === this.activeSessionId) ?? null)
      : null;
    const unreadCount = sessions.reduce((total, session) => total + session.unreadCount, 0);
    return {
      sessions,
      activeSessionId: this.activeSessionId,
      activeSession,
      unreadCount,
    };
  }

  private emit() {
    this.snapshot = this.buildSnapshot();
    this.persist();
    this.listeners.forEach((listener) => {
      listener(this.snapshot);
    });
  }
}

export const chatStoreTestUtils = {
  standardizeUserId,
  resolveParticipantId,
  canonicalParticipantKey,
  normalizeParticipant,
  mergeParticipants,
  sanitizeMessageBody,
};
