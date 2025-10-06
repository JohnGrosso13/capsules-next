"use client";

import * as React from "react";

import { useChatContext } from "@/components/providers/ChatProvider";

import styles from "./chat.module.css";
import { PaperPlaneTilt } from "@phosphor-icons/react/dist/ssr";
import { ChatConversation } from "./ChatConversation";
import { ChatList } from "./ChatList";

type ChatPanelVariant = "page" | "rail";

type ChatPanelProps = {
  variant?: ChatPanelVariant;
  emptyNotice?: React.ReactNode;
};

export function ChatPanel({ variant = "page", emptyNotice }: ChatPanelProps) {
  const {
    sessions,
    activeSession,
    activeSessionId,
    currentUserId,
    selfClientId,
    sendMessage,
    openSession,
    closeSession,
    deleteSession,
    isReady,
  } = useChatContext();

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
          onBack={closeSession}
          onDelete={() => handleDelete(activeSession.id)}
        />
      </div>
    );
  }

  if (variant === "rail") {
    return (
      <div className={styles.chatPanel} data-variant={variant}>
        <div className={styles.placeholderHeader}>Live Chat</div>
        <div className={styles.placeholderScroll}>
          <div className={styles.placeholderEmpty}>Be the first to say hello 👋</div>
        </div>
        <form className={styles.composer} onSubmit={(e) => e.preventDefault()}>
          <input className={styles.messageInput} placeholder="Type your message…" disabled />
          <button className={styles.sendButton} type="button" disabled>
            <PaperPlaneTilt size={18} weight="bold" className={styles.sendButtonIcon} />
            Send
          </button>
        </form>
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
      />
    </div>
  );
}
