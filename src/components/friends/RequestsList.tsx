"use client";

import * as React from "react";

import styles from "@/app/(authenticated)/friends/friends.module.css";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import type { CapsuleInviteItem, PartyInviteItem, RequestItem } from "@/hooks/useFriendsData";
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
  capsuleInvites: CapsuleInviteItem[];
  onAcceptCapsuleInvite: (capsuleId: string, requestId: string) => void;
  onDeclineCapsuleInvite: (capsuleId: string, requestId: string) => void;
  pendingRequests?: Set<string> | string[];
  pendingInvites?: Set<string> | string[];
  pendingCapsuleInvites?: Set<string> | string[];
  errorMessage?: string | null;
  onClearError?: () => void;
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
  capsuleInvites,
  onAcceptCapsuleInvite,
  onDeclineCapsuleInvite,
  pendingRequests,
  pendingInvites,
  pendingCapsuleInvites,
  errorMessage,
  onClearError,
}: RequestsListProps) {
  const isPending = (collection: Set<string> | string[] | undefined, id: string): boolean => {
    if (!collection) return false;
    return Array.isArray(collection) ? collection.includes(id) : collection.has(id);
  };

  if (
    incoming.length === 0 &&
    outgoing.length === 0 &&
    partyInvites.length === 0 &&
    capsuleInvites.length === 0
  ) {
    return <div className={styles.empty}>No pending requests.</div>;
  }

  return (
    <div className={styles.requestList}>
      {errorMessage ? (
        <Alert tone="danger" className={styles.requestAlert} role="status">
          <AlertTitle>Request action failed</AlertTitle>
          <AlertDescription>
            {errorMessage}
            {onClearError ? (
              <button type="button" className={styles.requestAlertDismiss} onClick={onClearError}>
                Dismiss
              </button>
            ) : null}
          </AlertDescription>
        </Alert>
      ) : null}
      {partyInvites.map((invite) => {
        const expiry = formatInviteExpiry(invite.expiresAt);
        const busy = isPending(pendingInvites, invite.id);
        return (
          <div key={`invite-${invite.id}`} className={styles.requestRow} data-busy={busy || undefined}>
            <div className={styles.requestMeta}>
              <span className={styles.friendName}>
                <MicrophoneStage size={16} weight="duotone" /> {invite.hostName}
              </span>
              <span className={styles.requestLabel}>
                Party invite{invite.topic ? ` | ${invite.topic}` : ""}{" "}
                {expiry ? ` | ${expiry}` : ""}
              </span>
            </div>
            <div className={styles.requestActions}>
              <button
                type="button"
                className={styles.primaryAction}
                onClick={() => onAcceptInvite(invite.id)}
                disabled={busy}
                aria-busy={busy || undefined}
              >
                {busy ? "Joining..." : "Join"}
              </button>
              <button
                type="button"
                onClick={() => onDeclineInvite(invite.id)}
                disabled={busy}
                aria-busy={busy || undefined}
              >
                {busy ? "Working..." : "Dismiss"}
              </button>
            </div>
          </div>
        );
      })}
      {capsuleInvites.map((invite) => {
        const busy = isPending(pendingCapsuleInvites, invite.id);
        return (
          <div key={`capsule-invite-${invite.id}`} className={styles.requestRow} data-busy={busy || undefined}>
            <div className={styles.requestMeta}>
              <span className={styles.friendName}>{invite.capsuleName}</span>
              <span className={styles.requestLabel}>
                Capsule invite
                {invite.inviterName ? ` | from ${invite.inviterName}` : ""}
              </span>
            </div>
            <div className={styles.requestActions}>
              <button
                type="button"
                className={styles.primaryAction}
                onClick={() => onAcceptCapsuleInvite(invite.capsuleId, invite.id)}
                disabled={busy}
                aria-busy={busy || undefined}
              >
                {busy ? "Joining..." : "Join"}
              </button>
              <button
                type="button"
                onClick={() => onDeclineCapsuleInvite(invite.capsuleId, invite.id)}
                disabled={busy}
                aria-busy={busy || undefined}
              >
                {busy ? "Working..." : "Dismiss"}
              </button>
            </div>
          </div>
        );
      })}
      {incoming.map((item) => {
        const busy = isPending(pendingRequests, item.id);
        return (
          <div key={`incoming-${item.id}`} className={styles.requestRow} data-busy={busy || undefined}>
            <div className={styles.requestMeta}>
              <span className={styles.friendName}>{renderName(item, "New friend")}</span>
              <span className={styles.requestLabel}>Incoming request</span>
            </div>
            <div className={styles.requestActions}>
              <button
                type="button"
                className={styles.primaryAction}
                onClick={() => onAccept(item.id)}
                disabled={busy}
                aria-busy={busy || undefined}
              >
                {busy ? "Accepting..." : "Accept"}
              </button>
              <button
                type="button"
                onClick={() => onDecline(item.id)}
                disabled={busy}
                aria-busy={busy || undefined}
              >
                {busy ? "Working..." : "Decline"}
              </button>
            </div>
          </div>
        );
      })}
      {outgoing.map((item) => {
        const busy = isPending(pendingRequests, item.id);
        return (
          <div key={`outgoing-${item.id}`} className={styles.requestRow} data-busy={busy || undefined}>
            <div className={styles.requestMeta}>
              <span className={styles.friendName}>{renderName(item, "Pending friend")}</span>
              <span className={styles.requestLabel}>Awaiting response</span>
            </div>
            <div className={styles.requestActions}>
              <button
                type="button"
                onClick={() => onCancel(item.id)}
                disabled={busy}
                aria-busy={busy || undefined}
              >
                {busy ? "Working..." : "Cancel"}
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
