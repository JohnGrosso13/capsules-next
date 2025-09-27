"use client";

/* eslint-disable @next/next/no-img-element */

import * as React from "react";

import friendsStyles from "@/app/(authenticated)/friends/friends.module.css";
import { FriendRow } from "@/components/friends/FriendRow";
import { FriendMenu } from "@/components/friends/FriendMenu";
import type { PresenceStatus } from "@/hooks/useFriendPresence";

export type RailFriend = {
  id: string | null;
  userId: string | null;
  key?: string | null;
  name: string;
  avatar?: string | null;
  since?: string | null;
  status?: PresenceStatus;
};

export type FriendsRailProps = {
  friends: RailFriend[];
  pendingId: string | null;
  activeTarget: string | null;
  onNameClick: (identifier: string) => void;
  onDelete: (friend: RailFriend, identifier: string) => void;
};

export function FriendsRail({ friends, pendingId, activeTarget, onNameClick, onDelete }: FriendsRailProps) {
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
            avatar={f.avatar}
            since={f.since ?? undefined}
            status={f.status}
            open={isOpen}
            onNameClick={() => onNameClick(identifier)}
            actions={
              <FriendMenu
                canTarget={canTarget}
                pending={isPending}
                onDelete={() => onDelete(f, identifier)}
              />
            }
          />
        );
      })}
    </div>
  );
}

export default FriendsRail;
