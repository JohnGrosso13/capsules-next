"use client";

import * as React from "react";

import styles from "@/app/(authenticated)/friends/friends.module.css";
import type { PartyInviteItem, RequestItem } from "@/hooks/useFriendsData";
import { MicrophoneStage } from "@phosphor-icons/react/dist/ssr";

type RequestsListProps = {
  incoming: RequestItem[];
  outgoing: RequestItem[];
  partyInvites: PartyInviteItem[];
  onAccept: (id: string) => void;
  onDecline: (id: string) => void;
  onCancel: (id: string) => void;
  onAcceptInvite: (id: string) => void;
  onDeclineInvite: (id: string) => void;
};

function renderName(item: RequestItem, fallback: string): string {
  return (item.user?.name ?? fallback).trim() || fallback;
}

function formatInviteExpiry(expiresAt: string | null): string | null {
  if (!expiresAt) return null;
  const timestamp = Date.parse(expiresAt);
  if (Number.isNaN(timestamp)) return null;
  const diffMs = timestamp - Date.now();
  if (diffMs <= 0) return "Expired";
  const minutes = Math.round(diffMs / 60000);
  if (minutes < 1) return "Expires in <1 min";
  if (minutes < 60) return `Expires in ${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `Expires in ${hours} hr${hours === 1 ? "" : "s"}`;
  const days = Math.round(hours / 24);
  return `Expires in ${days} day${days === 1 ? "" : "s"}`;
}

export function RequestsList({
  incoming,
  outgoing,
  partyInvites,
  onAccept,
  onDecline,
  onCancel,
  onAcceptInvite,
  onDeclineInvite,
}: RequestsListProps) {
  if (incoming.length === 0 && outgoing.length === 0 && partyInvites.length === 0) {
    return <div className={styles.empty}>No pending requests.</div>;
  }

  return (
    <div className={styles.requestList}>
      {partyInvites.map((invite) => {
        const expiry = formatInviteExpiry(invite.expiresAt);
        return (
          <div key={`invite-${invite.id}`} className={styles.requestRow}>
            <div className={styles.requestMeta}>
              <span className={styles.friendName}>
                <MicrophoneStage size={16} weight="duotone" /> {invite.hostName}
              </span>
              <span className={styles.requestLabel}>
                Party invite{invite.topic ? ` · ${invite.topic}` : ""}{" "}
                {expiry ? ` · ${expiry}` : ""}
              </span>
            </div>
            <div className={styles.requestActions}>
              <button
                type="button"
                className={styles.primaryAction}
                onClick={() => onAcceptInvite(invite.id)}
              >
                Join
              </button>
              <button type="button" onClick={() => onDeclineInvite(invite.id)}>
                Dismiss
              </button>
            </div>
          </div>
        );
      })}
      {incoming.map((item) => (
        <div key={`incoming-${item.id}`} className={styles.requestRow}>
          <div className={styles.requestMeta}>
            <span className={styles.friendName}>{renderName(item, "New friend")}</span>
            <span className={styles.requestLabel}>Incoming request</span>
          </div>
          <div className={styles.requestActions}>
            <button
              type="button"
              className={styles.primaryAction}
              onClick={() => onAccept(item.id)}
            >
              Accept
            </button>
            <button type="button" onClick={() => onDecline(item.id)}>
              Decline
            </button>
          </div>
        </div>
      ))}
      {outgoing.map((item) => (
        <div key={`outgoing-${item.id}`} className={styles.requestRow}>
          <div className={styles.requestMeta}>
            <span className={styles.friendName}>{renderName(item, "Pending friend")}</span>
            <span className={styles.requestLabel}>Awaiting response</span>
          </div>
          <div className={styles.requestActions}>
            <button type="button" onClick={() => onCancel(item.id)}>
              Cancel
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
