"use client";

import * as React from "react";
import { Check, Info, Trash, WarningCircle, X, UserPlus } from "@phosphor-icons/react/dist/ssr";

import type {
  CapsuleMembershipAction,
  CapsuleMembershipState,
  CapsuleMemberRequestSummary,
} from "@/types/capsules";
import type { FriendItem } from "@/lib/friends/types";
import { useOptionalFriendsDataContext } from "@/components/providers/FriendsDataProvider";

import styles from "./CapsuleMembersPanel.module.css";

type CapsuleMembersPanelProps = {
  open: boolean;
  membership: CapsuleMembershipState | null;
  loading: boolean;
  error: string | null;
  mutatingAction: CapsuleMembershipAction | null;
  onChangePolicy?: (policy: "open" | "request_only" | "invite_only") => Promise<unknown> | unknown;
  onApprove: (requestId: string) => Promise<unknown> | unknown;
  onDecline: (requestId: string) => Promise<unknown> | unknown;
  onRemove: (memberId: string) => Promise<unknown> | unknown;
  onChangeRole: (memberId: string, role: string) => Promise<unknown> | unknown;
  onInvite: (targetUserId: string) => Promise<unknown> | unknown;
  onLeave?: () => Promise<unknown> | unknown;
};

type MemberPanelTab = "members" | "pending" | "follows";

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

const MEMBERSHIP_POLICY_OPTIONS = [
  { value: "open", label: "Open - auto-join" },
  { value: "request_only", label: "Request-only - approval required" },
  { value: "invite_only", label: "Invite-only - admins invite" },
] as const;

type MembershipPolicyValue = (typeof MEMBERSHIP_POLICY_OPTIONS)[number]["value"];

const EMPTY_MEMBERS: CapsuleMembershipState["members"] = [];
const EMPTY_REQUESTS: CapsuleMembershipState["requests"] = [];
const EMPTY_INVITES: CapsuleMembershipState["invites"] = [];
const EMPTY_FOLLOWERS: CapsuleMembershipState["followers"] = [];
const EMPTY_FRIENDS: FriendItem[] = [];

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
  onInvite,
  onChangePolicy,
  onLeave,
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
  const canApproveRequests = Boolean(viewer?.canApproveRequests);
  const canInviteMembers = Boolean(viewer?.canInviteMembers);
  const canChangeRoles = Boolean(viewer?.canChangeRoles);
  const canRemoveMembers = Boolean(viewer?.canRemoveMembers);
  const isOwner = Boolean(viewer?.isOwner);
  const requestStatus = viewer?.requestStatus ?? "none";
  const canLeaveCapsule = Boolean(onLeave && viewer?.isMember && !viewer.isOwner);
  const leaveBusy = mutatingAction === "leave";
  const handleLeaveCapsule = React.useCallback(() => {
    if (!canLeaveCapsule || leaveBusy || !onLeave) return;
    void onLeave();
  }, [canLeaveCapsule, leaveBusy, onLeave]);
  const members = membership?.members ?? EMPTY_MEMBERS;
  const pendingRequests = membership?.requests ?? EMPTY_REQUESTS;
  const pendingInvites = membership?.invites ?? EMPTY_INVITES;
  const followers = membership?.followers ?? EMPTY_FOLLOWERS;
  const pendingCount = membership?.counts.pendingRequests ?? 0;
  const membersCount = membership?.counts.members ?? 0;
  const followerCount = membership?.counts.followers ?? followers.length;
  const canViewPending = canApproveRequests || canInviteMembers;
  const membershipPolicy = (membership?.capsule?.membershipPolicy ??
    "request_only") as MembershipPolicyValue;
  const handlePolicyChange = React.useCallback(
    (policy: MembershipPolicyValue) => {
      if (mutatingAction || !onChangePolicy) return;
      void onChangePolicy(policy);
    },
    [mutatingAction, onChangePolicy],
  );
  const friendsContext = useOptionalFriendsDataContext();
  const availableFriends = friendsContext?.friends ?? EMPTY_FRIENDS;
  const showFollowsTab = followers.length > 0 || isOwner;
  const [activeTab, setActiveTab] = React.useState<MemberPanelTab>(() =>
    canViewPending && pendingCount > 0 ? "pending" : "members",
  );

  React.useEffect(() => {
    if (!canViewPending && activeTab === "pending") {
      setActiveTab("members");
    }
  }, [canViewPending, activeTab]);

  const excludedUserIds = React.useMemo(() => {
    const ids = new Set<string>();
    members.forEach((member) => ids.add(member.userId));
    pendingRequests.forEach((request) => ids.add(request.requesterId));
    pendingInvites.forEach((invite) => ids.add(invite.requesterId));
    return ids;
  }, [members, pendingInvites, pendingRequests]);

  const friendSuggestions = React.useMemo(() => {
    if (!canInviteMembers) return [];
    return availableFriends
      .filter((friend) => friend.userId && !excludedUserIds.has(friend.userId))
      .slice(0, 6);
  }, [availableFriends, excludedUserIds, canInviteMembers]);

  const hasSuggestions = friendSuggestions.length > 0;
  const hasFollowers = followers.length > 0;

  const [roleHelpOpen, setRoleHelpOpen] = React.useState(false);

  const tabItems = React.useMemo(() => {
    const items: Array<{ id: MemberPanelTab; label: string; badge: number }> = [
      { id: "members", label: "Members", badge: membersCount },
    ];
    if (canViewPending) {
      items.push({ id: "pending", label: "Pending", badge: pendingCount });
    }
    if (showFollowsTab) {
      items.push({ id: "follows", label: "Follows", badge: followerCount });
    }
    return items;
  }, [canViewPending, followerCount, membersCount, pendingCount, showFollowsTab]);

  const handleInviteFriend = React.useCallback(
    (userId: string) => {
      if (!userId || mutatingAction) return;
      void onInvite(userId);
    },
    [mutatingAction, onInvite],
  );

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
        <div className={styles.actions}>
          <button
            type="button"
            className={styles.button}
            data-variant="icon"
            onClick={() => setRoleHelpOpen((open) => !open)}
            aria-label={roleHelpOpen ? "Hide role explanations" : "What do roles do?"}
          >
            <Info size={16} weight="bold" />
          </button>
          {canChangeRoles && onChangePolicy ? (
            <div className={styles.policySelectGroup}>
              <label className={styles.policyLabel} htmlFor="membership-policy-select">
                Membership policy
              </label>
              <select
                id="membership-policy-select"
                className={styles.roleSelect}
                value={membershipPolicy}
                onChange={(event) => handlePolicyChange(event.target.value as MembershipPolicyValue)}
                disabled={mutatingAction !== null}
              >
                {MEMBERSHIP_POLICY_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
          ) : null}
          {canInviteMembers ? (
            <button
              type="button"
              className={styles.button}
              data-variant="refresh"
              onClick={() => setActiveTab("pending")}
            >
              <UserPlus size={16} weight="bold" />
              Start Inviting Friends
            </button>
          ) : null}
        </div>
      </div>

      {roleHelpOpen ? (
        <div className={styles.notice}>
          <div className={styles.roleHelp}>
            <strong className={styles.roleHelpTitle}>Roles in this capsule</strong>
            <ul className={styles.roleList}>
              <li>
                <strong>Founder</strong> – full control over members, store, streaming, and
                settings.
              </li>
              <li>
                <strong>Admin</strong> – manage members, store, analytics, ladders, and most
                configuration.
              </li>
              <li>
                <strong>Leader</strong> – invite members, manage ladders and events, and help
                moderate content.
              </li>
              <li>
                <strong>Member</strong> – post, comment, join events, and participate in ladders
                and streams.
              </li>
            </ul>
          </div>
        </div>
      ) : null}

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

  {canLeaveCapsule ? (
    <div className={styles.notice} data-tone="warning">
      <WarningCircle size={16} weight="bold" />
      <span>You can leave this capsule whenever you like.</span>
      <button
        type="button"
        className={styles.button}
        data-tone="danger"
        onClick={handleLeaveCapsule}
        disabled={leaveBusy}
      >
        Leave capsule
      </button>
    </div>
  ) : null}

      {tabItems.length > 1 ? (
        <div className={styles.tabs} role="tablist" aria-label="Member management views">
          {tabItems.map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={activeTab === tab.id}
              className={styles.tab}
              data-active={activeTab === tab.id}
              onClick={() => setActiveTab(tab.id)}
            >
              {tab.label}
              <span className={styles.tabBadge}>{tab.badge}</span>
            </button>
          ))}
        </div>
      ) : null}

      {activeTab === "members" ? (
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
                const canEditRole = canChangeRoles && !member.isOwner;
                const canRemove = canRemoveMembers && !member.isOwner;
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
          {hasPending && canApproveRequests ? (
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
            <p className={styles.empty}>
              {canApproveRequests
                ? "No pending requests at the moment."
                : "Requests are managed by founders or admins."}
            </p>
          )}
          {canInviteMembers ? (
            <>
              {pendingInvites.length ? (
                <div className={styles.subSection}>
                  <div className={styles.subSectionHeader}>
                    <span>Invited</span>
                    <span className={styles.sectionBadge}>{pendingInvites.length}</span>
                  </div>
                  <ul className={styles.list}>
                    {pendingInvites.map((invite) => {
                      const name = invite.requester?.name ?? "guest";
                      const invitedAt = invite.createdAt
                        ? formatTimestamp(invite.createdAt)
                        : null;
                      return (
                        <li key={invite.id} className={styles.row} data-kind="invite">
                          <div className={styles.avatar}>
                            <MemberAvatar name={name} avatarUrl={invite.requester?.avatarUrl ?? null} />
                          </div>
                          <div className={styles.info}>
                            <div className={styles.name}>{name}</div>
                            <div className={styles.meta}>
                              <span>Waiting for response</span>
                              {invitedAt ? <span>Invited {invitedAt}</span> : null}
                            </div>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ) : null}
              <div className={styles.subSection}>
                <div className={styles.subSectionHeader}>
                  <span>Suggested friends</span>
                  <span className={styles.sectionBadge}>{friendSuggestions.length}</span>
                </div>
                {hasSuggestions ? (
                  <ul className={styles.suggestionList}>
                    {friendSuggestions.map((friend) => {
                      const friendId = friend.userId;
                      return (
                        <li key={friend.id} className={styles.suggestionRow}>
                          <div className={styles.avatar}>
                            <MemberAvatar name={friend.name} avatarUrl={friend.avatar ?? null} />
                          </div>
                          <div className={styles.info}>
                            <div className={styles.name}>{friend.name ?? "Friend"}</div>
                            <div className={styles.meta}>
                              <span>Ready to invite</span>
                            </div>
                          </div>
                          <div className={styles.actionsInline}>
                            <button
                              type="button"
                              className={styles.button}
                              onClick={() => friendId && handleInviteFriend(friendId)}
                              disabled={mutatingAction === "invite_member" || !friendId}
                            >
                              Invite
                            </button>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                ) : (
                  <p className={styles.empty}>
                    You&apos;ve invited everyone available right now. Make new friends to see more
                    suggestions.
                  </p>
                )}
              </div>
            </>
          ) : null}
        </section>
      ) : null}

      {activeTab === "follows" ? (
        <section className={styles.section} aria-label="Capsule followers">
          <header className={styles.sectionHeader}>
            <h4 className={styles.sectionTitle}>Followers</h4>
            <span className={styles.sectionBadge}>{followerCount}</span>
          </header>
          {hasFollowers ? (
            <ul className={styles.list}>
              {followers.map((follower) => {
                const followedAt = follower.followedAt
                  ? formatTimestamp(follower.followedAt)
                  : null;
                return (
                  <li key={follower.userId} className={styles.row} data-kind="follower">
                    <div className={styles.avatar}>
                      <MemberAvatar name={follower.name} avatarUrl={follower.avatarUrl} />
                    </div>
                    <div className={styles.info}>
                      <div className={styles.name}>{follower.name ?? "Follower"}</div>
                      <div className={styles.meta}>
                        {followedAt ? <span>Following since {followedAt}</span> : null}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className={styles.empty}>No followers yet.</p>
          )}
        </section>
      ) : null}
    </aside>
  );
}
