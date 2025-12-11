"use client";

import * as React from "react";
import { Plus, ChatsTeardrop } from "@phosphor-icons/react/dist/ssr";

import { useChatContext } from "@/components/providers/ChatProvider";
import type { ChatFriendTarget, ChatSession } from "@/components/providers/ChatProvider";
import type { FriendItem } from "@/hooks/useFriendsData";
import { preferDisplayName } from "@/lib/users/format";

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
  showHeader?: boolean;
  frameless?: boolean;
};

export function ChatPanel({
  variant = "page",
  emptyNotice,
  onInviteToGroup,
  friends,
  showHeader = true,
  frameless = false,
}: ChatPanelProps) {
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
      const name = preferDisplayName({
        name: friend.name,
        handle: friend.key ?? null,
        fallback: friend.userId,
        fallbackLabel: "Friend",
      });
      map.set(friend.userId, {
        userId: friend.userId,
        name,
        avatar: friend.avatar ?? null,
      });
    });
    return map;
  }, [eligibleFriends]);

  const friendLookup = React.useMemo(() => {
    const map = new Map<string, { name: string | null; avatar: string | null }>();
    eligibleFriends.forEach((friend) => {
      const name = preferDisplayName({
        name: friend.name,
        handle: friend.key ?? null,
        fallback: friend.userId,
        fallbackLabel: "Friend",
      });
      const avatar = friend.avatar ?? null;
      const identifiers: string[] = [];
      if (typeof friend.userId === "string") identifiers.push(friend.userId);
      if (typeof friend.key === "string") identifiers.push(friend.key);
      if (typeof friend.id === "string" || typeof friend.id === "number") {
        identifiers.push(String(friend.id));
      }
      identifiers.forEach((identifier) => {
        const trimmed = identifier.trim();
        if (!trimmed || map.has(trimmed)) return;
        map.set(trimmed, { name, avatar });
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
    <div
      className={`${styles.chatPanel} ${frameless ? styles.chatPanelBare : ""}`.trim()}
      data-variant={variant}
    >
      <div className={styles.chatListShell}>
        {showHeader ? (
          <div className={styles.chatListHeader}>
            <div className={styles.chatListTitleBlock}>
              <span className={styles.chatListTitleIcon} aria-hidden>
                <ChatsTeardrop size={18} weight="duotone" />
              </span>
              <span className={styles.chatListTitle}>Chats</span>
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
        ) : null}
        <ChatList
          sessions={sessions}
          activeSessionId={activeSessionId}
          onSelect={handleSelect}
          onDelete={handleDelete}
          emptyNotice={emptyNotice}
          selfIdentifiers={selfIdentifiers}
          friendLookup={friendLookup}
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
