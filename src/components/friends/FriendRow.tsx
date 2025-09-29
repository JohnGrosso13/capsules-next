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
  const presenceLabel = React.useMemo(() => {
    if (status === "online") return "Online";
    if (status === "away") return "Away";
    return "Offline";
  }, [status]);

  return (
    <div className={`${styles.friendRow} ${className || ""}`.trim()}>
      <div className={styles.friendRowMain}>
        <span className={styles.avatarWrap}>
          {avatar ? (
            <img className={styles.avatarImg} src={avatar} alt="" aria-hidden />
          ) : (
            <span className={styles.avatar} aria-hidden />
          )}
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
        </div>
        <span
          className={`${styles.presence} ${presenceClass(status)}`.trim()}
          role="status"
          aria-label={`Status: ${presenceLabel}`}
        >
          <span className={styles.presenceDot} aria-hidden />
        </span>
      </div>
      {actions ? <div className={styles.friendRowRight}>{actions}</div> : null}
    </div>
  );
}

export default FriendRow;
