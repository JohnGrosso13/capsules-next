"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import Image from "next/image";
import { CheckCircle, PlusCircle, X, UsersThree } from "@phosphor-icons/react/dist/ssr";

import type { FriendItem } from "@/hooks/useFriendsData";

import styles from "./GroupChatOverlay.module.css";

type GroupChatOverlayMode = "create" | "invite";

export type GroupChatOverlaySubmitPayload = {
  name: string;
  participantIds: string[];
};

type GroupChatOverlayProps = {
  open: boolean;
  mode: GroupChatOverlayMode;
  friends: FriendItem[];
  disabledIds?: string[];
  initialSelectedIds?: string[];
  initialName?: string;
  busy?: boolean;
  error?: string | null;
  heading?: string;
  description?: string;
  onClose: () => void;
  onSubmit: (payload: GroupChatOverlaySubmitPayload) => Promise<void> | void;
};

type SelectableFriend = {
  id: string;
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

function mapFriend(friend: FriendItem): SelectableFriend | null {
  if (!friend.userId) return null;
  return {
    id: friend.id,
    userId: friend.userId,
    name: friend.name || friend.userId,
    avatar: friend.avatar ?? null,
    status: friend.status,
  };
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

export function GroupChatOverlay({
  open,
  mode,
  friends,
  disabledIds,
  initialSelectedIds,
  initialName = "",
  busy,
  error,
  heading,
  description,
  onClose,
  onSubmit,
}: GroupChatOverlayProps) {
  const [mounted, setMounted] = React.useState(false);
  const normalizedDisabledIds = React.useMemo(() => disabledIds ?? [], [disabledIds]);
  const normalizedInitialSelectedIds = React.useMemo(() => initialSelectedIds ?? [], [initialSelectedIds]);
  const [selection, setSelection] = React.useState<Set<string>>(() => new Set(normalizedInitialSelectedIds));
  const [groupName, setGroupName] = React.useState(initialName);
  const disabledSet = React.useMemo(() => new Set(normalizedDisabledIds), [normalizedDisabledIds]);
  const candidates = React.useMemo(
    () => friends.map(mapFriend).filter((friend): friend is SelectableFriend => Boolean(friend)),
    [friends],
  );

  React.useEffect(() => {
    setMounted(true);
  }, []);

  React.useEffect(() => {
    if (open) {
      setSelection(new Set(normalizedInitialSelectedIds));
      setGroupName(initialName);
    }
  }, [initialName, normalizedInitialSelectedIds, open]);

  React.useEffect(() => {
    if (!open) return;
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [onClose, open]);

  const toggleSelection = React.useCallback(
    (userId: string) => {
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
    [setSelection],
  );

  const handleSubmit = React.useCallback(async () => {
    if (busy) return;
    const participantIds = Array.from(selection);
    await onSubmit({ name: groupName.trim(), participantIds });
  }, [busy, groupName, onSubmit, selection]);

  const selectedCount = selection.size;
  const submitDisabled =
    busy ||
    selectedCount === 0 ||
    (mode === "create" && selectedCount < 1); // at least one friend; self is implicit

  if (!mounted || !open) return null;
  if (typeof document === "undefined") return null;

  const title = heading ?? (mode === "create" ? "Start a group chat" : "Add people to this chat");
  const subtitle =
    description ??
    (mode === "create"
      ? "Choose friends to launch a multi-person thread. You can add more anytime."
      : "Bring new people into this conversation. They'll see the full history once added.");

  return createPortal(
    <div className={styles.overlay} role="dialog" aria-modal="true" aria-labelledby="group-chat-overlay-title">
      <div className={styles.backdrop} onClick={onClose} />
      <div className={styles.panel}>
        <div className={styles.header}>
          <div className={styles.titleGroup}>
            <span id="group-chat-overlay-title" className={styles.title}>
              {title}
            </span>
            <span className={styles.subtitle}>{subtitle}</span>
          </div>
          <button type="button" className={styles.closeButton} onClick={onClose} aria-label="Cancel group chat">
            <X size={18} weight="bold" />
          </button>
        </div>

        <div className={styles.body}>
          {mode === "create" ? (
            <div className={styles.inputGroup}>
              <label className={styles.label} htmlFor="group-chat-name">
                Group name
              </label>
              <input
                id="group-chat-name"
                className={styles.textInput}
                value={groupName}
                onChange={(event) => setGroupName(event.target.value)}
                placeholder="Give your group a vibe (optional)"
                autoFocus
              />
            </div>
          ) : null}

          <div className={styles.friendList}>
            {candidates.length === 0 ? (
              <div className={styles.subtitle}>
                You don&apos;t have any friends with chat access yet. Add friends to start a group chat.
              </div>
            ) : (
              candidates.map((friend) => {
                const isDisabled = disabledSet.has(friend.userId);
                const isSelected = selection.has(friend.userId);
                return (
                  <div
                    key={friend.userId}
                    className={`${styles.friendItem} ${!isDisabled ? styles.friendItemSelectable : ""}`.trim()}
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
                        {isDisabled ? "Already in chat" : friend.status === "online" ? "Online" : friend.status}
                      </span>
                    </div>
                    <div className={styles.friendAction}>
                      <button
                        type="button"
                        className={`${styles.toggleButton} ${isSelected ? styles.toggleActive : ""}`.trim()}
                        onClick={() => toggleSelection(friend.userId)}
                        disabled={isDisabled || busy}
                      >
                        {isSelected ? <CheckCircle size={18} weight="fill" /> : <PlusCircle size={18} weight="bold" />}
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
          <div className={styles.summary}>
            {selectedCount === 0
              ? "Select at least one friend to continue."
              : `${selectedCount} friend${selectedCount === 1 ? "" : "s"} selected`}
          </div>
          {error ? <div className={styles.error}>{error}</div> : null}
          <div className={styles.actions}>
            <button type="button" className={styles.secondaryButton} onClick={onClose} disabled={busy}>
              Cancel
            </button>
            <button type="button" className={styles.primaryButton} onClick={() => void handleSubmit()} disabled={submitDisabled}>
              <UsersThree size={18} weight="fill" />
              <span>{mode === "create" ? "Create group chat" : "Add members"}</span>
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
