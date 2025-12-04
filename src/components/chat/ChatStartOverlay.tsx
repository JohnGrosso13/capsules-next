"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import Image from "next/image";
import { CheckCircle, ChatsTeardrop, MagnifyingGlass, PlusCircle, X } from "@phosphor-icons/react/dist/ssr";

import type { FriendItem } from "@/hooks/useFriendsData";
import { preferDisplayName } from "@/lib/users/format";

import styles from "./GroupChatOverlay.module.css";

type ChatStartOverlayMode = "chat" | "ladder" | "tournament" | "party";

type ChatStartOverlayProps = {
  open: boolean;
  friends: FriendItem[];
  busy?: boolean;
  error?: string | null;
  onClose: () => void;
  onSubmit: (userIds: string[]) => Promise<void> | void;
  mode?: ChatStartOverlayMode;
};

type SelectableFriend = {
  userId: string;
  name: string;
  avatar: string | null;
  status: FriendItem["status"];
};

function initialsFromName(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return "?";
  const parts = trimmed.split(/\s+/);
  if (parts.length === 1) {
    return parts[0]!.slice(0, 2).toUpperCase();
  }
  return `${parts[0]![0] ?? ""}${parts[parts.length - 1]![0] ?? ""}`.toUpperCase();
}

function statusClass(status: FriendItem["status"]): string {
  switch (status) {
    case "online":
      return styles.statusOnline ?? "";
    case "away":
      return styles.statusAway ?? "";
    default:
      return styles.statusOffline ?? "";
  }
}

export function ChatStartOverlay({
  open,
  friends,
  busy,
  error,
  onClose,
  onSubmit,
  mode = "chat",
}: ChatStartOverlayProps) {
  const [mounted, setMounted] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [selection, setSelection] = React.useState<Set<string>>(new Set());
  const searchInputRef = React.useRef<HTMLInputElement | null>(null);

  React.useEffect(() => {
    setMounted(true);
  }, []);

  React.useEffect(() => {
    if (!open) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose, open]);

  React.useEffect(() => {
    if (!open) return;
    setSelection(new Set());
    setQuery("");
    const focusTimer = window.setTimeout(() => searchInputRef.current?.focus(), 0);
    return () => {
      window.clearTimeout(focusTimer);
    };
  }, [open]);

  React.useEffect(() => {
    if (!open || typeof document === "undefined") return;
    const body = document.body;
    const previousOverflow = body.style.overflow;
    body.style.overflow = "hidden";
    return () => {
      body.style.overflow = previousOverflow;
    };
  }, [open]);

  const candidates = React.useMemo<SelectableFriend[]>(() => {
    const seen = new Set<string>();
    return friends.reduce<SelectableFriend[]>((list, friend) => {
      if (!friend.userId || seen.has(friend.userId)) return list;
      seen.add(friend.userId);
      const name = preferDisplayName({
        name: friend.name,
        handle: friend.key ?? null,
        fallback: friend.userId,
        fallbackLabel: "Friend",
      });
      list.push({
        userId: friend.userId,
        name,
        avatar: friend.avatar ?? null,
        status: friend.status,
      });
      return list;
    }, []);
  }, [friends]);

  const filtered = React.useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return candidates;
    return candidates.filter(
      (friend) =>
        friend.name.toLowerCase().includes(term) || friend.userId.toLowerCase().includes(term),
    );
  }, [candidates, query]);

  const toggleSelection = React.useCallback(
    (userId: string) => {
      if (busy) return;
      setSelection((prev) => {
        const next = new Set(prev);
        if (next.has(userId)) {
          next.delete(userId);
        } else {
          next.add(userId);
        }
        return next;
      });
    },
    [busy],
  );

  const handleSubmit = React.useCallback(async () => {
    if (busy) return;
    await onSubmit(Array.from(selection));
  }, [busy, onSubmit, selection]);

  const selectedCount = selection.size;
  const hasFriends = candidates.length > 0;
  const hasResults = filtered.length > 0;

  if (!mounted || !open || typeof document === "undefined") {
    return null;
  }

  let titleText: string;
  let subtitleText: string;
  let primaryLabel: string;
  let summary: string;
  let emptyTitle: string;
  let emptyBody: string;
  let closeAriaLabel: string;

  if (mode === "ladder") {
    titleText = "Invite players to this ladder";
    subtitleText = "Choose friends to add as ladder members.";
    primaryLabel = "Invite";
    summary =
      selectedCount === 0
        ? "Pick at least one friend to invite to this ladder."
        : selectedCount === 1
          ? "This friend will be added as a ladder member."
          : "These friends will be added as ladder members.";
    emptyTitle = "No friends are ready to invite yet.";
    emptyBody = "Add friends so you can invite them to ladders.";
    closeAriaLabel = "Close ladder invites";
  } else if (mode === "tournament") {
    titleText = "Invite entrants to this bracket";
    subtitleText = "Choose friends to seed into this tournament.";
    primaryLabel = "Invite";
    summary =
      selectedCount === 0
        ? "Pick at least one friend to invite to this tournament."
        : selectedCount === 1
          ? "This friend will be added as a tournament entrant."
          : "These friends will be added as tournament entrants.";
    emptyTitle = "No friends are ready to invite yet.";
    emptyBody = "Add friends so you can invite them to tournaments.";
    closeAriaLabel = "Close tournament invites";
  } else if (mode === "party") {
    titleText = "Invite friends to this party";
    subtitleText = "Send friends an invite to join your party chat.";
    primaryLabel = selectedCount <= 1 ? "Send invite" : "Send invites";
    summary =
      selectedCount === 0
        ? "Pick at least one friend to invite to this party."
        : selectedCount === 1
          ? "This friend will get a party invite."
          : "These friends will get party invites.";
    emptyTitle = "No friends are ready to invite yet.";
    emptyBody = "Add friends so you can invite them to party chats.";
    closeAriaLabel = "Close party invites";
  } else {
    titleText = "Start a chat";
    subtitleText = "Invite one friend for DMs or many for a group.";
    primaryLabel = selectedCount <= 1 ? "Start chat" : "Start group chat";
    summary =
      selectedCount === 0
        ? "Pick at least one friend to start messaging."
        : selectedCount === 1
          ? "This will open a direct message."
          : "This will start a new group chat.";
    emptyTitle = "No friends are ready for chat yet.";
    emptyBody = "Add friends to start a conversation.";
    closeAriaLabel = "Close start chat";
  }

  return createPortal(
    <div className={styles.overlay} role="dialog" aria-modal="true" aria-labelledby="chat-start-title">
      <div className={styles.backdrop} onClick={onClose} aria-hidden="true" />
      <div className={`${styles.panel} ${styles.chatStartPanel ?? ""}`.trim()}>
        <div className={styles.header}>
          <div className={styles.titleGroup}>
            <span id="chat-start-title" className={styles.title}>
              {titleText}
            </span>
            <span className={styles.subtitle}>{subtitleText}</span>
          </div>
          <button
            type="button"
            className={styles.closeButton}
            onClick={onClose}
            aria-label={closeAriaLabel}
            disabled={busy}
          >
            <X size={18} weight="bold" />
          </button>
        </div>

        <div className={`${styles.searchRow ?? ""} ${styles.chatStartSearch ?? ""}`.trim()}>
          <MagnifyingGlass size={16} weight="bold" />
          <input
            ref={searchInputRef}
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search friends"
            className={styles.searchInput ?? ""}
            aria-label="Search friends"
          />
        </div>

        <div className={styles.body}>
          <div className={styles.friendList}>
            {!hasFriends ? (
              <div className={styles.friendListEmpty}>
                <p>{emptyTitle}</p>
                <p>{emptyBody}</p>
              </div>
            ) : !hasResults ? (
              <div className={styles.friendListEmpty}>
                <p>No friends match that search.</p>
              </div>
            ) : (
              filtered.map((friend) => {
                const isSelected = selection.has(friend.userId);
                return (
                  <div
                    key={friend.userId}
                    className={`${styles.friendItem} ${styles.friendItemSelectable}`.trim()}
                  >
                    <span className={styles.friendAvatar} aria-hidden>
                      {friend.avatar ? (
                        <Image src={friend.avatar} alt="" width={42} height={42} sizes="42px" />
                      ) : (
                        <span>{initialsFromName(friend.name ?? friend.userId)}</span>
                      )}
                    </span>
                    <div className={styles.friendMeta}>
                      <span className={styles.friendName}>{friend.name}</span>
                      <span className={`${styles.friendStatus} ${statusClass(friend.status)}`.trim()}>
                        {friend.status === "online"
                          ? "Online"
                          : friend.status === "away"
                            ? "Away"
                            : "Offline"}
                      </span>
                    </div>
                    <div className={styles.friendAction}>
                      <button
                        type="button"
                        className={`${styles.toggleButton} ${isSelected ? styles.toggleActive : ""}`.trim()}
                        onClick={() => toggleSelection(friend.userId)}
                        disabled={busy}
                      >
                        {isSelected ? (
                          <CheckCircle size={18} weight="fill" />
                        ) : (
                          <PlusCircle size={18} weight="bold" />
                        )}
                        <span>{isSelected ? "Selected" : "Add"}</span>
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        <div className={styles.footer}>
          <div className={styles.summary}>{summary}</div>
          {error ? <div className={styles.error}>{error}</div> : null}
          <div className={styles.actions}>
            <button
              type="button"
              className={styles.secondaryButton}
              onClick={onClose}
              disabled={busy}
            >
              Cancel
            </button>
            <button
              type="button"
              className={styles.primaryButton}
              onClick={() => void handleSubmit()}
              disabled={busy || selectedCount === 0 || !hasFriends}
            >
              <ChatsTeardrop size={18} weight="fill" />
              <span>{primaryLabel}</span>
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
