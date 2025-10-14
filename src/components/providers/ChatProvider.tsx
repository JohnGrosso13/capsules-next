"use client";

import * as React from "react";

import { getRealtimeClientFactory } from "@/config/realtime-client";
import { useFriendsDataContext } from "@/components/providers/FriendsDataProvider";
import { buildRealtimeEnvelope } from "@/lib/realtime/envelope";
import { requestRealtimeToken } from "@/lib/realtime/token";
import { ChatEngine } from "@/lib/chat/chat-engine";
import type { FriendItem } from "@/hooks/useFriendsData";
import { useCurrentUser } from "@/services/auth/client";
import type { ChatSession, ChatParticipant } from "./chat-store";

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
  notifyTyping: (conversationId: string, typing: boolean) => void;
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
  const engineRef = React.useRef<ChatEngine | null>(null);
  if (!engineRef.current) {
    engineRef.current = new ChatEngine();
  }
  const engine = engineRef.current;

  const [snapshot, setSnapshot] = React.useState(() => engine.getSnapshot());
  const [isReady, setIsReady] = React.useState(false);

  React.useEffect(() => engine.subscribe(setSnapshot), [engine]);

  React.useEffect(() => {
    if (typeof window === "undefined") {
      engine.hydrate(null);
      setIsReady(true);
      return;
    }
    engine.hydrate(window.localStorage);
    setIsReady(true);
  }, [engine]);

  const { user } = useCurrentUser();

  React.useEffect(() => {
    engine.setUserProfile({
      id: user?.id ?? null,
      name: user?.name ?? null,
      email: user?.email ?? null,
      avatarUrl: user?.avatarUrl ?? null,
    });
  }, [engine, user?.avatarUrl, user?.email, user?.id, user?.name]);

  const friendsContext = useFriendsDataContext();
  const friends = friendsContext.friends;
  const viewerId = friendsContext.viewerId ?? null;

  React.useEffect(() => {
    engine.setFriends(friends);
  }, [engine, friends]);

  React.useEffect(() => {
    engine.setSupabaseUserId(viewerId);
  }, [engine, viewerId]);

  React.useEffect(() => {
    if (!viewerId) return;
    void engine.bootstrapInbox();
  }, [engine, viewerId]);

  React.useEffect(() => {
    const envelope = buildRealtimeEnvelope(user);
    const factory = getRealtimeClientFactory();
    void engine.connectRealtime({
      currentUserId: user?.id ?? null,
      envelope,
      factory,
      requestToken: requestRealtimeToken,
    });
    return () => {
      void engine.disconnectRealtime();
    };
  }, [engine, user]);

  const startChat = React.useCallback(
    (target: ChatFriendTarget, options?: { activate?: boolean }): StartChatResult | null => {
      const participant = friendTargetToParticipant(target);
      if (!participant) return null;
      return engine.startDirectChat(participant, options);
    },
    [engine],
  );

  const startGroupChat = React.useCallback(
    async (input: CreateGroupChatInput): Promise<StartChatResult | null> => {
      const participants = (Array.isArray(input.participants) ? input.participants : [])
        .map((target) => friendTargetToParticipant(target))
        .filter((participant): participant is ChatParticipant => Boolean(participant));
      if (!participants.length) {
        console.warn("startGroupChat requires at least one participant.");
        return null;
      }
      return engine.startGroupChat(participants, input.name, { activate: input.activate ?? true });
    },
    [engine],
  );

  const addParticipantsToGroup = React.useCallback(
    async (conversationId: string, targets: ChatFriendTarget[]) => {
      const participants = targets
        .map((target) => friendTargetToParticipant(target))
        .filter((participant): participant is ChatParticipant => Boolean(participant));
      if (!participants.length) return;
      await engine.addParticipantsToGroup(conversationId, participants);
    },
    [engine],
  );

  const renameGroupChat = React.useCallback(
    async (conversationId: string, name: string) => {
      await engine.renameGroupChat(conversationId, name);
    },
    [engine],
  );

  const openSession = React.useCallback(
    (sessionId: string) => {
      engine.openSession(sessionId);
    },
    [engine],
  );

  const closeSession = React.useCallback(() => {
    engine.closeSession();
  }, [engine]);

  const deleteSession = React.useCallback(
    (sessionId: string) => {
      engine.deleteSession(sessionId);
    },
    [engine],
  );

  const sendMessage = React.useCallback(
    async (conversationId: string, body: string) => {
      await engine.sendMessage(conversationId, body);
    },
    [engine],
  );

  const notifyTyping = React.useCallback(
    (conversationId: string, typing: boolean) => {
      engine.notifyTyping(conversationId, typing);
    },
    [engine],
  );

  const { sessions, activeSessionId, activeSession, unreadCount } = snapshot;
  const currentUserId = user?.id ?? null;
  const selfClientId = engine.getSelfClientId();

  const contextValue = React.useMemo<ChatContextValue>(
    () => ({
      sessions,
      activeSessionId,
      activeSession,
      unreadCount,
      currentUserId,
      selfClientId,
      isReady,
      startChat,
      startGroupChat,
      addParticipantsToGroup,
      renameGroupChat,
      openSession,
      closeSession,
      deleteSession,
      sendMessage,
      notifyTyping,
    }),
    [
      sessions,
      activeSessionId,
      activeSession,
      unreadCount,
      currentUserId,
      selfClientId,
      isReady,
      startChat,
      startGroupChat,
      addParticipantsToGroup,
      renameGroupChat,
      openSession,
      closeSession,
      deleteSession,
      sendMessage,
      notifyTyping,
    ],
  );

  return <ChatContext.Provider value={contextValue}>{children}</ChatContext.Provider>;
}

export function useChatFriendlyTarget(friend: FriendItem): ChatFriendTarget | null {
  return React.useMemo(() => coerceFriendTarget(friend), [friend]);
}
