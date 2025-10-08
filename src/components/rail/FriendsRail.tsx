"use client";

import * as React from "react";

import friendsStyles from "@/app/(authenticated)/friends/friends.module.css";
import { FriendRow } from "@/components/friends/FriendRow";
import { FriendMenu } from "@/components/friends/FriendMenu";
import type { FriendItem } from "@/hooks/useFriendsData";

export type FriendsRailProps = {
  friends: FriendItem[];
  pendingId: string | null;
  activeTarget: string | null;
  onNameClick: (identifier: string) => void;
  onDelete: (friend: FriendItem, identifier: string) => Promise<void> | void;
  onStartChat?: (friend: FriendItem, identifier: string) => void;
};

export function FriendsRail({
  friends,
  pendingId,
  activeTarget,
  onNameClick,
  onDelete,
  onStartChat,
}: FriendsRailProps) {
  return (
    <div className={`${friendsStyles.list}`.trim()}>
      {friends.map((friend, index) => {
        const identifier = friend.userId ?? friend.key ?? (friend.id ? String(friend.id) : `friend-${index}`);
        const listKey = `${identifier}-${index}`;
        const canTarget = Boolean(friend.userId || friend.key || friend.id);
        const isOpen = activeTarget === identifier;
        const isPending = pendingId === identifier;
        return (
          <FriendRow
            key={listKey}
            name={friend.name}
            avatar={friend.avatar}
            since={friend.since}
            status={friend.status}
            open={isOpen}
            onNameClick={() => onNameClick(identifier)}
            actions={
              <FriendMenu
                canTarget={canTarget}
                pending={isPending}
                onDelete={() => {
                  void onDelete(friend, identifier);
                }}
                onStartChat={onStartChat ? () => onStartChat(friend, identifier) : null}
              />
            }
          />
        );
      })}
    </div>
  );
}

export default FriendsRail;
