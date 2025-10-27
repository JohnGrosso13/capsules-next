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
  RealtimeClient,
  RealtimeClientFactory,
  RealtimeEvent,
  RealtimeSubscribeOptions,
} from "@/ports/realtime";
import type {
  ChatParticipant,
  ChatSession,
  ChatSessionEventPayload,
  ChatMessageEventPayload,
  ChatTypingEventPayload,
  ChatReactionEventPayload,
  ChatMessageUpdatedEventPayload,
  ChatMessageDeletedEventPayload,
  ChatMessageReaction,
  ChatMessageAttachment,
} from "@/components/providers/chat-store";
import { ChatStore } from "@/components/providers/chat-store";

const DIRECT_CHANNEL_WATERMARK_PREFIX = "capsule:chat:watermark:direct:";
const TYPING_EVENT_REFRESH_MS = 2500;
const TYPING_EVENT_IDLE_TIMEOUT_MS = 5000;
const TYPING_EVENT_TTL_MS = 6000;

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

type ChatParticipantDto = {
  id: string;
  name: string;
  avatar: string | null;
};

type ChatMessageReactionDto = {
  emoji: string;
  count: number;
  users: ChatParticipantDto[];
};

type ChatAttachmentDto = {
  id: string;
  name: string;
  mimeType: string;
  size?: number;
  url: string;
  thumbnailUrl?: string | null;
  storageKey?: string | null;
  sessionId?: string | null;
};

type ChatMessageDto = {
  id: string;
  conversationId: string;
  senderId: string;
  body: string;
  sentAt: string;
  reactions?: ChatMessageReactionDto[];
  attachments?: ChatAttachmentDto[];
};

type ChatHistoryResponse = {
  success: true;
  conversationId: string;
  participants: ChatParticipantDto[];
  messages: ChatMessageDto[];
};

type ChatSendResponse = {
  success: true;
  message: ChatMessageDto;
  participants: ChatParticipantDto[];
};

type ChatInboxConversation = {
  conversationId: string;
  participants: ChatParticipantDto[];
  session: {
    type: "direct" | "group";
    title: string;
    avatar: string | null;
    createdBy: string | null;
  };
  lastMessage: ChatMessageDto | null;
};

type ChatInboxResponse = {
  success: true;
  conversations: ChatInboxConversation[];
};

type ChatReactionMutationResponse = {
  success: true;
  conversationId: string;
  messageId: string;
  emoji: string;
  action: "added" | "removed";
  reactions: Array<{
    emoji: string;
    count: number;
    users: ChatParticipantDto[];
  }>;
};

export class ChatEngine {
  private readonly store: ChatStore;
  private client: RealtimeClient | null = null;
  private clientFactory: RealtimeClientFactory | null = null;
  private unsubscribe: (() => void) | null = null;
  private clientChannelName: string | null = null;
  private resolvedSelfClientId: string | null = null;
  private supabaseUserId: string | null = null;
  private userProfile: UserProfile = { id: null, name: null, email: null, avatarUrl: null };
  private conversationHistoryLoaded = new Set<string>();
  private conversationHistoryLoading = new Map<string, Promise<void>>();
  private inboxLoaded = false;
  private inboxLoading: Promise<void> | null = null;
  private directChannelWatermarkKey: string | null = null;
  private directChannelWatermarkMs: number | null = null;
  private typingStates = new Map<string, { active: boolean; lastSent: number; timeout: number | null }>();

  constructor(store?: ChatStore) {
    this.store = store ?? new ChatStore();
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
    await this.disconnectRealtime();
    if (!options.currentUserId || !options.envelope || !options.factory) {
      this.resolvedSelfClientId = null;
      this.store.setSelfClientId(null);
      return;
    }
    const tokenProvider = () => options.requestToken(options.envelope);
    try {
      const client = await options.factory.getClient(tokenProvider);
      const clientId = client.clientId();
      if (!clientId) {
        await options.factory.release(client);
        this.resolvedSelfClientId = null;
        this.store.setSelfClientId(null);
        return;
      }
      this.client = client;
      this.clientFactory = options.factory;
      this.resolvedSelfClientId = clientId;
      this.setSupabaseUserId(clientId);
      this.store.setSelfClientId(clientId);
      const channelName = getChatDirectChannel(clientId);
      this.clientChannelName = channelName;
      const subscribeOptions = this.buildDirectChannelSubscribeOptions();
      const cleanup = await client.subscribe(
        channelName,
        (event) => {
          this.handleRealtimeEvent(event);
        },
        subscribeOptions,
      );
      this.unsubscribe = cleanup;
    } catch (error) {
      console.error("ChatEngine connect failed", error);
      this.resolvedSelfClientId = null;
      this.store.setSelfClientId(null);
    }
  }

  async disconnectRealtime(): Promise<void> {
    if (this.unsubscribe) {
      try {
        this.unsubscribe();
      } catch (error) {
        console.error("ChatEngine unsubscribe error", error);
      }
      this.unsubscribe = null;
    }
    if (this.client) {
      try {
        if (this.clientFactory) {
          await Promise.resolve(this.clientFactory.release(this.client));
        } else {
          await this.client.close();
        }
      } catch (error) {
        console.error("ChatEngine release error", error);
      }
    }
    this.client = null;
    this.clientFactory = null;
    this.clientChannelName = null;
    this.resolvedSelfClientId = null;
    this.store.setSelfClientId(null);
    this.resetTypingState();
    this.resetInboxState();
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
      const response = await fetch("/api/chat/groups", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          conversationId,
          participantIds,
          title: name?.trim() ?? "",
        }),
      });
      if (!response.ok) {
        let errorMessage = `Failed to create group (${response.status})`;
        try {
          const payload = (await response.json()) as { message?: string; error?: string };
          errorMessage = payload.message ?? payload.error ?? errorMessage;
        } catch {
          const text = await response.text().catch(() => "");
          if (text) errorMessage = text;
        }
        throw new Error(errorMessage);
      }
      const payload = (await response.json()) as {
        success: true;
        conversation: {
          conversationId: string;
          participants: ChatParticipantDto[];
          session: { type: "group"; title: string; avatar: string | null; createdBy: string | null };
        };
      };
      const descriptor = {
        id: payload.conversation.conversationId,
        type: payload.conversation.session.type,
        title: payload.conversation.session.title,
        avatar: payload.conversation.session.avatar,
        createdBy: payload.conversation.session.createdBy,
        participants: payload.conversation.participants.map((p) => ({
          id: p.id,
          name: p.name,
          avatar: p.avatar ?? null,
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
    const response = await fetch("/api/chat/groups/participants", {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ conversationId: session.id, participantIds: ids }),
    });
    if (!response.ok) {
      let errorMessage = `Failed to add participants (${response.status})`;
      try {
        const payload = (await response.json()) as { message?: string; error?: string };
        errorMessage = payload.message ?? payload.error ?? errorMessage;
      } catch {
        const text = await response.text().catch(() => "");
        if (text) errorMessage = text;
      }
      throw new Error(errorMessage);
    }
    const payload = (await response.json()) as { success: true; participants: ChatParticipantDto[] };
    const participants = payload.participants.map((p) => ({ id: p.id, name: p.name, avatar: p.avatar ?? null }));
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
    const response = await fetch("/api/chat/groups", {
      method: "PATCH",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ conversationId, title: trimmed }),
    });
    if (!response.ok) {
      let errorMessage = `Failed to rename group (${response.status})`;
      try {
        const payload = (await response.json()) as { message?: string; error?: string };
        errorMessage = payload.message ?? payload.error ?? errorMessage;
      } catch {
        const text = await response.text().catch(() => "");
        if (text) errorMessage = text;
      }
      throw new Error(errorMessage);
    }
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
      const response = await fetch("/api/chat/messages", {
        method: "POST",
        credentials: "include",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          conversationId,
          messageId: message.id,
          body: message.body,
          sentAt: message.sentAt,
          attachments:
            message.attachments.length > 0
              ? message.attachments.map((attachment) => ({
                  id: attachment.id,
                  name: attachment.name,
                  mimeType: attachment.mimeType,
                  size: attachment.size,
                  url: attachment.url,
                  thumbnailUrl: attachment.thumbnailUrl,
                  storageKey: attachment.storageKey,
                  sessionId: attachment.sessionId,
                }))
              : [],
        }),
      });

      if (!response.ok) {
        let errorMessage = `Failed to send message (${response.status})`;
        try {
          const payload = (await response.json()) as { message?: string; error?: string };
          errorMessage = payload.message ?? payload.error ?? errorMessage;
        } catch {
          const text = await response.text().catch(() => "");
          if (text) errorMessage = text;
        }
        throw new Error(errorMessage);
      }

      const payload = (await response.json()) as ChatSendResponse;
      const responseConversationId =
        (payload?.message?.conversationId?.trim() ?? "") || effectiveConversationId;
      if (responseConversationId && responseConversationId !== effectiveConversationId) {
        this.handleConversationRemap(effectiveConversationId, responseConversationId);
        effectiveConversationId = responseConversationId;
      }
      if (Array.isArray(payload.participants) && payload.participants.length) {
        this.applyParticipantsFromDto(effectiveConversationId, payload.participants);
      }
      if (payload?.message && typeof payload.message.id === "string") {
        const reactionDescriptors =
          Array.isArray(payload.message.reactions) && payload.message.reactions.length > 0
            ? payload.message.reactions.map((reaction) => ({
                emoji: reaction.emoji,
                users: Array.isArray(reaction.users)
                  ? reaction.users.map((user) => ({
                      id: user.id,
                      name: user.name || user.id,
                      avatar: user.avatar ?? null,
                    }))
                  : [],
              }))
            : [];
        this.store.acknowledgeMessage(effectiveConversationId, message.id, {
          id: payload.message.id,
          authorId: payload.message.senderId,
          body: payload.message.body,
          sentAt: payload.message.sentAt,
          reactions: reactionDescriptors,
          attachments: payload.message.attachments,
        });
        this.recordDirectChannelWatermarkFromIso(payload.message.sentAt);
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
    const response = await fetch("/api/chat/reactions", {
      method: "POST",
      credentials: "include",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        conversationId,
        messageId,
        emoji,
        action,
      }),
    });

    if (!response.ok) {
      let errorMessage = `Failed to ${action === "add" ? "add" : "remove"} reaction (${response.status})`;
      try {
        const payload = (await response.json()) as { message?: string; error?: string };
        errorMessage = payload.message ?? payload.error ?? errorMessage;
      } catch {
        const text = await response.text().catch(() => "");
        if (text) errorMessage = text;
      }
      throw new Error(errorMessage);
    }

    const payload = (await response.json()) as ChatReactionMutationResponse;
    const resolvedConversationId =
      (payload?.conversationId?.trim() ?? "") || conversationId;
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
      Array.isArray(payload.reactions) && payload.reactions.length > 0
        ? payload.reactions.map((reaction) => ({
            emoji: reaction.emoji,
            users: Array.isArray(reaction.users)
              ? reaction.users.map((user) => ({
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
      messageId: payload.messageId || messageId,
      emoji: payload.emoji || emoji,
      action: payload.action,
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
      this.beginTyping(trimmed);
    } else {
      this.stopTyping(trimmed, true);
    }
  }

  private buildDirectChannelSubscribeOptions(): RealtimeSubscribeOptions | undefined {
    const params: Record<string, string> = {};
    if (Number.isFinite(this.directChannelWatermarkMs) && this.directChannelWatermarkMs) {
      const start = Math.max(0, Math.trunc(this.directChannelWatermarkMs - 1000));
      if (start > 0) {
        params.start = String(start);
      }
    }
    if (!params.start) {
      params.rewind = "5m";
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

  private resetTypingState(): void {
    if (typeof window !== "undefined") {
      this.typingStates.forEach((state) => {
        if (state.timeout) {
          window.clearTimeout(state.timeout);
        }
      });
    }
    this.typingStates.clear();
  }

  private async publishTypingEvent(conversationId: string, typing: boolean): Promise<void> {
    const client = this.client;
    if (!client) return;
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
    await Promise.all(
      Array.from(channels).map((channel) => client.publish(channel, "chat.typing", payload)),
    );
  }

  private persistDirectChannelWatermark(): void {
    if (typeof window === "undefined") return;
    const key = this.directChannelWatermarkKey;
    if (!key) return;
    if (this.directChannelWatermarkMs === null) {
      try {
        window.localStorage.removeItem(key);
      } catch {
        // ignore storage failures
      }
      return;
    }
    try {
      window.localStorage.setItem(key, String(this.directChannelWatermarkMs));
    } catch {
      // ignore storage failures
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
    participants: ChatParticipantDto[],
  ): void {
    if (!Array.isArray(participants) || participants.length === 0) return;
    const descriptor = {
      id: conversationId,
      type: "direct" as const,
      title: "",
      avatar: null,
      createdBy: null,
      participants: participants.map((participant) => ({
        id: participant.id,
        name: participant.name || participant.id,
        avatar: participant.avatar ?? null,
      })),
    };
    this.store.applySessionEvent(descriptor);
  }

  private normalizeReactionsFromDto(
    reactions: ChatMessageReactionDto[] | undefined,
  ): ChatMessageReaction[] {
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

  private normalizeAttachmentsFromDto(
    attachments: ChatAttachmentDto[] | undefined,
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

  private upsertMessageFromDto(conversationId: string, dto: ChatMessageDto): void {
    if (!dto?.id) return;
    const sanitized =
      typeof dto.body === "string" ? dto.body.replace(/\s+/g, " ").trim() : "";
    const attachments = this.normalizeAttachmentsFromDto(dto.attachments);
    if (!sanitized && attachments.length === 0) return;
    const reactions = this.normalizeReactionsFromDto(dto.reactions);
    const chatMessage = {
      id: dto.id,
      authorId: dto.senderId,
      body: sanitized,
      sentAt: dto.sentAt,
      status: "sent" as const,
      reactions,
      attachments,
    };
    const isLocal = this.isSelfUser(dto.senderId);
    this.store.addMessage(conversationId, chatMessage, { isLocal });
    this.recordDirectChannelWatermarkFromIso(chatMessage.sentAt);
  }

  private isSelfUser(userId: string | null | undefined): boolean {
    if (!userId) return false;
    const trimmed = userId.trim();
    if (!trimmed) return false;
    if (this.supabaseUserId && this.supabaseUserId === trimmed) return true;
    if (this.resolvedSelfClientId && this.resolvedSelfClientId === trimmed) return true;
    return false;
  }

  private ensureConversationHistory(conversationId: string): Promise<void> {
    if (this.conversationHistoryLoaded.has(conversationId)) {
      return Promise.resolve();
    }
    const existing = this.conversationHistoryLoading.get(conversationId);
    if (existing) return existing;
    const promise = this.loadConversationHistory(conversationId)
      .catch((error) => {
        console.error("chat history load error", { conversationId, error });
      })
      .finally(() => {
        this.conversationHistoryLoading.delete(conversationId);
      });
    this.conversationHistoryLoading.set(conversationId, promise);
    return promise;
  }

  async bootstrapInbox(): Promise<void> {
    if (this.inboxLoaded) return;
    if (this.inboxLoading) {
      await this.inboxLoading;
      return;
    }
    const selfId = this.resolveSelfId();
    if (!selfId) return;
    const promise = this.loadInbox()
      .catch((error) => {
        console.error("chat inbox load error", error);
      })
      .finally(() => {
        this.inboxLoading = null;
      });
    this.inboxLoading = promise;
    await promise;
  }

  private async loadInbox(): Promise<void> {
    const params = new URLSearchParams({ limit: "50" });
    const response = await fetch(`/api/chat/inbox?${params.toString()}`, {
      method: "GET",
      credentials: "include",
    });
    if (!response.ok) {
      let message = `Failed to load inbox (${response.status})`;
      try {
        const payload = (await response.json()) as { message?: string; error?: string };
        message = payload.message ?? payload.error ?? message;
      } catch {
        const text = await response.text().catch(() => "");
        if (text) message = text;
      }
      throw new Error(message);
    }
    const data = (await response.json()) as ChatInboxResponse;
    if (!data?.success || !Array.isArray(data.conversations)) {
      this.inboxLoaded = true;
      return;
    }
    data.conversations.forEach((conversation) => {
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
        const attachments = this.normalizeAttachmentsFromDto(lastMessage.attachments);
        if (sanitized || attachments.length > 0) {
          const reactions = this.normalizeReactionsFromDto(lastMessage.reactions);
          const chatMessage = {
            id: lastMessage.id,
            authorId: lastMessage.senderId,
            body: sanitized,
            sentAt: lastMessage.sentAt,
            status: "sent" as const,
            reactions,
            attachments,
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
    const params = new URLSearchParams({ conversationId, limit: "50" });
    const response = await fetch(`/api/chat/messages?${params.toString()}`, {
      method: "GET",
      credentials: "include",
    });
    if (!response.ok) {
      let errorMessage = `Failed to load conversation (${response.status})`;
      try {
        const payload = (await response.json()) as { message?: string; error?: string };
        errorMessage = payload.message ?? payload.error ?? errorMessage;
      } catch {
        const text = await response.text().catch(() => "");
        if (text) errorMessage = text;
      }
      throw new Error(errorMessage);
    }
    const data = (await response.json()) as ChatHistoryResponse;
    const resolvedId =
      (typeof data.conversationId === "string" && data.conversationId.trim().length
        ? data.conversationId.trim()
        : conversationId) || conversationId;
    if (resolvedId !== conversationId) {
      this.handleConversationRemap(conversationId, resolvedId);
    }
    if (Array.isArray(data.participants) && data.participants.length) {
      this.applyParticipantsFromDto(resolvedId, data.participants);
    }
    data.messages.forEach((message) => {
      this.upsertMessageFromDto(resolvedId, message);
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
    const client = this.client;
    if (!client) {
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
    await Promise.all(
      Array.from(channels).map((channel) => client.publish(channel, "chat.session", payload)),
    );
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
        .map((participant) => ({
          id: participant.id,
          name: participant.name,
          avatar: participant.avatar ?? null,
        }))
        .filter((participant): participant is ChatParticipant => Boolean(participant.id));
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
      const params = new URLSearchParams({ conversationId: trimmed });
      const response = await fetch(`/api/chat/groups?${params.toString()}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!response.ok) {
        let errorMessage = `Failed to delete group (${response.status})`;
        try {
          const payload = (await response.json()) as { message?: string; error?: string };
          errorMessage = payload.message ?? payload.error ?? errorMessage;
        } catch {
          const text = await response.text().catch(() => "");
          if (text) errorMessage = text;
        }
        throw new Error(errorMessage);
      }
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
      const response = await fetch(`/api/chat/messages/${encodeURIComponent(trimmedMessageId)}`, {
        method: "PATCH",
        credentials: "include",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          conversationId,
          removeAttachmentIds: attachmentIds,
        }),
      });
      if (!response.ok) {
        let errorMessage = `Failed to update attachments (${response.status})`;
        try {
          const payload = (await response.json()) as { message?: string; error?: string };
          errorMessage = payload.message ?? payload.error ?? errorMessage;
        } catch {
          const text = await response.text().catch(() => "");
          if (text) errorMessage = text;
        }
        throw new Error(errorMessage);
      }
      const payload = (await response.json()) as ChatSendResponse;
      if (!payload?.success) return;
      const participants = payload.participants.map((participant) => ({
        id: participant.id,
        name: participant.name,
        avatar: participant.avatar ?? null,
      }));
      const attachments =
        payload.message.attachments?.map((attachment) => ({
          id: attachment.id,
          name: attachment.name,
          mimeType: attachment.mimeType,
          size:
            typeof attachment.size === "number" && Number.isFinite(attachment.size)
              ? attachment.size
              : 0,
          url: attachment.url,
          thumbnailUrl: attachment.thumbnailUrl ?? null,
          storageKey: attachment.storageKey ?? null,
          sessionId: attachment.sessionId ?? null,
        })) ?? [];
      this.store.applyMessageUpdateEvent({
        type: "chat.message.update",
        conversationId: payload.message.conversationId,
        messageId: payload.message.id,
        body: payload.message.body,
        attachments,
        participants,
        senderId: payload.message.senderId,
        sentAt: payload.message.sentAt,
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
      const params = new URLSearchParams({ conversationId });
      const response = await fetch(
        `/api/chat/messages/${encodeURIComponent(trimmedMessageId)}?${params.toString()}`,
        {
          method: "DELETE",
          credentials: "include",
        },
      );
      if (!response.ok) {
        let errorMessage = `Failed to delete message (${response.status})`;
        try {
          const payload = (await response.json()) as { message?: string; error?: string };
          errorMessage = payload.message ?? payload.error ?? errorMessage;
        } catch {
          const text = await response.text().catch(() => "");
          if (text) errorMessage = text;
        }
        throw new Error(errorMessage);
      }
      const payload = (await response.json().catch(() => null)) as
        | { success?: boolean; participants?: ChatParticipantDto[] }
        | null;
      const participants = Array.isArray(payload?.participants)
        ? payload!.participants.map((participant) => ({
            id: participant.id,
            name: participant.name,
            avatar: participant.avatar ?? null,
          }))
        : undefined;
      const eventPayload = {
        type: "chat.message.delete" as const,
        conversationId,
        messageId: trimmedMessageId,
        ...(participants ? { participants } : {}),
      };
      this.store.applyMessageDeleteEvent(eventPayload);
    } catch (error) {
      console.error("ChatEngine deleteMessage error", error);
      throw error;
    }
  }
}
