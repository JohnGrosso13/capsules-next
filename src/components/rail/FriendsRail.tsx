"use client";

import * as React from "react";

import friendsStyles from "@/app/(authenticated)/friends/friends.module.css";
import { FriendRow } from "@/components/friends/FriendRow";
import { FriendMenu } from "@/components/friends/FriendMenu";
import type { Friend } from "@/hooks/useFriendsGraph";

export type FriendsRailProps = {
  friends: Friend[];
  pendingId: string | null;
  activeTarget: string | null;
  onNameClick: (identifier: string) => void;
  onDelete: (friend: Friend, identifier: string) => Promise<void> | void;
};

export function FriendsRail({
  friends,
  pendingId,
  activeTarget,
  onNameClick,
  onDelete,
}: FriendsRailProps) {
  return (
    <div className={`${friendsStyles.list}`.trim()}>
      {friends.map((f, i) => {
        const identifier = f.userId ?? f.key ?? f.id ?? `friend-${i}`;
        const listKey = `${identifier}-${i}`;
        const canTarget = Boolean(f.userId || f.key || f.id);
        const isOpen = activeTarget === identifier;
        const isPending = pendingId === identifier;
        return (
          <FriendRow
            key={listKey}
            name={f.name}
            avatar={f.avatar ?? null}
            since={f.since ?? null}
            status={f.status}
            open={isOpen}
            onNameClick={() => onNameClick(identifier)}
            actions={
              <FriendMenu
                canTarget={canTarget}
                pending={isPending}
                onDelete={() => {
                  void onDelete(f, identifier);
                }}
              />
            }
          />
        );
      })}
    </div>
  );
}

export default FriendsRail;
