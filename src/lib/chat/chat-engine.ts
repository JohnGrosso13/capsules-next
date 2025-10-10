"use client";

import type { FriendItem } from "@/hooks/useFriendsData";
import {
  createGroupConversationId,
  getChatConversationId,
  getChatDirectChannel,
  isGroupConversationId,
} from "@/lib/chat/channels";
import type { RealtimeEnvelope } from "@/lib/realtime/envelope";
import type { RealtimeAuthPayload, RealtimeClient, RealtimeClientFactory, RealtimeEvent } from "@/ports/realtime";
import type { ChatParticipant, ChatSession, ChatSessionEventPayload, ChatMessageEventPayload } from "@/components/providers/chat-store";
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

export class ChatEngine {
  private readonly store: ChatStore;
  private client: RealtimeClient | null = null;
  private clientFactory: RealtimeClientFactory | null = null;
  private unsubscribe: (() => void) | null = null;
  private clientChannelName: string | null = null;
  private resolvedSelfClientId: string | null = null;
  private userProfile: UserProfile = { id: null, name: null, email: null, avatarUrl: null };

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
    this.store.setCurrentUserId(profile.id ?? null);
  }

  setFriends(friends: FriendItem[]): void {
    if (!Array.isArray(friends) || friends.length === 0) return;
    this.store.updateFromFriends(friends);
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

  startDirectChat(target: ChatParticipant, options?: { activate?: boolean }): StartChatResult | null {
    const currentUserId = this.store.getCurrentUserId();
    if (!currentUserId) {
      console.warn("ChatEngine startDirectChat requires a user id");
      return null;
    }
    if (!target?.id) return null;
    const conversationId = getChatConversationId(currentUserId, target.id);
    const selfParticipant = this.buildSelfParticipant();
    const descriptor = {
      id: conversationId,
      type: "direct" as const,
      title: target.name || target.id,
      avatar: target.avatar ?? null,
      createdBy: null,
      participants: selfParticipant ? [target, selfParticipant] : [target],
    };
    const { created } = this.store.startSession(descriptor, { activate: options?.activate ?? true });
    if (options?.activate ?? true) {
      this.store.resetUnread(conversationId);
    }
    return { id: conversationId, created };
  }

  async startGroupChat(
    participants: ChatParticipant[],
    name: string | undefined,
    options?: { activate?: boolean },
  ): Promise<StartChatResult | null> {
    const currentUserId = this.store.getCurrentUserId();
    if (!currentUserId) {
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
    const selfParticipant = this.buildSelfParticipant() ?? {
      id: currentUserId,
      name: this.userProfile.name ?? currentUserId,
      avatar: this.userProfile.avatarUrl ?? null,
    };
    const descriptor = {
      id: conversationId,
      type: "group" as const,
      title: name?.trim() ?? "",
      avatar: null,
      createdBy: currentUserId,
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
    const incoming = targets.filter((participant) => participant?.id && !existingIds.has(participant.id));
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
  }

  closeSession(): void {
    this.store.setActiveSession(null);
  }

  deleteSession(sessionId: string): void {
    this.store.deleteSession(sessionId);
  }

  async sendMessage(conversationId: string, body: string): Promise<void> {
    const trimmed = body.replace(/\s+/g, " ").trim();
    if (!trimmed) return;
    const selfIdentity = this.resolvedSelfClientId ?? this.store.getSelfClientId() ?? this.store.getCurrentUserId();
    if (!selfIdentity) {
      throw new Error("Chat identity is not ready yet.");
    }
    const client = this.client;
    if (!client) {
      throw new Error("Chat connection is not ready yet.");
    }
    const selfParticipant = this.buildSelfParticipant() ?? {
      id: selfIdentity,
      name: this.userProfile.name ?? this.userProfile.email ?? selfIdentity,
      avatar: this.userProfile.avatarUrl ?? null,
    };
    const prepared = this.store.prepareLocalMessage(conversationId, trimmed, {
      selfParticipant,
    });
    if (!prepared) return;
    const { message, session } = prepared;
    const payload: ChatMessageEventPayload = {
      type: "chat.message",
      conversationId,
      senderId: selfIdentity,
      participants: session.participants.map((participant) => ({
        id: participant.id,
        name: participant.name,
        avatar: participant.avatar,
      })),
      session: {
        type: session.type,
        title: session.title,
        avatar: session.avatar,
        createdBy: session.createdBy ?? null,
      },
      message: {
        id: message.id,
        body: message.body,
        sentAt: message.sentAt,
      },
    };

    const channels = new Set<string>();
    payload.participants.forEach((participant) => {
      try {
        channels.add(getChatDirectChannel(participant.id));
      } catch {
        // ignore invalid id
      }
    });
    if (this.clientChannelName) {
      channels.add(this.clientChannelName);
    }
    try {
      await Promise.all(Array.from(channels).map((channel) => client.publish(channel, "chat.message", payload)));
      this.store.markMessageStatus(conversationId, message.id, "sent");
    } catch (error) {
      this.store.markMessageStatus(conversationId, message.id, "failed");
      throw error;
    }
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
    await Promise.all(Array.from(channels).map((channel) => client.publish(channel, "chat.session", payload)));
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
        type: payload.session.type ?? (isGroupConversationId(payload.conversationId) ? "group" : "direct"),
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
  }

  private buildSelfParticipant(): ChatParticipant | null {
    const userId = this.store.getCurrentUserId();
    if (!userId) return null;
    const name = this.userProfile.name ?? this.userProfile.email ?? userId;
    const avatar = this.userProfile.avatarUrl ?? null;
    return { id: userId, name, avatar };
  }
}
