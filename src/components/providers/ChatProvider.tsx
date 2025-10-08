"use client";

import * as React from "react";

import { getRealtimeClientFactory } from "@/config/realtime-client";
import { useFriendsDataContext } from "@/components/providers/FriendsDataProvider";
import { getChatConversationId, getChatDirectChannel } from "@/lib/chat/channels";
import { buildRealtimeEnvelope } from "@/lib/realtime/envelope";
import { requestRealtimeToken } from "@/lib/realtime/token";
import type { FriendItem } from "@/hooks/useFriendsData";
import { useCurrentUser } from "@/services/auth/client";
import type { RealtimeClient, RealtimeEvent } from "@/ports/realtime";

const STORAGE_KEY = "capsule:chat:sessions";
const MESSAGE_LIMIT = 100;

type StoredMessage = {
  id: string;
  authorId: string;
  body: string;
  sentAt: string;
};

type StoredSession = {
  id: string;
  friendUserId: string;
  friendName: string;
  friendAvatar: string | null;
  messages: StoredMessage[];
};

type StoredState = {
  activeSessionId: string | null;
  sessions: StoredSession[];
};

export type ChatFriendTarget = {
  userId: string;
  name: string;
  avatar: string | null;
};

export type ChatMessage = {
  id: string;
  authorId: string;
  body: string;
  sentAt: string;
  status: "pending" | "sent" | "failed";
};

export type ChatSession = {
  id: string;
  friendUserId: string;
  friendName: string;
  friendAvatar: string | null;
  messages: ChatMessage[];
  unreadCount: number;
  lastMessageAt: string | null;
  lastMessagePreview: string | null;
};

type ChatSessionInternal = {
  id: string;
  friendUserId: string;
  friendName: string;
  friendAvatar: string | null;
  messages: ChatMessage[];
  messageIndex: Map<string, number>;
  lastMessageTimestamp: number;
  unreadCount: number;
};

type ChatMessageEventPayload = {
  type: "chat.message";
  conversationId: string;
  senderId: string;
  participants: Array<{
    id: string;
    name?: string | null;
    avatar?: string | null;
  }>;
  message: {
    id: string;
    body: string;
    sentAt: string;
  };
};

type StartChatResult = {
  id: string;
  created: boolean;
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

function createMessageId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `msg_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

function isValidStoredSession(value: unknown): value is StoredSession {
  if (!value || typeof value !== "object") return false;
  const session = value as StoredSession;
  return (
    typeof session.id === "string" &&
    typeof session.friendUserId === "string" &&
    typeof session.friendName === "string" &&
    Array.isArray(session.messages)
  );
}

function sanitizeMessageBody(body: string): string {
  return body.replace(/\s+/g, " ").trim();
}

export function ChatProvider({ children }: { children: React.ReactNode }) {
  const { user } = useCurrentUser();
  const friendsContext = useFriendsDataContext();
  const friends = friendsContext.friends;

  const currentUserId = user?.id ?? null;
  const envelope = React.useMemo(() => buildRealtimeEnvelope(user), [user]);

  const sessionsRef = React.useRef<Map<string, ChatSessionInternal>>(new Map());
  const [sessions, setSessions] = React.useState<ChatSession[]>([]);
  const activeSessionIdRef = React.useRef<string | null>(null);
  const [activeSessionId, setActiveSessionId] = React.useState<string | null>(null);
  const hydratedRef = React.useRef(false);
  const clientRef = React.useRef<RealtimeClient | null>(null);
  const unsubscribeRef = React.useRef<(() => void) | null>(null);
  const clientChannelNameRef = React.useRef<string | null>(null);
  const resolvedSelfIdRef = React.useRef<string | null>(null);
  const [isReady, setIsReady] = React.useState(false);

  const buildSnapshot = React.useCallback((): ChatSession[] => {
    const list: ChatSession[] = [];
    sessionsRef.current.forEach((session) => {
      const messages = session.messages.map((message) => ({ ...message }));
      const lastMessage = messages[messages.length - 1] ?? null;
      list.push({
        id: session.id,
        friendUserId: session.friendUserId,
        friendName: session.friendName,
        friendAvatar: session.friendAvatar,
        messages,
        unreadCount: session.unreadCount,
        lastMessageAt: lastMessage?.sentAt ?? null,
        lastMessagePreview: lastMessage?.body ?? null,
      });
    });
    list.sort((a, b) => {
      const aTime = a.lastMessageAt ? Date.parse(a.lastMessageAt) : 0;
      const bTime = b.lastMessageAt ? Date.parse(b.lastMessageAt) : 0;
      return bTime - aTime;
    });
    return list;
  }, []);

  const persistSnapshot = React.useCallback((snapshot: ChatSession[]) => {
    if (typeof window === "undefined") return;
    const payload: StoredState = {
      activeSessionId: activeSessionIdRef.current,
      sessions: snapshot.map((session) => ({
        id: session.id,
        friendUserId: session.friendUserId,
        friendName: session.friendName,
        friendAvatar: session.friendAvatar,
        messages: session.messages.slice(-MESSAGE_LIMIT).map((message) => ({
          id: message.id,
          authorId: message.authorId,
          body: message.body,
          sentAt: message.sentAt,
        })),
      })),
    };
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    } catch (error) {
      console.error("Chat storage persist error", error);
    }
  }, []);

  const syncState = React.useCallback(() => {
    const snapshot = buildSnapshot();
    setSessions(snapshot);
    if (hydratedRef.current) {
      persistSnapshot(snapshot);
    }
  }, [buildSnapshot, persistSnapshot]);

  const ensureSession = React.useCallback(
    (conversationId: string, friendUserId: string, name: string, avatar: string | null) => {
      const map = sessionsRef.current;
      let session = map.get(conversationId);
      if (!session) {
        session = {
          id: conversationId,
          friendUserId,
          friendName: name,
          friendAvatar: avatar,
          messages: [],
          messageIndex: new Map(),
          lastMessageTimestamp: 0,
          unreadCount: 0,
        };
        map.set(conversationId, session);
      } else {
        if (name && session.friendName !== name) {
          session.friendName = name;
        }
        if (session.friendAvatar !== avatar) {
          session.friendAvatar = avatar;
        }
      }
      return session;
    },
    [],
  );

  const addMessageToSession = React.useCallback(
    (session: ChatSessionInternal, message: ChatMessage, isLocal: boolean) => {
      const existingIndex = session.messageIndex.get(message.id);
      if (typeof existingIndex === "number") {
        const existing = session.messages[existingIndex];
        session.messages[existingIndex] = { ...existing, ...message };
      } else {
        session.messages.push(message);
        session.messageIndex.set(message.id, session.messages.length - 1);
        if (!isLocal && activeSessionIdRef.current !== session.id) {
          session.unreadCount += 1;
        }
        if (session.messages.length > MESSAGE_LIMIT) {
          const excess = session.messages.length - MESSAGE_LIMIT;
          const removed = session.messages.splice(0, excess);
          removed.forEach((removedMessage) => {
            session.messageIndex.delete(removedMessage.id);
          });
          session.messages.forEach((msg, index) => {
            session.messageIndex.set(msg.id, index);
          });
        }
      }
      const timestamp = Date.parse(message.sentAt);
      session.lastMessageTimestamp = Number.isFinite(timestamp) ? timestamp : Date.now();
      if (isLocal && activeSessionIdRef.current === session.id) {
        session.unreadCount = 0;
      }
    },
    [],
  );

  React.useEffect(() => {
    if (typeof window === "undefined") {
      hydratedRef.current = true;
      setIsReady(true);
      return;
    }
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as StoredState;
        if (parsed && Array.isArray(parsed.sessions)) {
          const map = sessionsRef.current;
          map.clear();
          parsed.sessions.forEach((stored) => {
            if (!isValidStoredSession(stored)) return;
            const session: ChatSessionInternal = {
              id: stored.id,
              friendUserId: stored.friendUserId,
              friendName: stored.friendName,
              friendAvatar: stored.friendAvatar ?? null,
              messages: [],
              messageIndex: new Map(),
              lastMessageTimestamp: 0,
              unreadCount: 0,
            };
            stored.messages.slice(-MESSAGE_LIMIT).forEach((storedMessage) => {
              if (
                storedMessage &&
                typeof storedMessage.id === "string" &&
                typeof storedMessage.authorId === "string" &&
                typeof storedMessage.body === "string" &&
                typeof storedMessage.sentAt === "string"
              ) {
                const restored: ChatMessage = {
                  id: storedMessage.id,
                  authorId: storedMessage.authorId,
                  body: storedMessage.body,
                  sentAt: storedMessage.sentAt,
                  status: "sent",
                };
                session.messages.push(restored);
                session.messageIndex.set(restored.id, session.messages.length - 1);
                const ts = Date.parse(restored.sentAt);
                if (Number.isFinite(ts)) {
                  session.lastMessageTimestamp = ts;
                }
              }
            });
            map.set(session.id, session);
          });
          if (typeof parsed.activeSessionId === "string") {
            activeSessionIdRef.current = parsed.activeSessionId;
            setActiveSessionId(parsed.activeSessionId);
          }
          setSessions(buildSnapshot());
        }
      }
    } catch (error) {
      console.error("Chat storage hydrate error", error);
    } finally {
      hydratedRef.current = true;
      setIsReady(true);
    }
  }, [buildSnapshot]);

  React.useEffect(() => {
    if (!friends.length) return;
    const friendMap = new Map<string, FriendItem>();
    friends.forEach((friend) => {
      if (friend.userId) {
        friendMap.set(friend.userId, friend);
      }
    });
    let changed = false;
    sessionsRef.current.forEach((session) => {
      const friend = friendMap.get(session.friendUserId);
      if (!friend) return;
      if (friend.name && session.friendName !== friend.name) {
        session.friendName = friend.name;
        changed = true;
      }
      const avatar = friend.avatar ?? null;
      if (session.friendAvatar !== avatar) {
        session.friendAvatar = avatar;
        changed = true;
      }
    });
    if (changed) {
      syncState();
    }
  }, [friends, syncState]);

  const handleRealtimeEvent = React.useCallback(
    (event: RealtimeEvent) => {
      const selfIds = new Set<string>();
      if (currentUserId) selfIds.add(currentUserId);
      if (resolvedSelfIdRef.current) selfIds.add(resolvedSelfIdRef.current);
      if (selfIds.size === 0) return;
      if (!event || event.name !== "chat.message") return;
      const payload = event.data as ChatMessageEventPayload;
      if (!payload || payload.type !== "chat.message") return;
      if (!Array.isArray(payload.participants)) return;
      const participantMap = new Map<string, { id: string; name?: string | null; avatar?: string | null }>();
      for (const entry of payload.participants) {
        if (!entry || typeof entry.id !== "string") continue;
        participantMap.set(entry.id, entry);
      }
      const hasSelf = Array.from(selfIds).some((id) => participantMap.has(id));
      if (!hasSelf) return;
      if (typeof payload.conversationId !== "string") return;
      if (!payload.message || typeof payload.message.id !== "string" || typeof payload.message.body !== "string") {
        return;
      }
      const senderId = typeof payload.senderId === "string" ? payload.senderId : "";
      if (!senderId) return;
      const isLocal = selfIds.has(senderId);
      const messageBody = sanitizeMessageBody(payload.message.body);
      if (!messageBody) return;
      const otherParticipant = (() => {
        for (const [id, entry] of participantMap.entries()) {
          if (!selfIds.has(id)) return entry;
        }
        return null;
      })();
      const friendUserId = otherParticipant?.id ?? (isLocal ? undefined : senderId);
      if (!friendUserId) return;
      const friendName = (otherParticipant?.name ?? friendUserId) || friendUserId;
      const friendAvatar = otherParticipant?.avatar ?? null;
      const session = ensureSession(payload.conversationId, friendUserId, friendName, friendAvatar);
      const authorIdForStorage = isLocal ? currentUserId ?? senderId : senderId;
      const chatMessage: ChatMessage = {
        id: payload.message.id,
        authorId: authorIdForStorage,
        body: messageBody,
        sentAt: payload.message.sentAt ?? new Date().toISOString(),
        status: "sent",
      };
      addMessageToSession(session, chatMessage, isLocal);
      if (!isLocal && activeSessionIdRef.current === session.id) {
        session.unreadCount = 0;
      }
      syncState();
    },
    [addMessageToSession, currentUserId, ensureSession, syncState],
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
          clientChannelNameRef.current = null;
          return;
        }
        resolvedSelfIdRef.current = resolvedClientId;
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
    };
  }, [currentUserId, envelope, handleRealtimeEvent]);

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
      const displayName = target.name || target.userId;
      const existed = sessionsRef.current.has(conversationId);
      const session = ensureSession(conversationId, target.userId, displayName, target.avatar ?? null);
      if (activate) {
        activeSessionIdRef.current = conversationId;
        setActiveSessionId(conversationId);
        session.unreadCount = 0;
      }
      syncState();
      return { id: conversationId, created: !existed };
    },
    [currentUserId, ensureSession, syncState],
  );

  const openSession = React.useCallback(
    (sessionId: string) => {
      activeSessionIdRef.current = sessionId;
      setActiveSessionId(sessionId);
      const session = sessionsRef.current.get(sessionId);
      if (session) {
        session.unreadCount = 0;
        syncState();
      }
    },
    [syncState],
  );

  const closeSession = React.useCallback(() => {
    activeSessionIdRef.current = null;
    setActiveSessionId(null);
    syncState();
  }, [syncState]);

  const deleteSession = React.useCallback(
    (sessionId: string) => {
      const map = sessionsRef.current;
      if (!map.has(sessionId)) return;
      map.delete(sessionId);
      if (activeSessionIdRef.current === sessionId) {
        activeSessionIdRef.current = null;
        setActiveSessionId(null);
      }
      syncState();
    },
    [syncState],
  );

  const sendMessage = React.useCallback(
    async (conversationId: string, body: string) => {
      const trimmed = sanitizeMessageBody(body);
      if (!trimmed) return;
      const selfIdentity = resolvedSelfIdRef.current;
      if (!selfIdentity) {
        throw new Error("Chat identity is not ready yet.");
      }
      const client = clientRef.current;
      if (!client) {
        throw new Error("Chat connection is not ready yet.");
      }
      const session = sessionsRef.current.get(conversationId);
      if (!session) {
        throw new Error("Chat session not found.");
      }
      const messageId = createMessageId();
      const sentAt = new Date().toISOString();
      const localMessage: ChatMessage = {
        id: messageId,
        authorId: currentUserId ?? selfIdentity,
        body: trimmed,
        sentAt,
        status: "pending",
      };
      addMessageToSession(session, localMessage, true);
      syncState();

      const selfParticipant = {
        id: selfIdentity,
        name: user?.name ?? user?.email ?? currentUserId ?? selfIdentity,
        avatar: user?.avatarUrl ?? null,
      };
      const friendParticipant = {
        id: session.friendUserId,
        name: session.friendName,
        avatar: session.friendAvatar,
      };
      const payload: ChatMessageEventPayload = {
        type: "chat.message",
        conversationId,
        senderId: selfIdentity,
        participants: [selfParticipant, friendParticipant],
        message: {
          id: messageId,
          body: trimmed,
          sentAt,
        },
      };

      try {
        const friendChannel = getChatDirectChannel(session.friendUserId);
        const selfChannel = clientChannelNameRef.current ?? getChatDirectChannel(selfIdentity);
        await Promise.all([
          client.publish(friendChannel, "chat.message", payload),
          client.publish(selfChannel, "chat.message", payload),
        ]);
        const index = session.messageIndex.get(messageId);
        if (typeof index === "number") {
          const existing = session.messages[index];
          if (existing) {
            session.messages[index] = { ...existing, status: "sent" };
          }
        }
        syncState();
      } catch (error) {
        const index = session.messageIndex.get(messageId);
        if (typeof index === "number") {
          const existing = session.messages[index];
          if (existing) {
            session.messages[index] = { ...existing, status: "failed" };
          }
        }
        syncState();
        throw error;
      }
    },
    [addMessageToSession, currentUserId, syncState, user],
  );

  const unreadCount = React.useMemo(() => {
    return sessions.reduce((total, session) => total + session.unreadCount, 0);
  }, [sessions]);

  const activeSession = React.useMemo(() => {
    if (!activeSessionId) return null;
    return sessions.find((session) => session.id === activeSessionId) ?? null;
  }, [activeSessionId, sessions]);

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
      openSession,
      closeSession,
      deleteSession,
      sendMessage,
    }),
    [activeSession, activeSessionId, closeSession, currentUserId, deleteSession, isReady, openSession, sendMessage, sessions, startChat, unreadCount],
  );

  return <ChatContext.Provider value={contextValue}>{children}</ChatContext.Provider>;
}

export function useChatFriendlyTarget(friend: FriendItem): ChatFriendTarget | null {
  return React.useMemo(() => coerceFriendTarget(friend), [friend]);
}

