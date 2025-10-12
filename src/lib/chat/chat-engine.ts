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
} from "@/ports/realtime";
import type {
  ChatParticipant,
  ChatSession,
  ChatSessionEventPayload,
  ChatMessageEventPayload,
} from "@/components/providers/chat-store";
import { ChatStore } from "@/components/providers/chat-store";

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

type ChatMessageDto = {
  id: string;
  conversationId: string;
  senderId: string;
  body: string;
  sentAt: string;
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
    const previousSupabaseId = this.supabaseUserId;
    this.supabaseUserId = normalized;
    if (normalized) {
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
      const cleanup = await client.subscribe(channelName, (event) => {
        this.handleRealtimeEvent(event);
      });
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

  async addParticipantsToGroup(conversationId: string, targets: ChatParticipant[]): Promise<void> {
    if (!targets?.length) return;
    const session = this.findSession(conversationId);
    if (!session) {
      throw new Error("Chat session not found.");
    }
    if (session.type !== "group") {
      throw new Error("Only group chats can accept additional participants.");
    }
    const existingIds = new Set(session.participants.map((participant) => participant.id));
    const incoming = targets.filter(
      (participant) => participant?.id && !existingIds.has(participant.id),
    );
    if (!incoming.length) return;
    const descriptor = {
      id: session.id,
      type: session.type,
      title: session.title,
      avatar: session.avatar,
      createdBy: session.createdBy ?? null,
      participants: [...session.participants, ...incoming],
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

  async sendMessage(conversationId: string, body: string): Promise<void> {
    const trimmed = body.replace(/\s+/g, " ").trim();
    if (!trimmed) return;
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
    const prepared = this.store.prepareLocalMessage(conversationId, trimmed, {
      selfParticipant,
    });
    if (!prepared) return;
    const { message } = prepared;
    void this.ensureConversationHistory(conversationId);

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
      if (Array.isArray(payload.participants) && payload.participants.length) {
        this.applyParticipantsFromDto(conversationId, payload.participants);
      }
      this.store.markMessageStatus(conversationId, message.id, "sent");
    } catch (error) {
      this.store.markMessageStatus(conversationId, message.id, "failed");
      throw error;
    }
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

  private upsertMessageFromDto(conversationId: string, dto: ChatMessageDto): void {
    if (!dto?.id || !dto.body) return;
    const sanitized = dto.body.replace(/\s+/g, " ").trim();
    if (!sanitized) return;
    const chatMessage = {
      id: dto.id,
      authorId: dto.senderId,
      body: sanitized,
      sentAt: dto.sentAt,
      status: "sent" as const,
    };
    const isLocal = this.isSelfUser(dto.senderId);
    this.store.addMessage(conversationId, chatMessage, { isLocal });
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
    if (isGroupConversationId(conversationId)) {
      return Promise.resolve();
    }
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
    if (Array.isArray(data.participants) && data.participants.length) {
      this.applyParticipantsFromDto(conversationId, data.participants);
    }
    data.messages.forEach((message) => {
      this.upsertMessageFromDto(conversationId, message);
    });
    this.conversationHistoryLoaded.add(conversationId);
  }

  dispatchRealtimeEvent(event: RealtimeEvent): void {
    this.handleRealtimeEvent(event);
  }

  private findSession(conversationId: string): ChatSession | null {
    return this.store.getSnapshot().sessions.find((item) => item.id === conversationId) ?? null;
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
    if (event.name !== "chat.message") return;
    const payload = event.data as ChatMessageEventPayload;
    this.store.applyMessageEvent(payload);
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
}
