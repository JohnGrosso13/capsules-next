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
    toggleMessageReaction,
    notifyTyping,
    openSession,
    closeSession,
    deleteSession,
    renameGroupChat,
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
      void deleteSession(sessionId);
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
          onSend={(input) => sendMessage(activeSession.id, input)}
          onToggleReaction={toggleMessageReaction}
          onTypingChange={notifyTyping}
          onBack={closeSession}
          onDelete={() => handleDelete(activeSession.id)}
          {...(activeSession.type === "group" && onInviteToGroup
            ? { onInviteParticipants: () => onInviteToGroup(activeSession) }
            : {})}
          {...(activeSession.type === "group"
            ? {
                onRenameGroup: async () => {
                  const nextName = window.prompt("Rename group", activeSession.title ?? "")?.trim();
                  if (!nextName || nextName === activeSession.title) return;
                  try {
                    await renameGroupChat(activeSession.id, nextName);
                  } catch (error) {
                    console.error("Group rename error", error);
                    window.alert("Unable to rename this group right now.");
                  }
                },
              }
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
