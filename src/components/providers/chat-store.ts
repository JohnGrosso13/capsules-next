import type { FriendItem } from "@/hooks/useFriendsData";
import { loadChatState, saveChatState, DEFAULT_CHAT_STORAGE_KEY } from "@/lib/chat/chat-storage";

import type {
  ChatParticipant,
  ChatSessionDescriptor,
  ChatMessageEventPayload,
  ChatMessageUpdatedEventPayload,
  ChatMessageDeletedEventPayload,
  ChatReactionEventPayload,
} from "@/lib/chat/events";
import type {
  ChatMessage,
  ChatMessageAttachment,
  ChatStoreConfig,
  ChatStoreSnapshot,
  StorageAdapter,
  StoredState,
  ChatTypingEventPayload,
} from "@/components/providers/chat-store/types";
import {
  standardizeUserId,
  resolveParticipantId,
  canonicalParticipantKey,
  normalizeParticipant,
  mergeParticipants,
  sanitizeMessageBody,
} from "@/components/providers/chat-store/helpers";
import {
  ChatStateMachine,
  DEFAULT_MESSAGE_LIMIT,
} from "@/components/providers/chat-store/state-machine";
import type { SessionEnsureResult } from "@/components/providers/chat-store/state-machine";
import {
  browserTimerAdapter,
  noopTimerAdapter,
  type TimerAdapter,
  type TimerHandle,
} from "@/components/providers/chat-store/scheduler";
export { TYPING_MIN_DURATION_MS, TYPING_TTL_MS } from "@/components/providers/chat-store/typing";

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
  StoredMessage,
  StoredMessageAttachment,
  StoredMessageReaction,
  StoredParticipant,
  StoredSession,
  StorageAdapter,
  StoredState,
  ChatTypingEventPayload,
} from "@/components/providers/chat-store/types";

type SelfParticipantOptions = Parameters<ChatStateMachine["applySelfParticipant"]>[0];
type MessageUpdateOptions = Parameters<ChatStateMachine["applyMessageUpdateEvent"]>[2];
type MessageDeleteOptions = Parameters<ChatStateMachine["applyMessageDeleteEvent"]>[2];
type PrepareLocalOptions = Parameters<ChatStateMachine["prepareLocalMessage"]>[2];

export class ChatStore extends ChatStateMachine {
  private listeners = new Set<(snapshot: ChatStoreSnapshot) => void>();
  private storage: StorageAdapter | null;
  private storageKey: string;
  private snapshot: ChatStoreSnapshot = {
    sessions: [],
    activeSessionId: null,
    activeSession: null,
    unreadCount: 0,
  };
  private readonly timerAdapter: TimerAdapter;
  private typingSweepHandle: TimerHandle | null = null;
  private readonly clock: () => number;

  constructor(config?: ChatStoreConfig) {
    const now = config?.now ?? Date.now;
    super({
      now,
      messageLimit: config?.messageLimit ?? DEFAULT_MESSAGE_LIMIT,
    });
    this.clock = now;
    this.storage = config?.storage ?? null;
    this.storageKey = config?.storageKey ?? DEFAULT_CHAT_STORAGE_KEY;
    const defaultTimer = typeof window !== "undefined" ? browserTimerAdapter : noopTimerAdapter;
    this.timerAdapter = config?.timers ?? defaultTimer;
  }

  setStorage(storage: StorageAdapter | null) {
    this.storage = storage;
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

  private persist() {
    if (!this.isHydrated() || !this.storage) return;
    saveChatState(this.storage, this.toStoredState(), this.storageKey);
  }

  private emit() {
    this.snapshot = this.buildSnapshot(this.clock());
    this.persist();
    this.listeners.forEach((listener) => {
      listener(this.snapshot);
    });
  }

  private emitIf(changed: boolean) {
    if (changed) {
      this.emit();
    }
  }

  private scheduleTypingSweep(): void {
    if (!this.timerAdapter.isSupported()) return;
    if (this.typingSweepHandle !== null) {
      this.timerAdapter.cancel(this.typingSweepHandle);
      this.typingSweepHandle = null;
    }
    let nextExpiry: number | null = null;
    const now = this.clock();
    Object.values(this.getState().sessions).forEach((session) => {
      Object.values(session.typing ?? {}).forEach((entry) => {
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
    this.typingSweepHandle = this.timerAdapter.schedule(() => {
      this.runTypingSweep();
    }, delay);
  }

  private runTypingSweep(): void {
    this.typingSweepHandle = null;
    const changed = this.pruneTyping(this.clock());
    if (changed) {
      this.emit();
    }
    this.scheduleTypingSweep();
  }

  hydrateFromStorage(): void {
    if (!this.storage) {
      this.setHydrated();
      this.emit();
      return;
    }
    const restored: StoredState | null = loadChatState(this.storage, this.storageKey);
    if (!restored) {
      this.setHydrated();
      this.emit();
      this.scheduleTypingSweep();
      return;
    }
    this.hydrate(restored);
    this.setHydrated();
    this.emit();
    this.scheduleTypingSweep();
  }

  override toStoredState(): StoredState {
    return super.toStoredState();
  }

  override setCurrentUserId(userId: string | null): boolean {
    const changed = super.setCurrentUserId(userId);
    const titlesChanged = super.refreshSessionTitles();
    this.emitIf(changed || titlesChanged);
    return changed;
  }

  override setSelfClientId(clientId: string | null): boolean {
    const changed = super.setSelfClientId(clientId);
    const titlesChanged = super.refreshSessionTitles();
    this.emitIf(changed || titlesChanged);
    return changed;
  }

  override applySelfParticipant(
    input: SelfParticipantOptions | ChatParticipant,
    aliases: string[] = [],
  ): boolean {
    const payload =
      "participant" in (input as SelfParticipantOptions)
        ? (input as SelfParticipantOptions)
        : ({ participant: input as ChatParticipant, aliases } satisfies SelfParticipantOptions);
    const changed = super.applySelfParticipant(payload);
    const titlesChanged = super.refreshSessionTitles();
    this.emitIf(changed || titlesChanged);
    return changed;
  }

  override setActiveSession(sessionId: string | null): boolean {
    const changed = super.setActiveSession(sessionId);
    this.emitIf(changed);
    return changed;
  }

  override deleteSession(sessionId: string): boolean {
    const changed = super.deleteSession(sessionId);
    this.emitIf(changed);
    return changed;
  }

  override remapSessionId(oldId: string, newId: string): boolean {
    const changed = super.remapSessionId(oldId, newId);
    this.emitIf(changed);
    return changed;
  }

  override ensureSession(descriptor: ChatSessionDescriptor): SessionEnsureResult {
    const result = super.ensureSession(descriptor);
    this.emitIf(result.created || result.changed);
    return result;
  }

  override upsertParticipants(sessionId: string, participants: ChatParticipant[]): boolean {
    const changed = super.upsertParticipants(sessionId, participants);
    this.emitIf(changed);
    return changed;
  }

  override addMessage(
    sessionId: string,
    message: ChatMessage,
    options: { isLocal: boolean },
  ): boolean {
    const changed = super.addMessage(sessionId, message, options);
    this.emitIf(changed);
    return changed;
  }

  override acknowledgeMessage(
    sessionId: string,
    clientMessageId: string,
    payload: {
      id: string;
      authorId: string;
      body: string;
      sentAt: string;
      reactions?: Array<{ emoji: string; users?: ChatParticipant[] }>;
      attachments?: ChatMessageEventPayload["message"]["attachments"];
    },
  ): boolean {
    const changed = super.acknowledgeMessage(sessionId, clientMessageId, payload);
    this.emitIf(changed);
    return changed;
  }

  override markMessageStatus(
    sessionId: string,
    messageId: string,
    status: ChatMessage["status"],
  ): boolean {
    const changed = super.markMessageStatus(sessionId, messageId, status);
    this.emitIf(changed);
    return changed;
  }

  override applySessionEvent(descriptor: ChatSessionDescriptor): boolean {
    const changed = super.applySessionEvent(descriptor);
    this.emitIf(changed);
    return changed;
  }

  override applyMessageEvent(payload: ChatMessageEventPayload): boolean {
    const changed = super.applyMessageEvent(payload);
    this.emitIf(changed);
    return changed;
  }

  override applyReactionEvent(payload: ChatReactionEventPayload): boolean {
    const changed = super.applyReactionEvent(payload);
    this.emitIf(changed);
    return changed;
  }

  override applyMessageUpdateEvent(
    payload: ChatMessageUpdatedEventPayload,
  ): boolean;
  override applyMessageUpdateEvent(
    conversationId: string,
    messageId: string,
    payload: MessageUpdateOptions,
  ): boolean;
  override applyMessageUpdateEvent(
    arg1: string | ChatMessageUpdatedEventPayload,
    arg2?: string | MessageUpdateOptions,
    arg3?: MessageUpdateOptions,
  ): boolean {
    if (typeof arg1 === "string") {
      const conversationId = arg1.trim();
      const messageId = typeof arg2 === "string" ? arg2.trim() : "";
      if (!conversationId || !messageId) return false;
      const payload = (typeof arg2 === "string" ? arg3 : arg2) ?? {};
      const changed = super.applyMessageUpdateEvent(conversationId, messageId, payload);
      this.emitIf(changed);
      return changed;
    }
    const payload = arg1;
    const conversationId =
      typeof payload.conversationId === "string" ? payload.conversationId.trim() : "";
    const messageId = typeof payload.messageId === "string" ? payload.messageId.trim() : "";
    if (!conversationId || !messageId) return false;
    const updatePayload: MessageUpdateOptions = {};
    if (payload.senderId !== undefined) {
      updatePayload.senderId = payload.senderId ?? null;
    }
    if (payload.body !== undefined) {
      updatePayload.body = payload.body ?? null;
    }
    if (payload.sentAt !== undefined) {
      updatePayload.sentAt = payload.sentAt ?? null;
    }
    if (payload.attachments !== undefined) {
      updatePayload.attachments = payload.attachments;
    }
    if (payload.participants !== undefined) {
      updatePayload.participants = payload.participants;
    }
    const changed = super.applyMessageUpdateEvent(conversationId, messageId, updatePayload);
    this.emitIf(changed);
    return changed;
  }

  override applyMessageDeleteEvent(
    payload: ChatMessageDeletedEventPayload,
  ): boolean;
  override applyMessageDeleteEvent(
    conversationId: string,
    messageId: string,
    payload: MessageDeleteOptions,
  ): boolean;
  override applyMessageDeleteEvent(
    arg1: string | ChatMessageDeletedEventPayload,
    arg2?: string | MessageDeleteOptions,
    arg3?: MessageDeleteOptions,
  ): boolean {
    if (typeof arg1 === "string") {
      const conversationId = arg1.trim();
      const messageId = typeof arg2 === "string" ? arg2.trim() : "";
      if (!conversationId || !messageId) return false;
      const payload = (typeof arg2 === "string" ? arg3 : arg2) ?? {};
      const changed = super.applyMessageDeleteEvent(conversationId, messageId, payload);
      this.emitIf(changed);
      return changed;
    }
    const payload = arg1;
    const conversationId =
      typeof payload.conversationId === "string" ? payload.conversationId.trim() : "";
    const messageId = typeof payload.messageId === "string" ? payload.messageId.trim() : "";
    if (!conversationId || !messageId) return false;
    const deletePayload: MessageDeleteOptions = {};
    if (payload.participants !== undefined) {
      deletePayload.participants = payload.participants;
    }
    const changed = super.applyMessageDeleteEvent(conversationId, messageId, deletePayload);
    this.emitIf(changed);
    return changed;
  }

  override resetUnread(sessionId: string): boolean {
    const changed = super.resetUnread(sessionId);
    this.emitIf(changed);
    return changed;
  }

  override applyTypingEvent(payload: ChatTypingEventPayload): boolean {
    const changed = super.applyTypingEvent(payload);
    this.scheduleTypingSweep();
    this.emitIf(changed);
    return changed;
  }

  override updateFromFriends(friends: FriendItem[]): boolean {
    const changed = super.updateFromFriends(friends);
    this.emitIf(changed);
    return changed;
  }

  override prepareLocalMessage(
    conversationId: string,
    body: string,
    options?: { selfParticipant?: ChatParticipant | null; attachments?: ChatMessageAttachment[] },
  ) {
    const payload: PrepareLocalOptions = {
      selfIdentity: this.getSelfClientId() ?? this.getCurrentUserId(),
      now: this.clock,
    };
    if (options?.selfParticipant !== undefined) {
      payload.selfParticipant = options.selfParticipant;
    }
    if (options?.attachments !== undefined) {
      payload.attachments = options.attachments;
    }
    return super.prepareLocalMessage(conversationId, body, payload);
  }

  override startSession(
    descriptor: ChatSessionDescriptor,
    options?: { activate?: boolean },
  ) {
    const result = super.startSession(descriptor, options);
    this.emitIf(result.created || result.changed);
    return result;
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
