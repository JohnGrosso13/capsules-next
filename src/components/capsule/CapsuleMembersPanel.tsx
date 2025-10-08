"use client";

import * as React from "react";
import {
  Check,
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
  if (normalized && (normalized === "founder" || normalized === "admin" || normalized === "leader" || normalized === "member")) {
    return normalized;
  }
  return "member";
}

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

  if (!open) return null;

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

  React.useEffect(() => {
    if (canViewPending && pendingCount === 0 && activeTab === "pending") {
      setActiveTab("members");
    }
  }, [canViewPending, pendingCount, activeTab]);

  const hasMembers = members.length > 0;
  const hasPending = pendingRequests.length > 0;

  return (
    <aside className={capTheme.membersPanel} aria-live="polite">
      <div className={capTheme.membersHeader}>
        <div>
          <h3 className={capTheme.membersTitle}>Members</h3>
          <p className={capTheme.membersSubtitle}>
            Manage who has access to this capsule. Pending requests appear here.
          </p>
        </div>
      </div>

      {loading ? <div className={capTheme.membersNotice}>Loading membership details...</div> : null}
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

      {canViewPending ? (
        <div className={capTheme.membersTabs} role="tablist" aria-label="Member management views">
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "members"}
            className={
              activeTab === "members"
                ? `${capTheme.membersTab} ${capTheme.membersTabActive}`
                : capTheme.membersTab
            }
            onClick={() => setActiveTab("members")}
          >
            Members
            <span className={capTheme.membersTabBadge}>{membersCount}</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "pending"}
            className={
              activeTab === "pending"
                ? `${capTheme.membersTab} ${capTheme.membersTabActive}`
                : capTheme.membersTab
            }
            onClick={() => setActiveTab("pending")}
          >
            Pending
            <span className={capTheme.membersTabBadge}>{pendingCount}</span>
          </button>
        </div>
      ) : null}

      {(!canViewPending || activeTab === "members") ? (
        <section className={capTheme.membersSection} aria-label="Capsule members">
          <header className={capTheme.membersSectionHeader}>
            <h4 className={capTheme.membersSectionTitle}>Members</h4>
            <span className={capTheme.membersSectionBadge}>{membersCount}</span>
          </header>
          {hasMembers ? (
            <ul className={capTheme.membersList}>
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
                  <li key={member.userId} className={capTheme.memberRow}>
                    <div className={capTheme.memberAvatar}>
                      <MemberAvatar name={member.name} avatarUrl={member.avatarUrl} />
                    </div>
                    <div className={capTheme.memberInfo}>
                      <div className={capTheme.memberName}>{member.name ?? "Member"}</div>
                      <div className={capTheme.memberMeta}>
                        {showRoleInMeta ? <span>{roleLabel}</span> : null}
                        {member.joinedAt ? <span>Joined {formatTimestamp(member.joinedAt)}</span> : null}
                      </div>
                    </div>
                    {hasActions ? (
                      <div className={capTheme.memberActions}>
                        {canEditRole ? (
                          <select
                            className={capTheme.memberRoleSelect}
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
                            className={capTheme.memberRemove}
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
            <p className={capTheme.membersEmpty}>No members have joined yet.</p>
          )}
        </section>
      ) : null}

      {canViewPending && activeTab === "pending" ? (
        <section className={capTheme.membersSection} aria-label="Pending member requests">
          <header className={capTheme.membersSectionHeader}>
            <h4 className={capTheme.membersSectionTitle}>Pending Requests</h4>
            <span className={capTheme.membersSectionBadge}>{pendingCount}</span>
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
    </aside>
  );
}
