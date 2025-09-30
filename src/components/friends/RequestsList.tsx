"use client";

import * as React from "react";

import styles from "@/app/(authenticated)/friends/friends.module.css";
import type { RequestItem } from "@/hooks/useFriendsData";

type RequestsListProps = {
  incoming: RequestItem[];
  outgoing: RequestItem[];
  onAccept: (id: string) => void;
  onDecline: (id: string) => void;
  onCancel: (id: string) => void;
};

function renderName(item: RequestItem, fallback: string): string {
  return (item.user?.name ?? fallback).trim() || fallback;
}

export function RequestsList({ incoming, outgoing, onAccept, onDecline, onCancel }: RequestsListProps) {
  if (incoming.length === 0 && outgoing.length === 0) {
    return <div className={styles.empty}>No pending requests.</div>;
  }

  return (
    <div className={styles.requestList}>
      {incoming.map((item) => (
        <div key={`incoming-${item.id}`} className={styles.requestRow}>
          <div className={styles.requestMeta}>
            <span className={styles.friendName}>{renderName(item, "New friend")}</span>
            <span className={styles.requestLabel}>Incoming request</span>
          </div>
          <div className={styles.requestActions}>
            <button type="button" className={styles.primaryAction} onClick={() => onAccept(item.id)}>
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
