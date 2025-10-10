"use client";

import * as React from "react";

import { getRealtimeClientFactory } from "@/config/realtime-client";
import { useFriendsDataContext } from "@/components/providers/FriendsDataProvider";
import {
  createGroupConversationId,
  getChatConversationId,
  getChatDirectChannel,
} from "@/lib/chat/channels";
import { buildRealtimeEnvelope } from "@/lib/realtime/envelope";
import { requestRealtimeToken } from "@/lib/realtime/token";
import type { FriendItem } from "@/hooks/useFriendsData";
import { useCurrentUser } from "@/services/auth/client";
import type { RealtimeClient, RealtimeEvent } from "@/ports/realtime";

import {
  ChatStore,
  mergeParticipants,
  normalizeParticipant,
  type ChatSession,
  type ChatSessionType,
  type ChatParticipant,
  type ChatSessionEventPayload,
  type ChatMessageEventPayload,
} from "./chat-store";

export type { ChatSession, ChatSessionType, ChatParticipant, ChatMessage } from "./chat-store";
export { chatStoreTestUtils as __chatTestUtils } from "./chat-store";

export type ChatFriendTarget = {
  userId: string;
  name: string;
  avatar: string | null;
};

type StartChatResult = {
  id: string;
  created: boolean;
};

export type CreateGroupChatInput = {
  name?: string;
  participants: ChatFriendTarget[];
  activate?: boolean;
};

export type ChatContextValue = {
  sessions: ChatSession[];
  activeSessionId: string | null;
  activeSession: ChatSession | null;
  unreadCount: number;
  currentUserId: string | null;
  selfClientId: string | null;
  isReady: boolean;
  startChat: (target: ChatFriendTarget, options?: { activate?: boolean }) => StartChatResult | null;
  startGroupChat: (input: CreateGroupChatInput) => Promise<StartChatResult | null>;
  addParticipantsToGroup: (conversationId: string, targets: ChatFriendTarget[]) => Promise<void>;
  renameGroupChat: (conversationId: string, name: string) => Promise<void>;
  openSession: (sessionId: string) => void;
  closeSession: () => void;
  deleteSession: (sessionId: string) => void;
  sendMessage: (conversationId: string, body: string) => Promise<void>;
};

const ChatContext = React.createContext<ChatContextValue | null>(null);

export function useChatContext(): ChatContextValue {
  const context = React.useContext(ChatContext);
  if (!context) {
    throw new Error("useChatContext must be used within a ChatProvider");
  }
  return context;
}

function coerceFriendTarget(friend: FriendItem): ChatFriendTarget | null {
  if (!friend.userId) return null;
  return {
    userId: friend.userId,
    name: friend.name || friend.userId,
    avatar: friend.avatar ?? null,
  };
}

function friendTargetToParticipant(target: ChatFriendTarget): ChatParticipant {
  return {
    id: target.userId,
    name: target.name || target.userId,
    avatar: target.avatar ?? null,
  };
}

export function ChatProvider({ children }: { children: React.ReactNode }) {
  const store = React.useMemo(() => new ChatStore(), []);
  const [snapshot, setSnapshot] = React.useState(() => store.getSnapshot());
  const [isReady, setIsReady] = React.useState(false);

  React.useEffect(() => {
    const unsubscribe = store.subscribe(setSnapshot);
    return unsubscribe;
  }, [store]);

  React.useEffect(() => {
    if (typeof window !== "undefined") {
      store.setStorage(window.localStorage);
    } else {
      store.setStorage(null);
    }
    store.hydrateFromStorage();
    setIsReady(true);
  }, [store]);

  const { user } = useCurrentUser();
  const currentUserId = user?.id ?? null;
  React.useEffect(() => {
    store.setCurrentUserId(currentUserId);
  }, [currentUserId, store]);

  const friendsContext = useFriendsDataContext();
  const friends = friendsContext.friends;
  React.useEffect(() => {
    if (!friends.length) return;
    store.updateFromFriends(friends);
  }, [friends, store]);

  const envelope = React.useMemo(() => buildRealtimeEnvelope(user), [user]);
  const clientRef = React.useRef<RealtimeClient | null>(null);
  const unsubscribeRef = React.useRef<(() => void) | null>(null);
  const clientChannelNameRef = React.useRef<string | null>(null);
  const resolvedSelfIdRef = React.useRef<string | null>(null);

  const handleRealtimeEvent = React.useCallback(
    (event: RealtimeEvent) => {
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
            (normalizedParticipants.length > 2 ? "group" : "direct"),
          title: payload.session.title ?? "",
          avatar: payload.session.avatar ?? null,
          createdBy: payload.session.createdBy ?? null,
          participants: normalizedParticipants,
        };
        store.applySessionEvent(descriptor);
        return;
      }

      if (event.name !== "chat.message") return;
      const payload = event.data as ChatMessageEventPayload;
      store.applyMessageEvent(payload);
    },
    [store],
  );

  React.useEffect(() => {
    if (!currentUserId || !envelope) {
      return;
    }
    const factory = getRealtimeClientFactory();
    if (!factory) {
      console.warn("Realtime client factory not configured");
      return;
    }
    let cancelled = false;

    const tokenProvider = () => requestRealtimeToken(envelope);

    const connect = async () => {
      try {
        const client = (await factory.getClient(tokenProvider)) as RealtimeClient;
        if (cancelled) return;
        clientRef.current = client;
        const resolvedClientId = client.clientId();
        if (!resolvedClientId) {
          console.warn("Chat realtime connect missing client identity");
          resolvedSelfIdRef.current = null;
          store.setSelfClientId(null);
          clientChannelNameRef.current = null;
          return;
        }
        resolvedSelfIdRef.current = resolvedClientId;
        store.setSelfClientId(resolvedClientId);
        const channelName = getChatDirectChannel(resolvedClientId);
        clientChannelNameRef.current = channelName;
        const cleanup = await client.subscribe(channelName, (event) => {
          handleRealtimeEvent(event);
        });
        if (cancelled) {
          cleanup();
          return;
        }
        unsubscribeRef.current = cleanup;
      } catch (error) {
        console.error("Chat realtime connect error", error);
      }
    };

    void connect();

    return () => {
      cancelled = true;
      const cleanup = unsubscribeRef.current;
      unsubscribeRef.current = null;
      if (cleanup) cleanup();
      const client = clientRef.current;
      clientRef.current = null;
      if (client) {
        Promise.resolve(factory.release(client)).catch((error) => {
          console.error("Chat realtime release error", error);
        });
      }
      clientChannelNameRef.current = null;
      resolvedSelfIdRef.current = null;
      store.setSelfClientId(null);
    };
  }, [currentUserId, envelope, handleRealtimeEvent, store]);

  const publishSessionUpdate = React.useCallback(
    async (conversationId: string) => {
      const client = clientRef.current;
      if (!client) {
        console.warn("Chat connection is not ready yet.");
        return;
      }
      const session = store
        .getSnapshot()
        .sessions.find((item) => item.id === conversationId);
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
          // ignore invalid participant id for publishing
        }
      });
      if (clientChannelNameRef.current) {
        channels.add(clientChannelNameRef.current);
      }
      await Promise.all(
        Array.from(channels).map((channel) => client.publish(channel, "chat.session", payload)),
      );
    },
    [store],
  );

  const startChat = React.useCallback(
    (target: ChatFriendTarget, options?: { activate?: boolean }): StartChatResult | null => {
      if (!currentUserId) return null;
      if (!target || !target.userId) return null;
      const activate = options?.activate ?? true;
      const selfIdentity = resolvedSelfIdRef.current ?? currentUserId;
      if (!selfIdentity) {
        console.warn("Chat startChat missing self identity");
        return null;
      }
      const conversationId = getChatConversationId(selfIdentity, target.userId);
      const descriptor = {
        id: conversationId,
        type: "direct" as ChatSessionType,
        title: target.name || target.userId,
        avatar: target.avatar ?? null,
        createdBy: null,
        participants: [friendTargetToParticipant(target)],
      };
      const { created } = store.startSession(descriptor, { activate });
      if (activate) {
        store.resetUnread(conversationId);
      }
      return { id: conversationId, created };
    },
    [currentUserId, store],
  );

  const startGroupChat = React.useCallback(
    async (input: CreateGroupChatInput): Promise<StartChatResult | null> => {
      if (!currentUserId) return null;
      const targets = Array.isArray(input.participants) ? input.participants : [];
      const uniqueTargets = new Map<string, ChatFriendTarget>();
      targets.forEach((target) => {
        if (target && typeof target.userId === "string" && target.userId) {
          uniqueTargets.set(target.userId, target);
        }
      });
      if (uniqueTargets.size === 0) {
        console.warn("startGroupChat requires at least one participant.");
        return null;
      }
      const selfIdentity = resolvedSelfIdRef.current ?? currentUserId;
      if (!selfIdentity) {
        console.warn("Chat startGroupChat missing self identity");
        return null;
      }
      const conversationId = createGroupConversationId();
      const participantList = Array.from(uniqueTargets.values()).map((target) =>
        friendTargetToParticipant(target),
      );
      const selfParticipant: ChatParticipant = {
        id: currentUserId ?? selfIdentity,
        name: user?.name ?? user?.email ?? selfIdentity,
        avatar: user?.avatarUrl ?? null,
      };
      const descriptor = {
        id: conversationId,
        type: "group" as ChatSessionType,
        title: input.name?.trim() ?? "",
        avatar: null,
        createdBy: currentUserId ?? selfIdentity,
        participants: [...participantList, selfParticipant],
      };
      store.startSession(descriptor, { activate: input.activate ?? true });
      try {
        await publishSessionUpdate(conversationId);
      } catch (error) {
        console.error("Chat startGroupChat publish error", error);
      }
      return { id: conversationId, created: true };
    },
    [currentUserId, publishSessionUpdate, store, user],
  );

  const addParticipantsToGroup = React.useCallback(
    async (conversationId: string, targets: ChatFriendTarget[]) => {
      if (!targets?.length) return;
      const session = store
        .getSnapshot()
        .sessions.find((item) => item.id === conversationId);
      if (!session) {
        throw new Error("Chat session not found.");
      }
      if (session.type !== "group") {
        throw new Error("Only group chats can accept additional participants.");
      }
      const existingIds = new Set(session.participants.map((participant) => participant.id));
      const incoming = targets
        .filter(
          (target) =>
            target &&
            typeof target.userId === "string" &&
            target.userId &&
            !existingIds.has(target.userId),
        )
        .map((target) => friendTargetToParticipant(target));
      if (!incoming.length) return;
      const descriptor = {
        id: session.id,
        type: session.type,
        title: session.title,
        avatar: session.avatar,
        createdBy: session.createdBy ?? null,
        participants: mergeParticipants(session.participants, incoming),
      };
      store.startSession(descriptor);
      try {
        await publishSessionUpdate(conversationId);
      } catch (error) {
        console.error("Chat addParticipants publish error", error);
      }
    },
    [publishSessionUpdate, store],
  );

  const renameGroupChat = React.useCallback(
    async (conversationId: string, name: string) => {
      const session = store
        .getSnapshot()
        .sessions.find((item) => item.id === conversationId);
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
      store.startSession(descriptor);
      try {
        await publishSessionUpdate(conversationId);
      } catch (error) {
        console.error("Chat rename publish error", error);
      }
    },
    [publishSessionUpdate, store],
  );

  const openSession = React.useCallback(
    (sessionId: string) => {
      store.setActiveSession(sessionId);
      store.resetUnread(sessionId);
    },
    [store],
  );

  const closeSession = React.useCallback(() => {
    store.setActiveSession(null);
  }, [store]);

  const deleteSession = React.useCallback(
    (sessionId: string) => {
      store.deleteSession(sessionId);
    },
    [store],
  );

  const sendMessage = React.useCallback(
    async (conversationId: string, body: string) => {
      const trimmed = body.replace(/\s+/g, " ").trim();
      if (!trimmed) return;
      const selfIdentity = resolvedSelfIdRef.current;
      if (!selfIdentity) {
        throw new Error("Chat identity is not ready yet.");
      }
      const client = clientRef.current;
      if (!client) {
        throw new Error("Chat connection is not ready yet.");
      }
      const selfParticipant: ChatParticipant = {
        id: currentUserId ?? selfIdentity,
        name: user?.name ?? user?.email ?? (currentUserId ?? selfIdentity),
        avatar: user?.avatarUrl ?? null,
      };
      const prepared = store.prepareLocalMessage(conversationId, trimmed, {
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

      try {
        const channels = new Set<string>();
        payload.participants.forEach((participant) => {
          try {
            channels.add(getChatDirectChannel(participant.id));
          } catch {
            // ignore invalid id
          }
        });
        if (clientChannelNameRef.current) {
          channels.add(clientChannelNameRef.current);
        }
        await Promise.all(
          Array.from(channels).map((channel) => client.publish(channel, "chat.message", payload)),
        );
        store.markMessageStatus(conversationId, message.id, "sent");
      } catch (error) {
        store.markMessageStatus(conversationId, message.id, "failed");
        throw error;
      }
    },
    [currentUserId, store, user],
  );

  const { sessions, activeSessionId, activeSession, unreadCount } = snapshot;

  const contextValue = React.useMemo<ChatContextValue>(
    () => ({
      sessions,
      activeSessionId,
      activeSession,
      unreadCount,
      currentUserId,
      selfClientId: resolvedSelfIdRef.current,
      isReady,
      startChat,
      startGroupChat,
      addParticipantsToGroup,
      renameGroupChat,
      openSession,
      closeSession,
      deleteSession,
      sendMessage,
    }),
    [
      activeSession,
      activeSessionId,
      addParticipantsToGroup,
      closeSession,
      currentUserId,
      deleteSession,
      isReady,
      openSession,
      renameGroupChat,
      sendMessage,
      sessions,
      startChat,
      startGroupChat,
      unreadCount,
    ],
  );

  return <ChatContext.Provider value={contextValue}>{children}</ChatContext.Provider>;
}

export function useChatFriendlyTarget(friend: FriendItem): ChatFriendTarget | null {
  return React.useMemo(() => coerceFriendTarget(friend), [friend]);
}
