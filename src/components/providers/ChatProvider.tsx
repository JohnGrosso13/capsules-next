"use client";

import * as React from "react";

import { getRealtimeClientFactory } from "@/config/realtime-client";
import { useFriendsDataContext } from "@/components/providers/FriendsDataProvider";
import { buildRealtimeEnvelope } from "@/lib/realtime/envelope";
import { requestRealtimeToken } from "@/lib/realtime/token";
import { ChatEngine } from "@/lib/chat/chat-engine";
import type { FriendItem } from "@/hooks/useFriendsData";
import { useCurrentUser } from "@/services/auth/client";
import { preferDisplayName } from "@/lib/users/format";
import type { ChatSession, ChatParticipant, ChatMessageAttachment } from "./chat-store";

export type {
  ChatSession,
  ChatSessionType,
  ChatParticipant,
  ChatMessage,
  ChatMessageAttachment,
} from "./chat-store";
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

type PendingChatStart = {
  target: ChatFriendTarget;
  options?: { activate?: boolean } | undefined;
  resolve?: (result: StartChatResult | null) => void;
};

type ChatStartQueueHost = {
  __capsulesChatStartQueue?: PendingChatStart[];
};

export type CreateGroupChatInput = {
  name?: string;
  participants: ChatFriendTarget[];
  activate?: boolean;
};

export type ChatMessageSendInput = {
  body: string;
  attachments?: ChatMessageAttachment[];
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
  deleteSession: (sessionId: string) => Promise<void>;
  sendMessage: (conversationId: string, input: ChatMessageSendInput) => Promise<void>;
  toggleMessageReaction: (
    conversationId: string,
    messageId: string,
    emoji: string,
  ) => Promise<void>;
  notifyTyping: (conversationId: string, typing: boolean) => void;
  removeMessageAttachments: (
    conversationId: string,
    messageId: string,
    attachmentIds: string[],
  ) => Promise<void>;
  deleteMessage: (conversationId: string, messageId: string) => Promise<void>;
};

const ChatContext = React.createContext<ChatContextValue | null>(null);
const CHAT_START_EVENT = "capsules:chat:start";
const CHAT_START_FLUSH_EVENT = "capsules:chat:start:flush";

type ChatStartEventDetail = {
  target: ChatFriendTarget;
  options?: { activate?: boolean } | undefined;
  resolve?: ((result: StartChatResult | null) => void) | undefined;
};

type ChatStartEvent = CustomEvent<ChatStartEventDetail>;

function getChatStartQueue(): PendingChatStart[] {
  if (typeof window === "undefined") return [];
  const host = window as typeof window & ChatStartQueueHost;
  if (!Array.isArray(host.__capsulesChatStartQueue)) {
    host.__capsulesChatStartQueue = [];
  }
  return host.__capsulesChatStartQueue;
}

export function useChatContext(): ChatContextValue {
  const context = React.useContext(ChatContext);
  if (!context) {
    throw new Error("useChatContext must be used within a ChatProvider");
  }
  return context;
}

export function requestChatStart(
  target: ChatFriendTarget,
  options?: { activate?: boolean },
): Promise<StartChatResult | null> {
  if (typeof window === "undefined") {
    return Promise.resolve(null);
  }
  return new Promise<StartChatResult | null>((resolve) => {
    let handled = false;
    const detail: ChatStartEventDetail = {
      target,
      options,
      resolve: (result) => {
        handled = true;
        resolve(result ?? null);
      },
    };
    window.dispatchEvent(new CustomEvent<ChatStartEventDetail>(CHAT_START_EVENT, { detail }));
    if (handled) return;
    const queue = getChatStartQueue();
    queue.push({ target, options, resolve });
    window.dispatchEvent(new Event(CHAT_START_FLUSH_EVENT));
  });
}

function coerceFriendTarget(friend: FriendItem): ChatFriendTarget | null {
  if (!friend.userId) return null;
  const name = preferDisplayName({
    name: friend.name,
    handle: friend.key ?? null,
    fallback: friend.userId,
    fallbackLabel: "Friend",
  });
  return {
    userId: friend.userId,
    name,
    avatar: friend.avatar ?? null,
  };
}

function friendTargetToParticipant(target: ChatFriendTarget): ChatParticipant {
  const name = preferDisplayName({
    name: target.name,
    fallback: target.userId,
    fallbackLabel: "Friend",
  });
  return {
    id: target.userId,
    name,
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

  React.useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const FALLBACK_INTERVAL_MS = 8000;
    let stopped = false;
    let pending = false;
    const tick = async () => {
      if (stopped || pending) return;
      if (engine.isRealtimeConnected()) return;
      pending = true;
      try {
        await engine.refreshInbox();
        const activeId = engine.getSnapshot().activeSessionId;
        if (activeId) {
          await engine.refreshConversationHistory(activeId);
        }
      } finally {
        pending = false;
      }
    };
    const interval = window.setInterval(() => {
      void tick();
    }, FALLBACK_INTERVAL_MS);
    return () => {
      stopped = true;
      window.clearInterval(interval);
    };
  }, [engine]);

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

  React.useEffect(() => {
    if (typeof window === "undefined") return;
    const flushQueuedStarts = () => {
      const queue = getChatStartQueue();
      while (queue.length > 0) {
        const next = queue.shift();
        if (!next) continue;
        const result = startChat(next.target, next.options);
        next.resolve?.(result ?? null);
      }
    };
    const handler = (event: Event) => {
      const custom = event as ChatStartEvent;
      const detail = custom.detail;
      if (!detail?.target) return;
      const result = startChat(detail.target, detail.options);
      detail.resolve?.(result ?? null);
    };
    flushQueuedStarts();
    window.addEventListener(CHAT_START_EVENT, handler as EventListener);
    window.addEventListener(CHAT_START_FLUSH_EVENT, flushQueuedStarts as EventListener);
    return () => {
      window.removeEventListener(CHAT_START_EVENT, handler as EventListener);
      window.removeEventListener(CHAT_START_FLUSH_EVENT, flushQueuedStarts as EventListener);
    };
  }, [startChat]);

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
    async (sessionId: string) => {
      const session = engine.getSnapshot().sessions.find((item) => item.id === sessionId) ?? null;
      if (session?.type === "group") {
        await engine.deleteGroupConversation(sessionId);
      } else {
        engine.deleteSession(sessionId);
      }
    },
    [engine],
  );

  const sendMessage = React.useCallback(
    async (conversationId: string, input: ChatMessageSendInput) => {
      await engine.sendMessage(conversationId, input);
    },
    [engine],
  );

  const toggleMessageReaction = React.useCallback(
    async (conversationId: string, messageId: string, emoji: string) => {
      await engine.toggleMessageReaction(conversationId, messageId, emoji);
    },
    [engine],
  );

  const notifyTyping = React.useCallback(
    (conversationId: string, typing: boolean) => {
      engine.notifyTyping(conversationId, typing);
    },
    [engine],
  );

  const removeMessageAttachments = React.useCallback(
    async (conversationId: string, messageId: string, attachmentIds: string[]) => {
      await engine.updateMessageAttachments(conversationId, messageId, attachmentIds);
    },
    [engine],
  );

  const deleteMessage = React.useCallback(
    async (conversationId: string, messageId: string) => {
      await engine.deleteMessage(conversationId, messageId);
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
      toggleMessageReaction,
      notifyTyping,
      removeMessageAttachments,
      deleteMessage,
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
      toggleMessageReaction,
      notifyTyping,
      removeMessageAttachments,
      deleteMessage,
    ],
  );

  return <ChatContext.Provider value={contextValue}>{children}</ChatContext.Provider>;
}

export function useChatFriendlyTarget(friend: FriendItem): ChatFriendTarget | null {
  return React.useMemo(() => coerceFriendTarget(friend), [friend]);
}
