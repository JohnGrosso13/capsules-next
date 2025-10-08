"use client";

import * as React from "react";
import {
  Check,
  ClockClockwise,
  Trash,
  WarningCircle,
  X,
} from "@phosphor-icons/react/dist/ssr";

import type {
  CapsuleMembershipAction,
  CapsuleMembershipState,
  CapsuleMemberRequestSummary,
} from "@/types/capsules";

import capTheme from "@/app/(authenticated)/capsule/capsule.module.css";

type CapsuleMembersPanelProps = {
  open: boolean;
  membership: CapsuleMembershipState | null;
  loading: boolean;
  error: string | null;
  mutatingAction: CapsuleMembershipAction | null;
  onClose?: () => void;
  onRefresh: () => Promise<unknown> | unknown;
  onApprove: (requestId: string) => Promise<unknown> | unknown;
  onDecline: (requestId: string) => Promise<unknown> | unknown;
  onRemove: (memberId: string) => Promise<unknown> | unknown;
};

function MemberAvatar({ name, avatarUrl }: { name: string | null; avatarUrl: string | null }) {
  if (avatarUrl) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img className={capTheme.memberAvatarImage} src={avatarUrl} alt="" />;
  }
  const initial = (name ?? "?").trim().charAt(0).toUpperCase() || "?";
  return <span className={capTheme.memberAvatarFallback}>{initial}</span>;
}

function formatTimestamp(value: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleString();
}

function PendingRequestRow({
  request,
  disabled,
  onApprove,
  onDecline,
}: {
  request: CapsuleMemberRequestSummary;
  disabled: boolean;
  onApprove: (requestId: string) => void;
  onDecline: (requestId: string) => void;
}) {
  const createdAt = formatTimestamp(request.createdAt);
  const message =
    typeof request.message === "string" && request.message.trim().length
      ? request.message.trim()
      : null;
  const name = request.requester?.name ?? "Member";
  return (
    <li className={capTheme.pendingRow} key={request.id}>
      <div className={capTheme.memberAvatar}>
        <MemberAvatar name={name} avatarUrl={request.requester?.avatarUrl ?? null} />
      </div>
      <div className={capTheme.pendingInfo}>
        <div className={capTheme.pendingName}>{name}</div>
        {createdAt ? <div className={capTheme.pendingMeta}>Requested {createdAt}</div> : null}
        {message ? <p className={capTheme.pendingMessage}>{message}</p> : null}
      </div>
      <div className={capTheme.pendingActions}>
        <button
          type="button"
          className={capTheme.pendingApprove}
          onClick={() => onApprove(request.id)}
          disabled={disabled}
        >
          <Check size={16} weight="bold" />
          Approve
        </button>
        <button
          type="button"
          className={capTheme.pendingDecline}
          onClick={() => onDecline(request.id)}
          disabled={disabled}
        >
          <X size={16} weight="bold" />
          Decline
        </button>
      </div>
    </li>
  );
}

export function CapsuleMembersPanel({
  open,
  membership,
  loading,
  error,
  mutatingAction,
  onClose,
  onRefresh,
  onApprove,
  onDecline,
  onRemove,
}: CapsuleMembersPanelProps) {
  const handleRefresh = React.useCallback(() => {
    void onRefresh();
  }, [onRefresh]);

  const handleApprove = React.useCallback(
    (requestId: string) => {
      if (mutatingAction) return;
      void onApprove(requestId);
    },
    [mutatingAction, onApprove],
  );

  const handleDecline = React.useCallback(
    (requestId: string) => {
      if (mutatingAction) return;
      void onDecline(requestId);
    },
    [mutatingAction, onDecline],
  );

  const handleRemove = React.useCallback(
    (memberId: string) => {
      if (mutatingAction) return;
      void onRemove(memberId);
    },
    [mutatingAction, onRemove],
  );

  if (!open) return null;

  const viewer = membership?.viewer ?? null;
  const isOwner = Boolean(viewer?.isOwner);
  const hasMembers = Boolean(membership?.members?.length);
  const pendingRequests = membership?.requests ?? [];
  const hasPending = pendingRequests.length > 0;
  const requestStatus = viewer?.requestStatus ?? "none";

  return (
    <aside className={capTheme.membersPanel} aria-live="polite">
      <div className={capTheme.membersHeader}>
        <div>
          <h3 className={capTheme.membersTitle}>Members</h3>
          <p className={capTheme.membersSubtitle}>
            Manage who has access to this capsule. Pending requests appear here.
          </p>
        </div>
        <div className={capTheme.membersHeaderActions}>
          <button
            type="button"
            className={capTheme.membersRefresh}
            onClick={handleRefresh}
            disabled={loading || mutatingAction !== null}
            aria-label="Refresh membership"
          >
            <ClockClockwise size={16} weight="bold" />
            Refresh
          </button>
          {onClose ? (
            <button type="button" className={capTheme.membersClose} onClick={onClose} aria-label="Close members panel">
              <X size={16} weight="bold" />
            </button>
          ) : null}
        </div>
      </div>

      {loading ? <div className={capTheme.membersNotice}>Loading membership details…</div> : null}
      {error ? (
        <div className={capTheme.membersError}>
          <WarningCircle size={16} weight="bold" />
          <span>{error}</span>
        </div>
      ) : null}

      {!isOwner && requestStatus === "pending" ? (
        <div className={capTheme.membersNotice}>
          <WarningCircle size={16} weight="bold" />
          Your request to join is pending approval.
        </div>
      ) : null}
      {!isOwner && requestStatus === "declined" ? (
        <div className={capTheme.membersNotice}>
          <WarningCircle size={16} weight="bold" />
          Your previous request was declined. You can request again at any time.
        </div>
      ) : null}

      {isOwner ? (
        <section className={capTheme.membersSection} aria-label="Pending member requests">
          <header className={capTheme.membersSectionHeader}>
            <h4 className={capTheme.membersSectionTitle}>Pending Requests</h4>
            {hasPending ? (
              <span className={capTheme.membersSectionBadge}>{pendingRequests.length}</span>
            ) : null}
          </header>
          {hasPending ? (
            <ul className={capTheme.pendingList}>
              {pendingRequests.map((request) => (
                <PendingRequestRow
                  key={request.id}
                  request={request}
                  disabled={mutatingAction !== null}
                  onApprove={handleApprove}
                  onDecline={handleDecline}
                />
              ))}
            </ul>
          ) : (
            <p className={capTheme.membersEmpty}>No pending requests at the moment.</p>
          )}
        </section>
      ) : null}

      <section className={capTheme.membersSection} aria-label="Capsule members">
        <header className={capTheme.membersSectionHeader}>
          <h4 className={capTheme.membersSectionTitle}>Members</h4>
          <span className={capTheme.membersSectionBadge}>
            {membership?.counts.members ?? 0}
          </span>
        </header>
        {hasMembers ? (
          <ul className={capTheme.membersList}>
            {membership!.members.map((member) => {
              const role =
                member.role && member.role !== "member"
                  ? member.role.charAt(0).toUpperCase() + member.role.slice(1)
                  : member.isOwner
                    ? "Owner"
                    : "Member";
              return (
                <li key={member.userId} className={capTheme.memberRow}>
                  <div className={capTheme.memberAvatar}>
                    <MemberAvatar name={member.name} avatarUrl={member.avatarUrl} />
                  </div>
                  <div className={capTheme.memberInfo}>
                    <div className={capTheme.memberName}>{member.name ?? "Member"}</div>
                    <div className={capTheme.memberMeta}>
                      <span>{role}</span>
                      {member.joinedAt ? <span>Joined {formatTimestamp(member.joinedAt)}</span> : null}
                    </div>
                  </div>
                  {isOwner && !member.isOwner ? (
                    <button
                      type="button"
                      className={capTheme.memberRemove}
                      onClick={() => handleRemove(member.userId)}
                      disabled={mutatingAction !== null}
                    >
                      <Trash size={16} weight="bold" />
                      Remove
                    </button>
                  ) : null}
                </li>
              );
            })}
          </ul>
        ) : (
          <p className={capTheme.membersEmpty}>No members have joined yet.</p>
        )}
      </section>
    </aside>
  );
}

