"use client";

/* eslint-disable @next/next/no-img-element */

import * as React from "react";
import styles from "@/app/(authenticated)/friends/friends.module.css";
import { useFriendPresence, type PresenceStatus } from "@/hooks/useFriendPresence";

type FriendRowProps = {
  name: string;
  avatar?: string | null;
  since?: string | null;
  status?: PresenceStatus;
  open?: boolean;
  onNameClick?: () => void;
  actions?: React.ReactNode;
  className?: string;
};

export function FriendRow({
  name,
  avatar,
  since,
  status,
  open = false,
  onNameClick,
  actions,
  className,
}: FriendRowProps) {
  const presenceStyles = React.useMemo(
    () => ({
      online: styles.online ?? "online",
      offline: styles.offline ?? "offline",
      away: styles.away ?? styles.online ?? "online",
    }),
    [],
  );
  const { presenceClass } = useFriendPresence(presenceStyles);
  const sinceLabel = since ? new Date(since).toLocaleDateString() : null;

  return (
    <div className={`${styles.friendRow} ${className || ""}`.trim()}>
      <span className={styles.avatarWrap}>
        {avatar ? (
          <img className={styles.avatarImg} src={avatar} alt="" aria-hidden />
        ) : (
          <span className={styles.avatar} aria-hidden />
        )}
        <span className={`${styles.presence} ${presenceClass(status)}`.trim()} aria-hidden />
      </span>
      <div className={styles.friendMeta}>
        {onNameClick ? (
          <button
            type="button"
            className={`${styles.friendNameButton} ${styles.friendName}`.trim()}
            onClick={onNameClick}
            aria-expanded={open}
          >
            {name}
          </button>
        ) : (
          <span className={styles.friendName}>{name}</span>
        )}
        {sinceLabel ? <div className={styles.friendSince}>Since {sinceLabel}</div> : null}
        {open && actions ? actions : null}
      </div>
    </div>
  );
}

export default FriendRow;
