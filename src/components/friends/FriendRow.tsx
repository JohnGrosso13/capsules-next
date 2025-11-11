"use client";

import * as React from "react";
import Image from "next/image";

import styles from "@/app/(authenticated)/friends/friends.module.css";
import type { PresenceStatus } from "@/hooks/useFriendsRealtime";

type FriendRowProps = {
  name: string;
  avatar?: string | null;
  since?: string | null;
  status?: PresenceStatus;
  open?: boolean;
  onNameClick?: () => void;
  actions?: React.ReactNode;
  className?: string;
  friendIdAttr?: string | null;
  relationshipHint?: string | null;
};

function formatSince(value?: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  try {
    return date.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return date.toISOString().slice(0, 10);
  }
}

function getPresenceLabel(status: PresenceStatus | undefined): string {
  if (status === "online") return "Online";
  if (status === "away") return "Away";
  return "Offline";
}

export function FriendRow({
  name,
  avatar,
  since,
  status = "offline",
  open = false,
  onNameClick,
  actions,
  className,
  friendIdAttr,
  relationshipHint,
}: FriendRowProps) {
  const sinceLabel = formatSince(since);
  const presenceLabel = getPresenceLabel(status);
  const presenceClass = React.useMemo(() => {
    if (status === "online") return styles.presenceOnline ?? styles.presence;
    if (status === "away") return styles.presenceAway ?? styles.presence;
    return styles.presenceOffline ?? styles.presence;
  }, [status]);

  const initials = React.useMemo(() => {
    const trimmed = name.trim();
    if (!trimmed) return "?";
    return trimmed[0]?.toUpperCase() ?? "?";
  }, [name]);

  return (
    <article
      className={`${styles.friendRow} ${className ?? ""}`.trim()}
      data-friend-id={friendIdAttr ?? undefined}
    >
      <div className={styles.friendRowMain}>
        <span className={styles.avatarWrap} aria-hidden>
          {avatar ? (
            <Image
              src={avatar}
              alt=""
              width={56}
              height={56}
              className={styles.avatarImg}
              sizes="56px"
              priority={false}
            />
          ) : (
            <span className={styles.avatarFallback}>{initials}</span>
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
          {relationshipHint ? (
            <span className={styles.relationshipHint}>{relationshipHint}</span>
          ) : null}
          <div className={styles.friendMetaRow}>
            {sinceLabel ? <span className={styles.friendSince}>Since {sinceLabel}</span> : null}
            <span
              className={`${styles.presence} ${presenceClass}`.trim()}
              role="status"
              aria-label={`Status: ${presenceLabel}`}
            >
              <span className={styles.presenceDot} aria-hidden />
              <span className={styles.presenceLabel}>{presenceLabel}</span>
            </span>
          </div>
        </div>
      </div>
      {actions ? <div className={styles.friendRowActions}>{actions}</div> : null}
    </article>
  );
}

export default FriendRow;
