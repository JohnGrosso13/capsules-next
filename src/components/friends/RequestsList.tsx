"use client";

import * as React from "react";
import styles from "@/app/(authenticated)/friends/friends.module.css";

export type RequestItem = {
  id: string;
  user?: { name?: string | null } | null;
  kind: "incoming" | "outgoing";
};

export function RequestsList({
  incoming,
  outgoing,
  onAccept,
  onDecline,
  onCancel,
}: {
  incoming: RequestItem[];
  outgoing: RequestItem[];
  onAccept: (id: string) => void;
  onDecline: (id: string) => void;
  onCancel: (id: string) => void;
}) {
  if (incoming.length === 0 && outgoing.length === 0) {
    return <div className={styles.empty}>No pending requests.</div>;
  }
  return (
    <div className={styles.requestList}>
      {incoming.map((request) => (
        <div key={request.id} className={styles.requestRow}>
          <div className={styles.requestMeta}>
            <div className={styles.friendName}>{request.user?.name ?? "New friend"}</div>
            <div className={styles.requestLabel}>Incoming request</div>
          </div>
          <div className={styles.requestActions}>
            <button type="button" onClick={() => onAccept(request.id)}>
              Accept
            </button>
            <button type="button" onClick={() => onDecline(request.id)}>
              Decline
            </button>
          </div>
        </div>
      ))}
      {outgoing.map((request) => (
        <div key={request.id} className={styles.requestRow}>
          <div className={styles.requestMeta}>
            <div className={styles.friendName}>{request.user?.name ?? "Pending friend"}</div>
            <div className={styles.requestLabel}>Waiting for approval</div>
          </div>
          <div className={styles.requestActions}>
            <button type="button" onClick={() => onCancel(request.id)}>
              Cancel
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
