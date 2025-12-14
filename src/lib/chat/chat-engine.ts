"use client";

import type { FriendItem } from "@/hooks/useFriendsData";
import {
  createGroupConversationId,
  getChatConversationId,
  getChatDirectChannel,
  isGroupConversationId,
} from "@/lib/chat/channels";
import type { RealtimeEnvelope } from "@/lib/realtime/envelope";
import type {
  RealtimeAuthPayload,
  RealtimeClientFactory,
  RealtimeEvent,
  RealtimeSubscribeOptions,
} from "@/ports/realtime";
import type {
  ChatParticipant,
  ChatSession,
  ChatMessageEventPayload,
  ChatTypingEventPayload,
  ChatReactionEventPayload,
  ChatMessageUpdatedEventPayload,
  ChatMessageDeletedEventPayload,
  ChatMessageAttachment,
} from "@/components/providers/chat-store";
import type { ChatSessionEventPayload } from "@/lib/chat/events";
import { ChatStore } from "@/components/providers/chat-store";
import { normalizeParticipant } from "@/components/providers/chat-store/helpers";
import {
  addGroupParticipantsAction,
  createGroupConversationAction,
  deleteChatMessageAction,
  deleteGroupConversationAction,
  loadChatHistoryAction,
  loadChatInboxAction,
  renameGroupConversationAction,
  sendChatMessageAction,
  toggleChatReactionAction,
  updateChatMessageAttachmentsAction,
} from "@/services/chat/actions";
import type {
  ChatConversationDTO,
  ChatParticipantDTO,
  ChatReactionDTO,
} from "@/services/chat/schema";
import { RealtimeChatEventBus, type ChatEventBusConnection } from "@/lib/chat/event-bus";
import { ChatStoreReconciler } from "@/lib/chat/store-reconciler";

const DIRECT_CHANNEL_WATERMARK_PREFIX = "capsule:chat:watermark:direct:";
const TYPING_EVENT_REFRESH_MS = 2500;
const TYPING_EVENT_IDLE_TIMEOUT_MS = 5000;
const TYPING_EVENT_TTL_MS = 6000;
const TYPING_LOCAL_DEBOUNCE_MS = 400;
const RETRY_DELAY_MS = 250;
const RETRY_MAX_DELAY_MS = 1200;

type StartChatResult = {
  id: string;
  created: boolean;
};

type ConnectDependencies = {
  currentUserId: string | null;
  envelope: RealtimeEnvelope | null;
  factory: RealtimeClientFactory | null;
  requestToken: (envelope: RealtimeEnvelope) => Promise<RealtimeAuthPayload>;
};

type UserProfile = {
  id: string | null;
  name: string | null;
  email: string | null;
  avatarUrl: string | null;
};

export class ChatEngine {
  private readonly store: ChatStore;
  private readonly reconciler: ChatStoreReconciler;
  private clientChannelName: string | null = null;
  private eventBus: RealtimeChatEventBus | null = null;
  private connectPromise: Promise<ChatEventBusConnection> | null = null;
  private resolvedSelfClientId: string | null = null;
  private realtimeConnected = false;
  private supabaseUserId: string | null = null;
  private lastConnectOptions: ConnectDependencies | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectBackoffMs = 2000;
  private realtimeStatus: "disconnected" | "connecting" | "connected" | "degraded" = "disconnected";
  private statusListeners = new Set<
    (status: "disconnected" | "connecting" | "connected" | "degraded") => void
  >();
  private userProfile: UserProfile = { id: null, name: null, email: null, avatarUrl: null };
  private conversationHistoryLoaded = new Set<string>();
  private conversationHistoryLoading = new Map<string, Promise<void>>();
  private inboxLoaded = false;
  private inboxLoading: Promise<void> | null = null;
  private directChannelWatermarkKey: string | null = null;
  private directChannelWatermarkMs: number | null = null;
  private disableWatermarkPersistence = false;
  private typingStates = new Map<string, { active: boolean; lastSent: number; timeout: number | null }>();
  private typingNotifyAt = new Map<string, number>();

  constructor(store?: ChatStore) {
    this.store = store ?? new ChatStore();
    this.reconciler = new ChatStoreReconciler({
      store: this.store,
      resolveSession: (conversationId) => this.findSession(conversationId),
      isSelfUser: (userId) => this.isSelfUser(userId),
      onMessageCommitted: ({ message }) => {
        this.recordDirectChannelWatermarkFromIso(message.sentAt);
      },
    });
  }

  getStore(): ChatStore {
    return this.store;
  }

  hydrate(storage: Storage | Pick<Storage, "getItem" | "setItem" | "removeItem"> | null): void {
    this.store.setStorage(storage ?? null);
    this.store.hydrateFromStorage();
  }

  subscribe(listener: (snapshot: ReturnType<ChatStore["getSnapshot"]>) => void): () => void {
    return this.store.subscribe(listener);
  }

  getSnapshot(): ReturnType<ChatStore["getSnapshot"]> {
    return this.store.getSnapshot();
  }

  setUserProfile(profile: UserProfile): void {
    this.userProfile = profile;
    const activeSelfId = this.supabaseUserId ?? this.resolvedSelfClientId ?? profile.id ?? null;
    if (activeSelfId) {
      const participant = this.createSelfParticipant(activeSelfId);
      const aliases: string[] = [];
      if (profile.id && profile.id !== activeSelfId) {
        aliases.push(profile.id);
      }
      if (this.resolvedSelfClientId && this.resolvedSelfClientId !== activeSelfId) {
        aliases.push(this.resolvedSelfClientId);
      }
      this.store.applySelfParticipant(participant, aliases);
    } else if (profile.id) {
      const participant = this.createSelfParticipant(profile.id);
      this.store.applySelfParticipant(participant, [profile.id]);
    }
  }

  setFriends(friends: FriendItem[]): void {
    if (!Array.isArray(friends) || friends.length === 0) return;
    this.store.updateFromFriends(friends);
  }

  setSupabaseUserId(userId: string | null): void {
    const trimmed = typeof userId === "string" ? userId.trim() : "";
    const normalized = trimmed.length > 0 ? trimmed : null;
    if (this.supabaseUserId === normalized) return;
    this.resetInboxState();
    const previousSupabaseId = this.supabaseUserId;
    this.supabaseUserId = normalized;
    this.updateDirectChannelWatermarkContext(normalized);
    if (!normalized) {
      this.store.setCurrentUserId(null);
      return;
    }
    this.store.setCurrentUserId(normalized);
    const aliases: string[] = [];
    if (previousSupabaseId && previousSupabaseId !== normalized) {
      aliases.push(previousSupabaseId);
    }
    if (this.userProfile.id && this.userProfile.id !== normalized) {
      aliases.push(this.userProfile.id);
    }
    if (this.resolvedSelfClientId && this.resolvedSelfClientId !== normalized) {
      aliases.push(this.resolvedSelfClientId);
    }
    const participant = this.createSelfParticipant(normalized);
    this.store.applySelfParticipant(participant, aliases);
  }

  getSelfClientId(): string | null {
    return this.resolvedSelfClientId;
  }

  async connectRealtime(options: ConnectDependencies): Promise<void> {
    this.lastConnectOptions = options;
    this.setRealtimeStatus("connecting");
    const sameIdentity = Boolean(
      options.currentUserId &&
        this.supabaseUserId &&
        options.currentUserId.trim() === this.supabaseUserId.trim(),
    );
    if (this.realtimeConnected && sameIdentity && this.eventBus) {
      return;
    }
    if (!sameIdentity) {
      await this.disconnectRealtime();
    } else if (this.eventBus) {
      // preserve store state when we only need to re-establish the wire.
      await this.disconnectRealtime({ preserveData: true });
    }
    this.realtimeConnected = false;
    if (!options.currentUserId || !options.envelope || !options.factory) {
      this.resolvedSelfClientId = null;
      this.store.setSelfClientId(null);
      this.setRealtimeStatus("disconnected");
      return;
    }
    const eventBus = new RealtimeChatEventBus();
    const connectOperation = eventBus.connect(
      {
        envelope: options.envelope,
        factory: options.factory,
        requestToken: options.requestToken,
        subscribeOptions: this.buildDirectChannelSubscribeOptions(),
        channelResolver: (clientId) => getChatDirectChannel(clientId),
        onConnectionLost: () => {
          const factory = options.factory;
          if (factory) {
            try {
              factory.reset();
            } catch {
              // ignore reset failures; we'll still attempt reconnect
            }
          }
          this.realtimeConnected = false;
          this.setRealtimeStatus("degraded");
          this.scheduleReconnect();
        },
      },
      (event) => {
        this.handleRealtimeEvent(event);
      },
    );
    this.connectPromise = connectOperation;
    try {
      const connection = await connectOperation;
      if (this.connectPromise === connectOperation) {
        this.connectPromise = null;
      }
      this.eventBus = eventBus;
      this.resolvedSelfClientId = connection.clientId;
      this.setSupabaseUserId(connection.clientId);
      this.store.setSelfClientId(connection.clientId);
      this.clientChannelName = connection.channelName;
      this.realtimeConnected = true;
      this.reconnectBackoffMs = 2000;
      this.setRealtimeStatus("connected");
    } catch (error) {
      if (this.connectPromise === connectOperation) {
        this.connectPromise = null;
      }
      console.error("ChatEngine connect failed", error);
      await eventBus.disconnect();
      if (this.eventBus === eventBus) {
        this.eventBus = null;
      }
      this.resolvedSelfClientId = null;
      this.store.setSelfClientId(null);
      this.realtimeConnected = false;
      this.setRealtimeStatus("degraded");
      this.scheduleReconnect();
    }
  }

  async disconnectRealtime(options: { preserveData?: boolean } = {}): Promise<void> {
    await this.waitForPendingConnect();
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.eventBus) {
      try {
        await this.eventBus.disconnect();
      } catch (error) {
        console.error("ChatEngine disconnect error", error);
      }
    }
    this.eventBus = null;
    this.clientChannelName = null;
    this.realtimeConnected = false;
    this.setRealtimeStatus("disconnected");
    if (!options.preserveData) {
      this.resolvedSelfClientId = null;
      this.store.setSelfClientId(null);
      this.resetInboxState();
    }
    this.resetTypingState();
  }

  startDirectChat(
    target: ChatParticipant,
    options?: { activate?: boolean },
  ): StartChatResult | null {
    const selfId = this.resolveSelfId();
    if (!selfId) {
      console.warn("ChatEngine startDirectChat requires a user id");
      return null;
    }
    if (!target?.id) return null;
    const conversationId = getChatConversationId(selfId, target.id);
    const selfParticipant = this.buildSelfParticipant(selfId);
    const descriptor = {
      id: conversationId,
      type: "direct" as const,
      title: target.name || target.id,
      avatar: target.avatar ?? null,
      createdBy: null,
      participants: selfParticipant ? [target, selfParticipant] : [target],
    };
    const { created } = this.store.startSession(descriptor, {
      activate: options?.activate ?? true,
    });
    if (options?.activate ?? true) {
      this.store.resetUnread(conversationId);
    }
    void this.ensureConversationHistory(conversationId);
    return { id: conversationId, created };
  }

  async startGroupChat(
    participants: ChatParticipant[],
    name: string | undefined,
    options?: { activate?: boolean },
  ): Promise<StartChatResult | null> {
    const selfId =
      this.supabaseUserId ?? this.resolvedSelfClientId ?? this.store.getCurrentUserId();
    if (!selfId) {
      console.warn("ChatEngine startGroupChat requires a user id");
      return null;
    }
    const unique = new Map<string, ChatParticipant>();
    participants.forEach((participant) => {
      if (participant?.id) {
        unique.set(participant.id, participant);
      }
    });
    if (!unique.size) {
      console.warn("ChatEngine startGroupChat requires participants");
      return null;
    }
    const conversationId = createGroupConversationId();
    const participantList = Array.from(unique.values());
    const participantIds = participantList.map((p) => p.id);

    try {
      const result = await createGroupConversationAction({
        conversationId,
        participantIds,
        title: name?.trim() ?? "",
      });
      const descriptor = {
        id: result.conversationId,
        type: result.session.type,
        title: result.session.title,
        avatar: result.session.avatar,
        createdBy: result.session.createdBy,
        participants: result.participants.map((participant) => ({
          id: participant.id,
          name: participant.name,
          avatar: participant.avatar ?? null,
        })),
      } as const;
      this.store.startSession(descriptor, { activate: options?.activate ?? true });
      await this.publishSessionUpdate(descriptor.id);
      return { id: descriptor.id, created: true };
    } catch (error) {
      console.error("ChatEngine startGroupChat error", error);
      // fall back to local-only session so the UI still proceeds
      const selfParticipant = this.buildSelfParticipant(selfId) ?? {
        id: selfId,
        name: this.userProfile.name ?? selfId,
        avatar: this.userProfile.avatarUrl ?? null,
      };
      const descriptor = {
        id: conversationId,
        type: "group" as const,
        title: name?.trim() ?? "",
        avatar: null,
        createdBy: selfId,
        participants: [...participantList, selfParticipant],
      };
      this.store.startSession(descriptor, { activate: options?.activate ?? true });
      await this.publishSessionUpdate(conversationId);
      return { id: conversationId, created: true };
    }
  }

  async addParticipantsToGroup(conversationId: string, targets: ChatParticipant[]): Promise<void> {
    if (!targets?.length) return;
    const session = this.findSession(conversationId);
    if (!session) {
      throw new Error("Chat session not found.");
    }
    if (session.type !== "group") {
      throw new Error("Only group chats can accept additional participants.");
    }
    const ids = targets.map((t) => t.id).filter(Boolean);
    const participantsDto = await addGroupParticipantsAction({
      conversationId: session.id,
      participantIds: ids,
    });
    const participants = participantsDto.map((participant) => ({
      id: participant.id,
      name: participant.name,
      avatar: participant.avatar ?? null,
    }));
    const descriptor = {
      id: session.id,
      type: session.type,
      title: session.title,
      avatar: session.avatar,
      createdBy: session.createdBy ?? null,
      participants,
    };
    this.store.startSession(descriptor);
    await this.publishSessionUpdate(conversationId);
  }

  async renameGroupChat(conversationId: string, name: string): Promise<void> {
    const session = this.findSession(conversationId);
    if (!session) {
      throw new Error("Chat session not found.");
    }
    const trimmed = name.trim();
    await renameGroupConversationAction({ conversationId, title: trimmed });
    const descriptor = {
      id: session.id,
      type: session.type,
      title: trimmed,
      avatar: session.avatar,
      createdBy: session.createdBy ?? null,
      participants: session.participants,
    };
    this.store.startSession(descriptor);
    await this.publishSessionUpdate(conversationId);
  }

  openSession(sessionId: string): void {
    this.store.setActiveSession(sessionId);
    this.store.resetUnread(sessionId);
    void this.ensureConversationHistory(sessionId);
  }

  closeSession(): void {
    this.store.setActiveSession(null);
  }

  deleteSession(sessionId: string): void {
    this.store.deleteSession(sessionId);
    this.conversationHistoryLoaded.delete(sessionId);
    this.conversationHistoryLoading.delete(sessionId);
  }

  async sendMessage(
    conversationId: string,
    input: { body: string; attachments?: ChatMessageAttachment[] },
  ): Promise<void> {
    const rawBody = typeof input?.body === "string" ? input.body : "";
    const attachments = Array.isArray(input?.attachments) ? input.attachments : [];
    const selfIdentity = this.resolveSelfId();
    if (!selfIdentity) {
      throw new Error("Chat identity is not ready yet.");
    }
    const selfParticipant =
      this.buildSelfParticipant() ?? ({
        id: selfIdentity,
        name: this.userProfile.name ?? this.userProfile.email ?? selfIdentity,
        avatar: this.userProfile.avatarUrl ?? null,
      } satisfies ChatParticipant);
    let effectiveConversationId = conversationId;
    const prepared = this.store.prepareLocalMessage(effectiveConversationId, rawBody, {
      selfParticipant,
      attachments,
    });
    if (!prepared) return;
    const { message } = prepared;
    void this.ensureConversationHistory(effectiveConversationId);

    try {
      const attachmentDtos =
        message.attachments.length > 0
          ? message.attachments.map((attachment) => ({
              id: attachment.id,
              name: attachment.name,
              mimeType: attachment.mimeType,
              size: attachment.size,
              url: attachment.url,
              thumbnailUrl: attachment.thumbnailUrl ?? null,
              storageKey: attachment.storageKey ?? null,
              sessionId: attachment.sessionId ?? null,
            }))
          : [];

      const result = await sendChatMessageAction({
        conversationId,
        messageId: message.id,
        body: message.body,
        clientSentAt: message.sentAt,
        attachments: attachmentDtos,
      });

      const responseConversationId =
        (result.message?.conversationId?.trim() ?? "") || effectiveConversationId;
      if (responseConversationId && responseConversationId !== effectiveConversationId) {
        this.handleConversationRemap(effectiveConversationId, responseConversationId);
        effectiveConversationId = responseConversationId;
      }

      if (Array.isArray(result.participants) && result.participants.length) {
        this.reconciler.applyParticipants(effectiveConversationId, result.participants);
      }

      if (result?.message && typeof result.message.id === "string") {
        const reactionDescriptors = this.reconciler.normalizeReactionsFromDto(
          result.message.reactions,
        );
        const acknowledgedAttachments = this.reconciler.normalizeAttachmentsFromDto(
          result.message.attachments,
        );
        this.store.acknowledgeMessage(effectiveConversationId, message.id, {
          id: result.message.id,
          authorId: result.message.senderId,
          body: result.message.body,
          sentAt: result.message.sentAt,
          reactions: reactionDescriptors,
          attachments: acknowledgedAttachments,
          taskId: result.message.taskId ?? null,
          taskTitle: result.message.taskTitle ?? null,
        });
        this.recordDirectChannelWatermarkFromIso(result.message.sentAt);
      } else {
        this.store.markMessageStatus(effectiveConversationId, message.id, "sent");
      }
      this.stopTyping(effectiveConversationId, true);
    } catch (error) {
      this.store.markMessageStatus(effectiveConversationId, message.id, "failed");
      throw error;
    }
  }

  async toggleMessageReaction(
    conversationId: string,
    messageId: string,
    emoji: string,
  ): Promise<void> {
    const trimmedEmoji = typeof emoji === "string" ? emoji.trim() : "";
    if (!trimmedEmoji) return;
    let snapshot = this.store.getSnapshot();
    let session = snapshot.sessions.find((item) => item.id === conversationId) ?? null;
    if (!session) {
      await this.ensureConversationHistory(conversationId);
      snapshot = this.store.getSnapshot();
      session = snapshot.sessions.find((item) => item.id === conversationId) ?? null;
    }
    if (!session) {
      throw new Error("Unable to locate conversation for reaction.");
    }
    let message =
      session.messages.find((item) => item.id === messageId) ?? null;
    if (!message) {
      await this.ensureConversationHistory(conversationId);
      snapshot = this.store.getSnapshot();
      session = snapshot.sessions.find((item) => item.id === conversationId) ?? session;
      message = session?.messages.find((item) => item.id === messageId) ?? null;
    }
    if (!message) {
      throw new Error("Unable to locate message for reaction.");
    }
    const hasSelf = message.reactions.some(
      (reaction) =>
        reaction.emoji === trimmedEmoji &&
        reaction.users.some((user) => this.isSelfUser(user.id)),
    );
    const action: "add" | "remove" = hasSelf ? "remove" : "add";
    await this.mutateReaction(conversationId, messageId, trimmedEmoji, action, session);
  }

  private async mutateReaction(
    conversationId: string,
    messageId: string,
    emoji: string,
    action: "add" | "remove",
    session: ChatSession,
  ): Promise<void> {
    const result = await toggleChatReactionAction({
      conversationId,
      messageId,
      emoji,
      action,
    });

    const resolvedConversationId =
      (result?.conversationId?.trim() ?? "") || conversationId;
    if (resolvedConversationId && resolvedConversationId !== conversationId) {
      this.handleConversationRemap(conversationId, resolvedConversationId);
    }
    const latestSnapshot = this.store.getSnapshot();
    const targetSession =
      latestSnapshot.sessions.find((item) => item.id === resolvedConversationId) ?? session;

    const fallbackSelfId =
      this.resolveSelfId() ??
      this.supabaseUserId ??
      this.resolvedSelfClientId ??
      this.userProfile.id ??
      null;
    const actor =
      this.buildSelfParticipant(fallbackSelfId) ??
      (fallbackSelfId ? this.createSelfParticipant(fallbackSelfId) : null);
    if (!actor) {
      throw new Error("Chat identity is not ready yet.");
    }

    const reactionEntries =
      Array.isArray(result.reactions) && result.reactions.length > 0
        ? result.reactions.map((reaction: ChatReactionDTO) => ({
            emoji: reaction.emoji,
            users: Array.isArray(reaction.users)
              ? reaction.users.map((user: ChatParticipantDTO) => ({
                  id: user.id,
                  name: user.name || user.id,
                  avatar: user.avatar ?? null,
                }))
              : [],
          }))
        : [];

    const eventPayload: ChatReactionEventPayload = {
      type: "chat.reaction",
      conversationId: resolvedConversationId,
      messageId: result.messageId || messageId,
      emoji: result.emoji || emoji,
      action: result.action,
      actor,
      reactions: reactionEntries,
      participants: targetSession.participants.map((participant) => ({ ...participant })),
    };

    this.store.applyReactionEvent(eventPayload);
  }

  notifyTyping(conversationId: string, typing: boolean): void {
    const trimmed = typeof conversationId === "string" ? conversationId.trim() : "";
    if (!trimmed) return;
    if (typing) {
      const now = Date.now();
      const last = this.typingNotifyAt.get(trimmed) ?? 0;
      if (now - last < TYPING_LOCAL_DEBOUNCE_MS) {
        return;
      }
      this.typingNotifyAt.set(trimmed, now);
    } else {
      this.typingNotifyAt.delete(trimmed);
    }
    if (typing) {
      this.beginTyping(trimmed);
    } else {
      this.stopTyping(trimmed, true);
    }
  }

  private buildDirectChannelSubscribeOptions(): RealtimeSubscribeOptions | undefined {
    const params: Record<string, string> = {};
    const now = Date.now();
    if (Number.isFinite(this.directChannelWatermarkMs) && this.directChannelWatermarkMs) {
      const rawStart = Math.max(0, Math.trunc(this.directChannelWatermarkMs - 1000));
      const maxWindowMs = 2 * 60 * 1000;
      const clampedStart = Math.min(rawStart, Math.max(0, now - maxWindowMs));
      if (clampedStart > 0 && clampedStart >= now - maxWindowMs) {
        params.start = String(clampedStart);
      }
    }
    if (!params.start) {
      params.rewind = "2m";
    }
    return Object.keys(params).length ? { params } : undefined;
  }

  private updateDirectChannelWatermarkContext(userId: string | null): void {
    if (typeof window === "undefined") {
      this.directChannelWatermarkKey = null;
      this.directChannelWatermarkMs = null;
      return;
    }
    if (!userId) {
      this.directChannelWatermarkKey = null;
      this.directChannelWatermarkMs = null;
      return;
    }
    this.disableWatermarkPersistence = false;
    const key = `${DIRECT_CHANNEL_WATERMARK_PREFIX}${userId}`;
    this.directChannelWatermarkKey = key;
    try {
      const stored = window.localStorage.getItem(key);
      if (!stored) {
        this.directChannelWatermarkMs = null;
        return;
      }
      const parsed = Number.parseInt(stored, 10);
      this.directChannelWatermarkMs = Number.isFinite(parsed) ? parsed : null;
    } catch {
      this.directChannelWatermarkMs = null;
    }
  }

  private beginTyping(conversationId: string): void {
    const now = Date.now();
    const existing =
      this.typingStates.get(conversationId) ?? { active: false, lastSent: 0, timeout: null };
    const shouldSend = !existing.active || now - existing.lastSent >= TYPING_EVENT_REFRESH_MS;
    if (shouldSend) {
      existing.lastSent = now;
      void this.publishTypingEvent(conversationId, true);
    }
    existing.active = true;
    if (existing.timeout && typeof window !== "undefined") {
      window.clearTimeout(existing.timeout);
    }
    if (typeof window !== "undefined") {
      existing.timeout = window.setTimeout(() => {
        this.stopTyping(conversationId, true);
      }, TYPING_EVENT_IDLE_TIMEOUT_MS);
    } else {
      existing.timeout = null;
    }
    this.typingStates.set(conversationId, existing);
  }

  private stopTyping(conversationId: string, publish: boolean): void {
    const existing = this.typingStates.get(conversationId);
    if (existing?.timeout && typeof window !== "undefined") {
      window.clearTimeout(existing.timeout);
    }
    if (!existing) {
      if (publish) {
        void this.publishTypingEvent(conversationId, false);
      }
      return;
    }
    this.typingStates.delete(conversationId);
    if (publish && existing.active) {
      void this.publishTypingEvent(conversationId, false);
    }
  }

  private async waitForPendingConnect(): Promise<void> {
    const pending = this.connectPromise;
    if (!pending) return;
    try {
      await pending;
    } catch {
      // ignore failures from superseded attempts
    } finally {
      if (this.connectPromise === pending) {
        this.connectPromise = null;
      }
    }
  }

  private resetTypingState(): void {
    if (typeof window !== "undefined") {
      this.typingStates.forEach((state) => {
        if (state.timeout) {
          window.clearTimeout(state.timeout);
        }
      });
    }
    this.typingStates.clear();
    this.typingNotifyAt.clear();
  }

  isRealtimeConnected(): boolean {
    return this.realtimeConnected;
  }

  private async publishTypingEvent(conversationId: string, typing: boolean): Promise<void> {
    const eventBus = this.eventBus;
    if (!eventBus) return;
    const session = this.findSession(conversationId);
    if (!session) return;
    const selfId = this.resolveSelfId();
    if (!selfId) return;
    const sender =
      this.buildSelfParticipant(selfId) ?? this.createSelfParticipant(selfId) ?? null;
    if (!sender) return;
    const payload: ChatTypingEventPayload = {
      type: "chat.typing",
      conversationId: session.id,
      senderId: sender.id,
      sender,
      typing,
      participants: session.participants.map((participant) => ({ ...participant })),
      expiresAt: new Date(Date.now() + TYPING_EVENT_TTL_MS).toISOString(),
    };
    const channels = new Set<string>();
    const senderNormalized = sender.id.trim().toLowerCase();
    session.participants.forEach((participant) => {
      if (!participant || !participant.id) return;
      const participantId = participant.id.trim();
      if (!participantId) return;
      if (participantId.trim().toLowerCase() === senderNormalized) return;
      try {
        channels.add(getChatDirectChannel(participantId));
      } catch {
        // ignore invalid participant ids
      }
    });
    if (this.clientChannelName) {
      channels.add(this.clientChannelName);
    }
    if (!channels.size) return;
    await eventBus.publishToChannels(channels, "chat.typing", payload);
  }

  private persistDirectChannelWatermark(): void {
    if (typeof window === "undefined") return;
    const key = this.directChannelWatermarkKey;
    if (!key) return;
    if (this.directChannelWatermarkMs === null) {
      try {
        if (!this.disableWatermarkPersistence) {
          window.localStorage.removeItem(key);
        }
      } catch {
        this.disableWatermarkPersistence = true;
      }
      return;
    }
    try {
      if (!this.disableWatermarkPersistence) {
        window.localStorage.setItem(key, String(this.directChannelWatermarkMs));
      }
    } catch {
      this.disableWatermarkPersistence = true;
    }
  }

  private recordDirectChannelWatermark(timestampMs: number | null | undefined): void {
    if (!Number.isFinite(timestampMs) || !timestampMs) return;
    if (this.directChannelWatermarkMs && timestampMs <= this.directChannelWatermarkMs) return;
    this.directChannelWatermarkMs = timestampMs;
    this.persistDirectChannelWatermark();
  }

  private recordDirectChannelWatermarkFromIso(sentAt: string | null | undefined): void {
    if (typeof sentAt !== "string" || !sentAt.trim()) return;
    const parsed = Date.parse(sentAt);
    if (Number.isNaN(parsed)) return;
    this.recordDirectChannelWatermark(parsed);
  }

  private applyParticipantsFromDto(
    conversationId: string,
    participants: ChatParticipantDTO[],
  ): void {
    if (!Array.isArray(participants) || participants.length === 0) return;
    const existingSession = this.findSession(conversationId);
    const descriptor = {
      id: conversationId,
      type:
        existingSession?.type ??
        (isGroupConversationId(conversationId) ? ("group" as const) : ("direct" as const)),
      title: existingSession?.title ?? "",
      avatar: existingSession?.avatar ?? null,
      createdBy: existingSession?.createdBy ?? null,
      participants: participants.map((participant) => ({
        id: participant.id,
        name: participant.name || participant.id,
        avatar: participant.avatar ?? null,
      })),
    };
    this.store.applySessionEvent(descriptor);
  }

  private isSelfUser(userId: string | null | undefined): boolean {
    if (!userId) return false;
    const trimmed = userId.trim();
    if (!trimmed) return false;
    if (this.supabaseUserId && this.supabaseUserId === trimmed) return true;
    if (this.resolvedSelfClientId && this.resolvedSelfClientId === trimmed) return true;
    return false;
  }

  private ensureConversationHistory(
    conversationId: string,
    options: { force?: boolean } = {},
  ): Promise<void> {
    const normalizedId = typeof conversationId === "string" ? conversationId.trim() : "";
    if (!normalizedId) return Promise.resolve();
    if (this.conversationHistoryLoaded.has(normalizedId) && !options.force) {
      return Promise.resolve();
    }
    const existing = this.conversationHistoryLoading.get(normalizedId);
    if (existing) return existing;
    const promise = this.retryWithBackoff(async () => this.loadConversationHistory(normalizedId))
      .catch((error) => {
        console.error("chat history load error", { conversationId: normalizedId, error });
        this.setRealtimeStatus("degraded");
      })
      .finally(() => {
        this.conversationHistoryLoading.delete(normalizedId);
      });
    this.conversationHistoryLoading.set(normalizedId, promise);
    return promise;
  }

  async refreshConversationHistory(conversationId: string): Promise<void> {
    await this.ensureConversationHistory(conversationId, { force: true });
  }

  async bootstrapInbox(): Promise<void> {
    await this.bootstrapInboxWithOptions({ force: false });
  }

  async refreshInbox(): Promise<void> {
    await this.bootstrapInboxWithOptions({ force: true });
  }

  private async bootstrapInboxWithOptions(options: { force: boolean }): Promise<void> {
    if (this.inboxLoaded && !options.force) return;
    if (this.inboxLoading) {
      await this.inboxLoading;
      return;
    }
    const selfId = this.resolveSelfId();
    if (!selfId) return;
    const promise = this.retryWithBackoff(async () => this.loadInbox())
      .catch((error) => {
        console.error("chat inbox load error", error);
        this.setRealtimeStatus("degraded");
      })
      .finally(() => {
        this.inboxLoading = null;
      });
    this.inboxLoading = promise;
    await promise;
  }

  private async loadInbox(): Promise<void> {
    const data = await loadChatInboxAction(50);
    if (!data?.conversations?.length) {
      this.inboxLoaded = true;
      return;
    }
    data.conversations.forEach((conversation: ChatConversationDTO) => {
      const participants = (conversation.participants ?? [])
        .map((participant) => ({
          id: participant.id,
          name: participant.name,
          avatar: participant.avatar ?? null,
        }))
        .filter((participant): participant is ChatParticipant => Boolean(participant.id));
      if (!participants.length) return;
      const descriptor = {
        id: conversation.conversationId,
        type: conversation.session?.type ?? "direct",
        title: conversation.session?.title ?? "",
        avatar: conversation.session?.avatar ?? null,
        createdBy: conversation.session?.createdBy ?? null,
        participants,
      };
      this.store.startSession(descriptor);
      const lastMessage = conversation.lastMessage;
      if (lastMessage && typeof lastMessage.id === "string" && typeof lastMessage.sentAt === "string") {
        const sanitized =
          typeof lastMessage.body === "string" ? lastMessage.body.replace(/\s+/g, " ").trim() : "";
        const attachments = this.reconciler.normalizeAttachmentsFromDto(lastMessage.attachments);
        if (sanitized || attachments.length > 0) {
          const reactions = this.reconciler.normalizeReactionsFromDto(lastMessage.reactions);
          const chatMessage = {
            id: lastMessage.id,
            authorId: lastMessage.senderId,
            body: sanitized,
            sentAt: lastMessage.sentAt,
            status: "sent" as const,
            reactions,
            attachments,
            taskId: lastMessage.taskId ?? null,
            taskTitle: lastMessage.taskTitle ?? null,
          };
          const isLocal = this.isSelfUser(chatMessage.authorId);
          this.store.addMessage(descriptor.id, chatMessage, { isLocal });
          this.recordDirectChannelWatermarkFromIso(chatMessage.sentAt);
        }
      }
    });
    this.inboxLoaded = true;
  }

  private resetInboxState() {
    this.inboxLoaded = false;
    this.inboxLoading = null;
    this.conversationHistoryLoaded.clear();
    this.conversationHistoryLoading.clear();
  }

  private async loadConversationHistory(conversationId: string): Promise<void> {
    const data = await loadChatHistoryAction({
      conversationId,
      limit: 50,
    });
    const resolvedId =
      (typeof data.conversationId === "string" && data.conversationId.trim().length
        ? data.conversationId.trim()
        : conversationId) || conversationId;
    if (resolvedId !== conversationId) {
      this.handleConversationRemap(conversationId, resolvedId);
    }
    if (Array.isArray(data.participants) && data.participants.length) {
      this.reconciler.applyParticipants(resolvedId, data.participants);
    }
    (data.messages ?? []).forEach((message) => {
      this.reconciler.upsertMessage(resolvedId, message);
    });
    this.conversationHistoryLoaded.add(resolvedId);
    if (resolvedId !== conversationId) {
      this.conversationHistoryLoaded.delete(conversationId);
    }
  }

  dispatchRealtimeEvent(event: RealtimeEvent): void {
    this.handleRealtimeEvent(event);
  }

  private findSession(conversationId: string): ChatSession | null {
    return this.store.getSnapshot().sessions.find((item) => item.id === conversationId) ?? null;
  }

  private handleConversationRemap(oldId: string, newId: string): void {
    if (!oldId || !newId || oldId === newId) return;
    this.store.remapSessionId(oldId, newId);
    if (this.conversationHistoryLoaded.delete(oldId)) {
      this.conversationHistoryLoaded.add(newId);
    }
  }

  private async publishSessionUpdate(conversationId: string): Promise<void> {
    const eventBus = this.eventBus;
    if (!eventBus) {
      console.warn("Chat connection is not ready yet.");
      return;
    }
    const session = this.findSession(conversationId);
    if (!session) return;
    const descriptor = {
      id: session.id,
      type: session.type,
      title: session.title,
      avatar: session.avatar,
      createdBy: session.createdBy ?? null,
      participants: session.participants.map((participant) => ({ ...participant })),
    };
    const payload: ChatSessionEventPayload = {
      type: "chat.session",
      conversationId: session.id,
      session: descriptor,
    };
    const channels = new Set<string>();
    descriptor.participants.forEach((participant) => {
      try {
        channels.add(getChatDirectChannel(participant.id));
      } catch {
        // ignore invalid participant id
      }
    });
    if (this.clientChannelName) {
      channels.add(this.clientChannelName);
    }
    await eventBus.publishToChannels(channels, "chat.session", payload);
  }

  private handleRealtimeEvent(event: RealtimeEvent): void {
    if (!event) return;
    if (event.name === "chat.session") {
      const payload = event.data as ChatSessionEventPayload;
      if (!payload || payload.type !== "chat.session") return;
      if (typeof payload.conversationId !== "string" || !payload.session) return;
      const participants = Array.isArray(payload.session.participants)
        ? payload.session.participants
        : [];
      const normalizedParticipants = participants
        .map((participant) => normalizeParticipant(participant))
        .filter((participant): participant is ChatParticipant => Boolean(participant));
      if (!normalizedParticipants.length) return;
      const descriptor = {
        id: payload.conversationId,
        type:
          payload.session.type ??
          (isGroupConversationId(payload.conversationId) ? "group" : "direct"),
        title: payload.session.title ?? "",
        avatar: payload.session.avatar ?? null,
        createdBy: payload.session.createdBy ?? null,
        participants: normalizedParticipants,
      };
      this.store.applySessionEvent(descriptor);
      return;
    }
    if (event.name === "chat.typing") {
      const payload = event.data as ChatTypingEventPayload;
      this.store.applyTypingEvent(payload);
      return;
    }
    if (event.name === "chat.session.deleted") {
    const payload = event.data as { type?: string; conversationId?: string };
    const conversationId = payload?.conversationId;
    if (typeof conversationId === "string" && conversationId.trim()) {
      const trimmed = conversationId.trim();
      const active = this.store.getSnapshot().activeSessionId;
      this.deleteSession(trimmed);
      if (active === trimmed) {
        this.closeSession();
      }
    }
    return;
  }
  if (event.name === "chat.reaction") {
    const payload = event.data as ChatReactionEventPayload;
    if (!payload || payload.type !== "chat.reaction") return;
    this.store.applyReactionEvent(payload);
    return;
  }
  if (event.name === "chat.message.update") {
    const payload = event.data as ChatMessageUpdatedEventPayload;
    if (!payload || payload.type !== "chat.message.update") return;
    this.store.applyMessageUpdateEvent(payload);
    return;
  }
  if (event.name === "chat.message.delete") {
    const payload = event.data as ChatMessageDeletedEventPayload;
    if (!payload || payload.type !== "chat.message.delete") return;
    this.store.applyMessageDeleteEvent(payload);
    return;
  }
  if (event.name !== "chat.message") return;
  const payload = event.data as ChatMessageEventPayload;
  this.store.applyMessageEvent(payload);
  if (payload?.message?.sentAt) {
    this.recordDirectChannelWatermarkFromIso(payload.message.sentAt);
  }
  if (
    payload &&
    typeof payload.conversationId === "string" &&
    !this.conversationHistoryLoaded.has(payload.conversationId)
  ) {
    void this.ensureConversationHistory(payload.conversationId);
  }
}

  private resolveSelfId(preferred?: string | null): string | null {
    const candidates = [
      preferred,
      this.supabaseUserId,
      this.resolvedSelfClientId,
      this.store.getCurrentUserId(),
      this.userProfile.id,
    ];
    for (const candidate of candidates) {
      if (typeof candidate !== "string") continue;
      const trimmed = candidate.trim();
      if (trimmed) return trimmed;
    }
    return null;
  }

  private buildSelfParticipant(preferredId?: string | null): ChatParticipant | null {
    const primary = this.resolveSelfId(preferredId);
    if (!primary) return null;
    return this.createSelfParticipant(primary);
  }

  private createSelfParticipant(userId: string): ChatParticipant {
    const trimmed = userId.trim();
    const name = this.userProfile.name ?? this.userProfile.email ?? trimmed;
    const avatar = this.userProfile.avatarUrl ?? null;
    return { id: trimmed, name, avatar };
  }

  async deleteGroupConversation(conversationId: string): Promise<void> {
    const trimmed = conversationId.trim();
    if (!trimmed) return;
    try {
      await deleteGroupConversationAction(trimmed);
    } catch (error) {
      console.error("ChatEngine deleteGroupConversation error", error);
      throw error;
    }
    this.deleteSession(trimmed);
  }

  async updateMessageAttachments(
    conversationId: string,
    messageId: string,
    attachmentIds: string[],
  ): Promise<void> {
    const trimmedMessageId = typeof messageId === "string" ? messageId.trim() : "";
    if (!trimmedMessageId || !attachmentIds.length) return;
    try {
      const result = await updateChatMessageAttachmentsAction({
        conversationId,
        messageId: trimmedMessageId,
        removeAttachmentIds: attachmentIds,
      });
      const participants = result.participants.map((participant) => ({
        id: participant.id,
        name: participant.name,
        avatar: participant.avatar ?? null,
      }));
      const attachments = this.reconciler.normalizeAttachmentsFromDto(result.message.attachments);
      this.store.applyMessageUpdateEvent({
        type: "chat.message.update",
        conversationId: result.message.conversationId,
        messageId: result.message.id,
        body: result.message.body,
        attachments,
        participants,
        senderId: result.message.senderId,
        sentAt: result.message.sentAt,
        taskId: result.message.taskId ?? null,
        taskTitle: result.message.taskTitle ?? null,
      });
    } catch (error) {
      console.error("ChatEngine updateMessageAttachments error", error);
      throw error;
    }
  }

  async deleteMessage(conversationId: string, messageId: string): Promise<void> {
    const trimmedMessageId = typeof messageId === "string" ? messageId.trim() : "";
    if (!trimmedMessageId) return;
    try {
      const result = await deleteChatMessageAction({
        conversationId,
        messageId: trimmedMessageId,
      });
      const resolvedConversationId =
        (result?.conversationId?.trim() ?? "") || conversationId;
      if (resolvedConversationId && resolvedConversationId !== conversationId) {
        this.handleConversationRemap(conversationId, resolvedConversationId);
      }
      const participants = Array.isArray(result.participants)
        ? result.participants.map((participant) => ({
            id: participant.id,
            name: participant.name,
            avatar: participant.avatar ?? null,
          }))
        : undefined;
      const eventPayload = {
        type: "chat.message.delete" as const,
        conversationId: resolvedConversationId,
        messageId: result.messageId || trimmedMessageId,
        ...(participants ? { participants } : {}),
      };
      this.store.applyMessageDeleteEvent(eventPayload);
    } catch (error) {
      console.error("ChatEngine deleteMessage error", error);
      throw error;
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) return;
    const options = this.lastConnectOptions;
    if (!options || !options.currentUserId || !options.envelope || !options.factory) {
      return;
    }
    const delay = this.reconnectBackoffMs;
    this.reconnectBackoffMs = Math.min(this.reconnectBackoffMs * 2, 15000);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      void this.connectRealtime(options);
    }, delay);
  }

  onStatusChange(listener: (status: typeof this.realtimeStatus) => void): () => void {
    this.statusListeners.add(listener);
    listener(this.realtimeStatus);
    return () => {
      this.statusListeners.delete(listener);
    };
  }

  getRealtimeStatus(): typeof this.realtimeStatus {
    return this.realtimeStatus;
  }

  private setRealtimeStatus(status: typeof this.realtimeStatus): void {
    if (this.realtimeStatus === status) return;
    this.realtimeStatus = status;
    this.statusListeners.forEach((listener) => {
      try {
        listener(status);
      } catch {
        // ignore listener errors
      }
    });
  }

  private async retryWithBackoff<T>(fn: () => Promise<T>, attempts = 2): Promise<T> {
    let lastError: unknown = null;
    let delay = RETRY_DELAY_MS;
    for (let i = 0; i < attempts; i += 1) {
      try {
        return await fn();
      } catch (error) {
        lastError = error;
        if (i === attempts - 1) break;
        await new Promise((resolve) => setTimeout(resolve, delay));
        delay = Math.min(delay * 2, RETRY_MAX_DELAY_MS);
      }
    }
    throw lastError ?? new Error("retry failed");
  }
}
