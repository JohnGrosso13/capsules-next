export type FriendRequestStatus = "pending" | "accepted" | "declined" | "cancelled";

export type FriendGraphErrorCode =
  | "already_friends"
  | "already_pending"
  | "incoming_request_pending"
  | "blocked"
  | "not_found"
  | "unauthorized"
  | "invalid_action"
  | "self_target"
  | "conflict";

export class FriendGraphError extends Error {
  readonly code: FriendGraphErrorCode;
  readonly data?: Record<string, unknown>;

  constructor(code: FriendGraphErrorCode, message: string, data?: Record<string, unknown>) {
    super(message);
    this.code = code;
    if (data !== undefined) {
      this.data = data;
    }
  }
}

export type FriendUserSummary = {
  id: string;
  key: string | null;
  name: string | null;
  avatarUrl: string | null;
};

export type FriendSummary = {
  id: string;
  friendUserId: string;
  requestId: string | null;
  since: string | null;
  user: FriendUserSummary | null;
};

export type FriendRequestSummary = {
  id: string;
  requesterId: string;
  recipientId: string;
  status: FriendRequestStatus;
  message: string | null;
  createdAt: string | null;
  respondedAt: string | null;
  acceptedAt: string | null;
  direction: "incoming" | "outgoing";
  user: FriendUserSummary | null;
};

export type FollowSummary = {
  id: string;
  followerId: string;
  followeeId: string;
  createdAt: string | null;
  mutedAt: string | null;
  direction: "following" | "follower";
  user: FriendUserSummary | null;
};

export type BlockSummary = {
  id: string;
  blockerId: string;
  blockedId: string;
  createdAt: string | null;
  expiresAt: string | null;
  reason: string | null;
  user: FriendUserSummary | null;
};

export type SocialGraphSnapshot = {
  friends: FriendSummary[];
  incomingRequests: FriendRequestSummary[];
  outgoingRequests: FriendRequestSummary[];
  followers: FollowSummary[];
  following: FollowSummary[];
  blocked: BlockSummary[];
};

export type RawRow = Record<string, unknown>;
