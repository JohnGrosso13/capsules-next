"use client";

import * as React from "react";

import styles from "@/app/(authenticated)/friends/friends.module.css";
import { FriendRow } from "@/components/friends/FriendRow";
import { FriendMenu } from "@/components/friends/FriendMenu";
import type { FriendItem } from "@/hooks/useFriendsData";
import { ASSISTANT_USER_ID } from "@/shared/assistant/constants";

type FriendsListProps = {
  items: FriendItem[];
  pendingId: string | null;
  notice: string | null;
  onDelete: (item: FriendItem, identifier: string) => void;
  onBlock?: (item: FriendItem, identifier: string) => void;
  onView?: (item: FriendItem, identifier: string) => void;
  onStartChat?: (item: FriendItem, identifier: string) => void;
  highlightId?: string | null;
};

export function FriendsList({
  items,
  pendingId,
  notice,
  onDelete,
  onBlock,
  onView,
  onStartChat,
  highlightId,
}: FriendsListProps) {
  if (!items.length) {
    return <div className={styles.empty}>No friends yet. Invite your circle to get started.</div>;
  }

  return (
    <div className={`${styles.list} ${styles.listLarge}`.trim()}>
      {notice ? <div className={styles.notice}>{notice}</div> : null}
      {items.map((friend, index) => {
        const identifier =
          friend.userId ?? friend.key ?? (friend.id ? String(friend.id) : `friend-${index}`);
        const isPending = pendingId === identifier;
        const isAssistant = friend.userId === ASSISTANT_USER_ID;
        const canTarget = Boolean(friend.userId || friend.key || friend.id);
        const isHighlighted = highlightId ? highlightId === identifier : false;

        return (
          <FriendRow
            key={`${identifier}-${index}`}
            name={friend.name}
            avatar={friend.avatar}
            since={friend.since}
            status={friend.status}
            className={isHighlighted ? styles.friendHighlight ?? "" : ""}
            friendIdAttr={identifier}
            actions={
              <FriendMenu
                canTarget={canTarget}
                pending={isPending}
                immutable={isAssistant}
                onDelete={
                  isAssistant ? () => undefined : () => onDelete(friend, identifier)
                }
                onBlock={
                  !isAssistant && onBlock ? () => onBlock(friend, identifier) : null
                }
                onView={onView ? () => onView(friend, identifier) : null}
                onStartChat={onStartChat ? () => onStartChat(friend, identifier) : null}
              />
            }
          />
        );
      })}
    </div>
  );
}
