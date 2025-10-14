"use client";

import * as React from "react";

import { useChatContext } from "@/components/providers/ChatProvider";
import type { ChatSession } from "@/components/providers/ChatProvider";

import styles from "./chat.module.css";
import { ChatConversation } from "./ChatConversation";
import { ChatList } from "./ChatList";

type ChatPanelVariant = "page" | "rail";

type ChatPanelProps = {
  variant?: ChatPanelVariant;
  emptyNotice?: React.ReactNode;
  onInviteToGroup?: (session: ChatSession) => void;
};

export function ChatPanel({ variant = "page", emptyNotice, onInviteToGroup }: ChatPanelProps) {
  const {
    sessions,
    activeSession,
    activeSessionId,
    currentUserId,
    selfClientId,
    sendMessage,
    notifyTyping,
    openSession,
    closeSession,
    deleteSession,
    isReady,
  } = useChatContext();

  const selfIdentifiers = React.useMemo(() => {
    const identifiers: string[] = [];
    if (currentUserId) identifiers.push(currentUserId);
    if (selfClientId && selfClientId !== currentUserId) identifiers.push(selfClientId);
    return identifiers;
  }, [currentUserId, selfClientId]);

  const handleSelect = React.useCallback(
    (sessionId: string) => {
      openSession(sessionId);
    },
    [openSession],
  );

  const handleDelete = React.useCallback(
    (sessionId: string) => {
      deleteSession(sessionId);
    },
    [deleteSession],
  );

  if (!isReady && sessions.length === 0) {
    return (
      <div className={styles.chatPanel} data-variant={variant}>
        <div className={styles.chatEmpty}>
          <p>Loading chats...</p>
        </div>
      </div>
    );
  }

  if (activeSession) {
    return (
      <div className={styles.chatPanel} data-variant={variant}>
        <ChatConversation
          session={activeSession}
          currentUserId={currentUserId}
          selfClientId={selfClientId}
          onSend={(body) => sendMessage(activeSession.id, body)}
          onTypingChange={notifyTyping}
          onBack={closeSession}
          onDelete={() => handleDelete(activeSession.id)}
          {...(onInviteToGroup
            ? { onInviteParticipants: () => onInviteToGroup(activeSession) }
            : {})}
        />
      </div>
    );
  }

  return (
    <div className={styles.chatPanel} data-variant={variant}>
      <ChatList
        sessions={sessions}
        activeSessionId={activeSessionId}
        onSelect={handleSelect}
        onDelete={handleDelete}
        emptyNotice={emptyNotice}
        selfIdentifiers={selfIdentifiers}
      />
    </div>
  );
}
