import type {
  BlockSummary,
  FollowSummary,
  FriendRequestStatus,
  FriendRequestSummary,
  FriendSummary,
  FriendUserSummary,
  RawRow,
} from "./types";

export function asString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

export function toUserSummary(raw: unknown): FriendUserSummary | null {
  if (!raw || typeof raw !== "object") return null;
  const record = raw as RawRow;
  const id = asString(record.id);
  if (!id) return null;
  return {
    id,
    key: asString(record.user_key),
    name: asString(record.full_name),
    avatarUrl: asString(record.avatar_url),
  };
}

export function mapFriendRow(row: RawRow): FriendSummary {
  const friendUserId = asString(row.friend_user_id);
  if (!friendUserId) {
    throw new Error("Friend row missing friend_user_id");
  }
  const id = asString(row.id) ?? `${asString(row.user_id) ?? "friend"}:${friendUserId}`;
  return {
    id,
    friendUserId,
    requestId: asString(row.request_id),
    since: asString(row.created_at),
    user: toUserSummary(row.users),
  };
}

export function mapRequestRow(
  row: RawRow,
  direction: "incoming" | "outgoing",
): FriendRequestSummary {
  const id = asString(row.id);
  const requesterId = asString(row.requester_id);
  const recipientId = asString(row.recipient_id);
  if (!id || !requesterId || !recipientId) {
    throw new Error("Friend request row missing identifiers");
  }
  const status = (asString(row.status) as FriendRequestStatus | null) ?? "pending";
  const message = asString(row.message);
  const createdAt = asString(row.created_at);
  const respondedAt = asString(row.responded_at);
  const acceptedAt = asString(row.accepted_at);
  const profile =
    direction === "incoming" ? toUserSummary(row.requester) : toUserSummary(row.recipient);
  return {
    id,
    requesterId,
    recipientId,
    status,
    message,
    createdAt,
    respondedAt,
    acceptedAt,
    direction,
    user: profile,
  };
}

export function mapFollowRow(row: RawRow, direction: "following" | "follower"): FollowSummary {
  const id = asString(row.id);
  const followerId = asString(row.follower_user_id);
  const followeeId = asString(row.followee_user_id);
  if (!id || !followerId || !followeeId) {
    throw new Error("Follow row missing identifiers");
  }
  const createdAt = asString(row.created_at);
  const mutedAt = asString(row.muted_at);
  const profile =
    direction === "following" ? toUserSummary(row.followee) : toUserSummary(row.follower);
  return {
    id,
    followerId,
    followeeId,
    createdAt,
    mutedAt,
    direction,
    user: profile,
  };
}

export function mapBlockRow(row: RawRow): BlockSummary {
  const id = asString(row.id);
  const blockerId = asString(row.blocker_user_id);
  const blockedId = asString(row.blocked_user_id);
  if (!id || !blockerId || !blockedId) {
    throw new Error("Block row missing identifiers");
  }
  return {
    id,
    blockerId,
    blockedId,
    createdAt: asString(row.created_at),
    expiresAt: asString(row.expires_at),
    reason: asString(row.reason),
    user: toUserSummary(row.blocked),
  };
}
