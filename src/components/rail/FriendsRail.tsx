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
  onNameClick: (friend: FriendItem) => void;
  onDelete: (friend: FriendItem, identifier: string) => Promise<void> | void;
  onStartChat?: (friend: FriendItem, identifier: string) => void;
  onFollow?: (friend: FriendItem, identifier: string) => Promise<void> | void;
  onUnfollow?: (friend: FriendItem, identifier: string) => Promise<void> | void;
  isFollowing?: (friend: FriendItem) => boolean;
  isFollower?: (friend: FriendItem) => boolean;
};

export function FriendsRail({
  friends,
  pendingId,
  activeTarget,
  onNameClick,
  onDelete,
  onStartChat,
  onFollow,
  onUnfollow,
  isFollowing,
  isFollower,
}: FriendsRailProps) {
  return (
    <div className={`${friendsStyles.list}`.trim()}>
      {friends.map((friend, index) => {
        const identifier =
          friend.userId ?? friend.key ?? (friend.id ? String(friend.id) : `friend-${index}`);
        const listKey = `${identifier}-${index}`;
        const canTarget = Boolean(friend.userId || friend.key || friend.id);
        const isOpen = activeTarget === identifier;
        const isPending = pendingId === identifier;
        const following = isFollowing ? isFollowing(friend) : undefined;
        const follower = isFollower ? isFollower(friend) : false;
        const relationshipHint =
          follower && following
            ? "Following each other"
            : follower
              ? "Follows you"
              : following
                ? "You follow"
                : null;
        const followMenuProps =
          typeof following === "boolean"
            ? {
                isFollowing: following,
                onFollow: onFollow ? () => onFollow(friend, identifier) : null,
                onUnfollow: onUnfollow ? () => onUnfollow(friend, identifier) : null,
              }
            : {};

        return (
          <FriendRow
            key={listKey}
            name={friend.name}
            avatar={friend.avatar}
            since={friend.since}
            status={friend.status}
            open={isOpen}
            onNameClick={() => onNameClick(friend)}
            relationshipHint={relationshipHint}
            actions={
              <FriendMenu
                canTarget={canTarget}
                pending={isPending}
                onDelete={() => {
                  void onDelete(friend, identifier);
                }}
                onStartChat={onStartChat ? () => onStartChat(friend, identifier) : null}
                {...followMenuProps}
              />
            }
          />
        );
      })}
    </div>
  );
}

export default FriendsRail;
