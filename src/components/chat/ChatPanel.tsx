"use client";

import * as React from "react";
import { Plus, ChatsTeardrop } from "@phosphor-icons/react/dist/ssr";

import { useChatContext } from "@/components/providers/ChatProvider";
import type { ChatFriendTarget, ChatSession } from "@/components/providers/ChatProvider";
import type { FriendItem } from "@/hooks/useFriendsData";

import styles from "./chat.module.css";
import { ChatConversation } from "./ChatConversation";
import { ChatList } from "./ChatList";
import { ChatStartOverlay } from "./ChatStartOverlay";

type ChatPanelVariant = "page" | "rail";

type ChatPanelProps = {
  variant?: ChatPanelVariant;
  emptyNotice?: React.ReactNode;
  onInviteToGroup?: (session: ChatSession) => void;
  friends?: FriendItem[];
};

export function ChatPanel({ variant = "page", emptyNotice, onInviteToGroup, friends }: ChatPanelProps) {
  const {
    sessions,
    activeSession,
    activeSessionId,
    currentUserId,
    selfClientId,
    startChat,
    startGroupChat,
    sendMessage,
    toggleMessageReaction,
    notifyTyping,
    openSession,
    closeSession,
    deleteSession,
    renameGroupChat,
    removeMessageAttachments,
    deleteMessage,
    isReady,
  } = useChatContext();
  const [startOverlayOpen, setStartOverlayOpen] = React.useState(false);
  const [startBusy, setStartBusy] = React.useState(false);
  const [startError, setStartError] = React.useState<string | null>(null);

  const eligibleFriends = React.useMemo(() => {
    const seen = new Set<string>();
    return (friends ?? []).filter((friend) => {
      if (!friend.userId) return false;
      if (seen.has(friend.userId)) return false;
      seen.add(friend.userId);
      return true;
    });
  }, [friends]);

  const friendTargetMap = React.useMemo(() => {
    const map = new Map<string, ChatFriendTarget>();
    eligibleFriends.forEach((friend) => {
      if (!friend.userId) return;
      map.set(friend.userId, {
        userId: friend.userId,
        name: friend.name || friend.userId,
        avatar: friend.avatar ?? null,
      });
    });
    return map;
  }, [eligibleFriends]);

  const canStartNewChat = eligibleFriends.length > 0;

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

  const handleOpenStartOverlay = React.useCallback(() => {
    if (!canStartNewChat) return;
    setStartError(null);
    setStartOverlayOpen(true);
  }, [canStartNewChat]);

  const handleCloseStartOverlay = React.useCallback(() => {
    setStartOverlayOpen(false);
    setStartError(null);
    setStartBusy(false);
  }, []);

  const handleStartSubmit = React.useCallback(
    async (userIds: string[]) => {
      if (!userIds.length) {
        setStartError("Select at least one friend to continue.");
        return;
      }
      const targets = userIds
        .map((id) => friendTargetMap.get(id))
        .filter((target): target is ChatFriendTarget => Boolean(target));
      if (!targets.length) {
        setStartError("Those friends are unavailable right now.");
        return;
      }
      setStartBusy(true);
      setStartError(null);
      try {
        if (targets.length === 1) {
          const result = startChat(targets[0]!, { activate: true });
          if (!result) {
            throw new Error("Unable to open that chat right now.");
          }
        } else {
          const result = await startGroupChat({ participants: targets, activate: true });
          if (!result) {
            throw new Error("Unable to create that chat right now.");
          }
        }
        setStartOverlayOpen(false);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unable to start that chat.";
        setStartError(message);
      } finally {
        setStartBusy(false);
      }
    },
    [friendTargetMap, startChat, startGroupChat],
  );

  if (!isReady && sessions.length === 0) {
    return (
      <div className={styles.chatPanel} data-variant={variant}>
        <div className={styles.chatEmpty}>
          <p>Loading chats...</p>
        </div>
        <ChatStartOverlay
          open={startOverlayOpen}
          friends={eligibleFriends}
          busy={startBusy}
          error={startError}
          onClose={handleCloseStartOverlay}
          onSubmit={handleStartSubmit}
        />
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
          onRemoveAttachments={(messageId, attachmentIds) =>
            removeMessageAttachments(activeSession.id, messageId, attachmentIds)
          }
          onDeleteMessage={(messageId) => deleteMessage(activeSession.id, messageId)}
          {...(onInviteToGroup
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
      <div className={styles.chatListShell}>
        <div className={styles.chatListHeader}>
          <div className={styles.chatListTitleBlock}>
            <span className={styles.chatListTitle}>
              <ChatsTeardrop size={18} weight="fill" />
              <span>Chats</span>
            </span>
            <span className={styles.chatListSubtitle}>Tap + to start a DM or group chat</span>
          </div>
          <button
            type="button"
            className={styles.chatListActionButton}
            onClick={handleOpenStartOverlay}
            disabled={!canStartNewChat}
            aria-label="Start a new chat"
            title={canStartNewChat ? "Start a new chat" : "Add friends to start a chat"}
          >
            <Plus size={16} weight="bold" />
          </button>
        </div>
        <ChatList
          sessions={sessions}
          activeSessionId={activeSessionId}
          onSelect={handleSelect}
          onDelete={handleDelete}
          emptyNotice={emptyNotice}
          selfIdentifiers={selfIdentifiers}
        />
      </div>

      <ChatStartOverlay
        open={startOverlayOpen}
        friends={eligibleFriends}
        busy={startBusy}
        error={startError}
        onClose={handleCloseStartOverlay}
        onSubmit={handleStartSubmit}
      />
    </div>
  );
}
