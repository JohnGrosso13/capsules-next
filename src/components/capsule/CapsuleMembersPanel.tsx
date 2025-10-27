"use client";

import * as React from "react";
import { Check, Trash, WarningCircle, X } from "@phosphor-icons/react/dist/ssr";

import type {
  CapsuleMembershipAction,
  CapsuleMembershipState,
  CapsuleMemberRequestSummary,
} from "@/types/capsules";

import styles from "./CapsuleMembersPanel.module.css";

type CapsuleMembersPanelProps = {
  open: boolean;
  membership: CapsuleMembershipState | null;
  loading: boolean;
  error: string | null;
  mutatingAction: CapsuleMembershipAction | null;
  onApprove: (requestId: string) => Promise<unknown> | unknown;
  onDecline: (requestId: string) => Promise<unknown> | unknown;
  onRemove: (memberId: string) => Promise<unknown> | unknown;
  onChangeRole: (memberId: string, role: string) => Promise<unknown> | unknown;
};

type MemberPanelTab = "members" | "pending";

const MEMBER_ROLE_OPTIONS = [
  { value: "founder", label: "Founder" },
  { value: "admin", label: "Admin" },
  { value: "leader", label: "Leader" },
  { value: "member", label: "Member" },
] as const;

type MemberRoleValue = (typeof MEMBER_ROLE_OPTIONS)[number]["value"];

const MEMBER_ROLE_LABELS: Record<MemberRoleValue, string> = MEMBER_ROLE_OPTIONS.reduce(
  (map, option) => ({ ...map, [option.value]: option.label }),
  {} as Record<MemberRoleValue, string>,
);

function resolveMemberRole(member: { role: string | null; isOwner: boolean }): MemberRoleValue {
  if (member.isOwner) return "founder";
  const normalized = typeof member.role === "string" ? member.role.trim().toLowerCase() : null;
  if (
    normalized &&
    (normalized === "founder" ||
      normalized === "admin" ||
      normalized === "leader" ||
      normalized === "member")
  ) {
    return normalized;
  }
  return "member";
}

function MemberAvatar({ name, avatarUrl }: { name: string | null; avatarUrl: string | null }) {
  if (avatarUrl) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img className={styles.avatarImage} src={avatarUrl} alt="" />;
  }
  const initial = (name ?? "?").trim().charAt(0).toUpperCase() || "?";
  return <span className={styles.avatarFallback}>{initial}</span>;
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
    <li className={styles.row} data-kind="pending" key={request.id}>
      <div className={styles.avatar}>
        <MemberAvatar name={name} avatarUrl={request.requester?.avatarUrl ?? null} />
      </div>
      <div className={styles.info}>
        <div className={styles.name}>{name}</div>
        {createdAt ? <div className={styles.meta}>Requested {createdAt}</div> : null}
        {message ? <p className={styles.message}>{message}</p> : null}
      </div>
      <div className={styles.actionsInline}>
        <button
          type="button"
          className={styles.button}
          data-tone="positive"
          onClick={() => onApprove(request.id)}
          disabled={disabled}
        >
          <Check size={16} weight="bold" />
          Approve
        </button>
        <button
          type="button"
          className={styles.button}
          data-tone="decline"
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
  onApprove,
  onDecline,
  onRemove,
  onChangeRole,
}: CapsuleMembersPanelProps) {
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
  const handleRoleChange = React.useCallback(
    (memberId: string, role: MemberRoleValue, currentRole: MemberRoleValue) => {
      if (mutatingAction) return;
      if (role === currentRole) return;
      void onChangeRole(memberId, role);
    },
    [mutatingAction, onChangeRole],
  );

  const viewer = membership?.viewer ?? null;
  const isOwner = Boolean(viewer?.isOwner);
  const requestStatus = viewer?.requestStatus ?? "none";
  const members = membership?.members ?? [];
  const pendingRequests = membership?.requests ?? [];
  const pendingCount = membership?.counts.pendingRequests ?? 0;
  const membersCount = membership?.counts.members ?? 0;
  const canViewPending = isOwner;
  const [activeTab, setActiveTab] = React.useState<MemberPanelTab>(() =>
    canViewPending && pendingCount > 0 ? "pending" : "members",
  );

  React.useEffect(() => {
    if (!canViewPending && activeTab === "pending") {
      setActiveTab("members");
    }
  }, [canViewPending, activeTab]);

  if (!open) return null;

  const hasMembers = members.length > 0;
  const hasPending = pendingRequests.length > 0;

  return (
    <aside className={styles.panel} aria-live="polite">
      <div className={styles.header}>
        <div className={styles.titleGroup}>
          <h3 className={styles.title}>Members</h3>
          <p className={styles.subtitle}>
            Manage who has access to this capsule. Pending requests appear here.
          </p>
        </div>
      </div>

      {loading ? <div className={styles.notice}>Loading membership details...</div> : null}

      {error ? (
        <div className={styles.notice} data-tone="error">
          <WarningCircle size={16} weight="bold" />
          <span>{error}</span>
        </div>
      ) : null}

      {!isOwner && requestStatus === "pending" ? (
        <div className={styles.notice}>
          <WarningCircle size={16} weight="bold" />
          Your request to join is pending approval.
        </div>
      ) : null}

      {!isOwner && requestStatus === "declined" ? (
        <div className={styles.notice}>
          <WarningCircle size={16} weight="bold" />
          Your previous request was declined. You can request again at any time.
        </div>
      ) : null}

      {canViewPending ? (
        <div className={styles.tabs} role="tablist" aria-label="Member management views">
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "members"}
            className={styles.tab}
            data-active={activeTab === "members"}
            onClick={() => setActiveTab("members")}
          >
            Members
            <span className={styles.tabBadge}>{membersCount}</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "pending"}
            className={styles.tab}
            data-active={activeTab === "pending"}
            onClick={() => setActiveTab("pending")}
          >
            Pending
            <span className={styles.tabBadge}>{pendingCount}</span>
          </button>
        </div>
      ) : null}

      {!canViewPending || activeTab === "members" ? (
        <section className={styles.section} aria-label="Capsule members">
          <header className={styles.sectionHeader}>
            <h4 className={styles.sectionTitle}>Members</h4>
            <span className={styles.sectionBadge}>{membersCount}</span>
          </header>
          {hasMembers ? (
            <ul className={styles.list}>
              {members.map((member) => {
                const roleValue = resolveMemberRole(member);
                const roleLabel = MEMBER_ROLE_LABELS[roleValue];
                const canEditRole = isOwner && !member.isOwner;
                const canRemove = isOwner && !member.isOwner;
                const hasActions = canEditRole || canRemove;
                const isMutating = mutatingAction !== null;
                const showRoleInMeta = !canEditRole;

                const handleSelectChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
                  const nextRole = event.target.value as MemberRoleValue;
                  handleRoleChange(member.userId, nextRole, roleValue);
                };

                return (
                  <li key={member.userId} className={styles.row} data-kind="member">
                    <div className={styles.avatar}>
                      <MemberAvatar name={member.name} avatarUrl={member.avatarUrl} />
                    </div>
                    <div className={styles.info}>
                      <div className={styles.name}>{member.name ?? "Member"}</div>
                      <div className={styles.meta}>
                        {showRoleInMeta ? <span>{roleLabel}</span> : null}
                        {member.joinedAt ? (
                          <span>Joined {formatTimestamp(member.joinedAt)}</span>
                        ) : null}
                      </div>
                    </div>
                    {hasActions ? (
                      <div className={styles.actionsInline}>
                        {canEditRole ? (
                          <select
                            className={styles.roleSelect}
                            value={roleValue}
                            onChange={handleSelectChange}
                            disabled={isMutating}
                            aria-label={`Change role for ${member.name ?? "member"}`}
                          >
                            {MEMBER_ROLE_OPTIONS.map((option) => (
                              <option key={option.value} value={option.value}>
                                {option.label}
                              </option>
                            ))}
                          </select>
                        ) : null}
                        {canRemove ? (
                          <button
                            type="button"
                            className={styles.button}
                            data-tone="danger"
                            onClick={() => handleRemove(member.userId)}
                            disabled={isMutating}
                          >
                            <Trash size={16} weight="bold" />
                            Remove
                          </button>
                        ) : null}
                      </div>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className={styles.empty}>No members have joined yet.</p>
          )}
        </section>
      ) : null}

      {canViewPending && activeTab === "pending" ? (
        <section className={styles.section} aria-label="Pending member requests">
          <header className={styles.sectionHeader}>
            <h4 className={styles.sectionTitle}>Pending Requests</h4>
            <span className={styles.sectionBadge}>{pendingCount}</span>
          </header>
          {hasPending ? (
            <ul className={styles.list}>
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
            <p className={styles.empty}>No pending requests at the moment.</p>
          )}
        </section>
      ) : null}
    </aside>
  );
}
