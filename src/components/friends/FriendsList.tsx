"use client";

import * as React from "react";
import styles from "@/app/(authenticated)/friends/friends.module.css";
import { FriendRow } from "@/components/friends/FriendRow";
import { FriendMenu } from "@/components/friends/FriendMenu";

export type FriendItem = {
  id: string;
  userId: string | null;
  key: string | null;
  name: string;
  avatar: string | null;
  since: string | null;
  status: "online" | "offline" | "away";
};

export function FriendsList({
  items,
  pendingId,
  notice,
  onDelete,
  onBlock,
  onView,
  onStartChat,
}: {
  items: FriendItem[];
  pendingId: string | null;
  notice: string | null;
  onDelete: (item: FriendItem, identifier: string) => void;
  onBlock?: (item: FriendItem, identifier: string) => void;
  onView?: (item: FriendItem, identifier: string) => void;
  onStartChat?: (item: FriendItem, identifier: string) => void;
}) {
  return (
    <div className={`${styles.list} ${styles.listLarge}`.trim()}>
      {notice ? <div className={styles.friendNotice}>{notice}</div> : null}
      {items.map((friend, index) => {
        const identifier = friend.userId ?? friend.key ?? friend.id ?? `friend-${index}`;
        const canTarget = Boolean(friend.userId || friend.key);
        const isPending = pendingId === identifier;
        return (
          <FriendRow
            key={`${identifier}-${index}`}
            name={friend.name}
            avatar={friend.avatar}
            since={friend.since ?? null}
            status={friend.status}
            actions={
              <FriendMenu
                canTarget={canTarget}
                pending={isPending}
                onDelete={() => onDelete(friend, identifier)}
                onBlock={onBlock ? () => onBlock(friend, identifier) : null}
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
