"use client";

/* eslint-disable @next/next/no-img-element */

import * as React from "react";

import friendsStyles from "@/app/(authenticated)/friends/friends.module.css";

type Presence = "online" | "offline" | "away" | undefined;

export type RailFriend = {
  id: string | null;
  userId: string | null;
  key?: string | null;
  name: string;
  avatar?: string | null;
  since?: string | null;
  status?: Presence;
};

export type FriendsRailProps = {
  friends: RailFriend[];
  pendingId: string | null;
  activeTarget: string | null;
  onNameClick: (identifier: string) => void;
  onDelete: (friend: RailFriend, identifier: string) => void;
};

function presenceClass(status?: string) {
  if (status === "online") return friendsStyles.online;
  if (status === "away") return friendsStyles.away ?? friendsStyles.online;
  return friendsStyles.offline;
}

export function FriendsRail({ friends, pendingId, activeTarget, onNameClick, onDelete }: FriendsRailProps) {
  return (
    <div className={`${friendsStyles.list}`.trim()}>
      {friends.map((f, i) => {
        const identifier = f.userId ?? f.key ?? f.id ?? `friend-${i}`;
        const listKey = `${identifier}-${i}`;
        const canTarget = Boolean(f.userId || f.key || f.id);
        const isOpen = activeTarget === identifier;
        const isPending = pendingId === identifier;
        const sinceLabel = f.since ? new Date(f.since).toLocaleDateString() : null;
        return (
          <div key={listKey} className={friendsStyles.friendRow}>
            <span className={friendsStyles.avatarWrap}>
              {f.avatar ? (
                <img className={friendsStyles.avatarImg} src={f.avatar} alt="" aria-hidden />
              ) : (
                <span className={friendsStyles.avatar} aria-hidden />
              )}
              <span className={`${friendsStyles.presence} ${presenceClass(f.status)}`.trim()} aria-hidden />
            </span>
            <div className={friendsStyles.friendMeta}>
              <button
                type="button"
                className={`${friendsStyles.friendNameButton} ${friendsStyles.friendName}`.trim()}
                onClick={() => onNameClick(identifier)}
                aria-expanded={isOpen}
              >
                {f.name}
              </button>
              {sinceLabel ? <div className={friendsStyles.friendSince}>Since {sinceLabel}</div> : null}
              {isOpen ? (
                <div className={friendsStyles.friendActions}>
                  <button
                    type="button"
                    className={friendsStyles.friendActionButton}
                    onClick={() => onDelete(f, identifier)}
                    disabled={!canTarget || isPending}
                    aria-busy={isPending}
                  >
                    {isPending ? "Removing..." : "Delete"}
                  </button>
                </div>
              ) : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default FriendsRail;
