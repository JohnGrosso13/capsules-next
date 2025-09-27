import { getSupabaseAdminClient } from "@/lib/supabase/admin";

import { publishFriendEvents } from "@/lib/realtime/ably-server";
import type { FriendRealtimeEvent } from "@/lib/realtime/ably-server";

import {
  FriendGraphError,
  type FriendRequestStatus,
  type FriendSummary,
  type FriendRequestSummary,
  type FollowSummary,
  type BlockSummary,
  type SocialGraphSnapshot,
  type FriendUserSummary,
  type RawRow,
} from "./types";

const castRow = <T>(value: unknown): T => value as T;

const FRIENDSHIP_SELECT =
  "id,user_id,friend_user_id,request_id,created_at,deleted_at,users:friend_user_id(id,user_key,full_name,avatar_url)";
const FRIEND_REQUEST_SELECT =
  "id,requester_id,recipient_id,status,message,created_at,responded_at,accepted_at,deleted_at," +
  "requester:requester_id(id,user_key,full_name,avatar_url)," +
  "recipient:recipient_id(id,user_key,full_name,avatar_url)";
const FOLLOW_EDGE_SELECT =
  "id,follower_user_id,followee_user_id,muted_at,created_at,deleted_at," +
  "follower:follower_user_id(id,user_key,full_name,avatar_url)," +
  "followee:followee_user_id(id,user_key,full_name,avatar_url)";
const BLOCK_SELECT =
  "id,blocker_user_id,blocked_user_id,reason,expires_at,created_at,deleted_at," +
  "blocked:blocked_user_id(id,user_key,full_name,avatar_url)";

const NO_ROW_CODE = "PGRST116";

function asString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

function toUserSummary(raw: unknown): FriendUserSummary | null {
  if (!raw || typeof raw !== "object") return null;
  const record = castRow<RawRow>(raw);
  const id = asString(record.id);
  if (!id) return null;
  return {
    id,
    key: asString(record.user_key),
    name: asString(record.full_name),
    avatarUrl: asString(record.avatar_url),
  };
}

function mapFriendRow(row: RawRow): FriendSummary {
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

function mapRequestRow(row: RawRow, direction: "incoming" | "outgoing"): FriendRequestSummary {
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

function mapFollowRow(row: RawRow, direction: "following" | "follower"): FollowSummary {
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

function mapBlockRow(row: RawRow): BlockSummary {
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

function nowIso(): string {
  return new Date().toISOString();
}

async function fetchPendingRequest(
  requesterId: string,
  recipientId: string,
): Promise<RawRow | null> {
  const supabase = getSupabaseAdminClient();
  const response = await supabase
    .from("friend_requests")
    .select(FRIEND_REQUEST_SELECT)
    .eq("requester_id", requesterId)
    .eq("recipient_id", recipientId)
    .eq("status", "pending")
    .is("deleted_at", null)
    .maybeSingle();
  if (response.error && response.error.code !== NO_ROW_CODE) throw response.error;
  const record = response.data;
  return record ? castRow<RawRow>(record) : null;
}

async function fetchFriendshipRow(userId: string, friendId: string): Promise<RawRow | null> {
  const supabase = getSupabaseAdminClient();
  const response = await supabase
    .from("friendships")
    .select(FRIENDSHIP_SELECT)
    .eq("user_id", userId)
    .eq("friend_user_id", friendId)
    .is("deleted_at", null)
    .maybeSingle();
  if (response.error && response.error.code !== NO_ROW_CODE) throw response.error;
  const record = response.data;
  return record ? castRow<RawRow>(record) : null;
}

async function fetchBlockBetween(userA: string, userB: string): Promise<boolean> {
  const supabase = getSupabaseAdminClient();
  const response = await supabase
    .from("user_blocks")
    .select("id")
    .or(
      `and(blocker_user_id.eq.${userA},blocked_user_id.eq.${userB},deleted_at.is.null),` +
        `and(blocker_user_id.eq.${userB},blocked_user_id.eq.${userA},deleted_at.is.null)`,
    );
  if (response.error) throw response.error;
  return Boolean(response.data && response.data.length > 0);
}

async function ensureFriendshipEdge(
  userId: string,
  friendId: string,
  requestId: string,
): Promise<RawRow> {
  const supabase = getSupabaseAdminClient();
  const existing = await supabase
    .from("friendships")
    .select("id, deleted_at")
    .eq("user_id", userId)
    .eq("friend_user_id", friendId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (existing.error && existing.error.code !== NO_ROW_CODE) throw existing.error;
  if (existing.data) {
    const { id } = castRow<RawRow>(existing.data);
    const { error } = await supabase
      .from("friendships")
      .update({ deleted_at: null, request_id: requestId })
      .eq("id", id);
    if (error) throw error;
  } else {
    const { error } = await supabase
      .from("friendships")
      .insert([{ user_id: userId, friend_user_id: friendId, request_id: requestId }]);
    if (error) throw error;
  }
  const refreshed = await supabase
    .from("friendships")
    .select(FRIENDSHIP_SELECT)
    .eq("user_id", userId)
    .eq("friend_user_id", friendId)
    .is("deleted_at", null)
    .single();
  if (refreshed.error) throw refreshed.error;
  return castRow<RawRow>(refreshed.data);
}

async function softDeleteFriendshipEdge(
  userId: string,
  friendId: string,
  removedAt: string,
): Promise<void> {
  const supabase = getSupabaseAdminClient();
  const { error } = await supabase
    .from("friendships")
    .update({ deleted_at: removedAt })
    .eq("user_id", userId)
    .eq("friend_user_id", friendId)
    .is("deleted_at", null);
  if (error) throw error;
}

async function softDeleteFollowEdge(
  followerId: string,
  followeeId: string,
  removedAt: string,
): Promise<void> {
  const supabase = getSupabaseAdminClient();
  const { error } = await supabase
    .from("user_follows")
    .update({ deleted_at: removedAt })
    .eq("follower_user_id", followerId)
    .eq("followee_user_id", followeeId)
    .is("deleted_at", null);
  if (error) throw error;
}

async function closePendingRequest(
  requesterId: string,
  recipientId: string,
  status: FriendRequestStatus,
  closedAt: string,
): Promise<void> {
  const supabase = getSupabaseAdminClient();
  const { error } = await supabase
    .from("friend_requests")
    .update({ status, responded_at: closedAt, deleted_at: closedAt })
    .eq("requester_id", requesterId)
    .eq("recipient_id", recipientId)
    .eq("status", "pending")
    .is("deleted_at", null);
  if (error) throw error;
}

export async function listSocialGraph(userId: string): Promise<SocialGraphSnapshot> {
  const supabase = getSupabaseAdminClient();
  const [friendsRes, incomingRes, outgoingRes, followersRes, followingRes, blockedRes] =
    await Promise.all([
      supabase
        .from("friendships")
        .select(FRIENDSHIP_SELECT)
        .eq("user_id", userId)
        .is("deleted_at", null)
        .order("created_at", { ascending: true }),
      supabase
        .from("friend_requests")
        .select(FRIEND_REQUEST_SELECT)
        .eq("recipient_id", userId)
        .eq("status", "pending")
        .is("deleted_at", null)
        .order("created_at", { ascending: true }),
      supabase
        .from("friend_requests")
        .select(FRIEND_REQUEST_SELECT)
        .eq("requester_id", userId)
        .eq("status", "pending")
        .is("deleted_at", null)
        .order("created_at", { ascending: true }),
      supabase
        .from("user_follows")
        .select(FOLLOW_EDGE_SELECT)
        .eq("followee_user_id", userId)
        .is("deleted_at", null)
        .order("created_at", { ascending: true }),
      supabase
        .from("user_follows")
        .select(FOLLOW_EDGE_SELECT)
        .eq("follower_user_id", userId)
        .is("deleted_at", null)
        .order("created_at", { ascending: true }),
      supabase
        .from("user_blocks")
        .select(BLOCK_SELECT)
        .eq("blocker_user_id", userId)
        .is("deleted_at", null)
        .order("created_at", { ascending: true }),
    ]);

  if (friendsRes.error) throw friendsRes.error;
  if (incomingRes.error) throw incomingRes.error;
  if (outgoingRes.error) throw outgoingRes.error;
  if (followersRes.error) throw followersRes.error;
  if (followingRes.error) throw followingRes.error;
  if (blockedRes.error) throw blockedRes.error;

  const friends = (friendsRes.data ?? []).map((row) => mapFriendRow(castRow<RawRow>(row)));
  const incomingRequests = (incomingRes.data ?? []).map((row) =>
    mapRequestRow(castRow<RawRow>(row), "incoming"),
  );
  const outgoingRequests = (outgoingRes.data ?? []).map((row) =>
    mapRequestRow(castRow<RawRow>(row), "outgoing"),
  );
  const followers = (followersRes.data ?? []).map((row) =>
    mapFollowRow(castRow<RawRow>(row), "follower"),
  );
  const following = (followingRes.data ?? []).map((row) =>
    mapFollowRow(castRow<RawRow>(row), "following"),
  );
  const blocked = (blockedRes.data ?? []).map((row) => mapBlockRow(castRow<RawRow>(row)));

  return { friends, incomingRequests, outgoingRequests, followers, following, blocked };
}

export async function sendFriendRequest(
  requesterId: string,
  recipientId: string,
  options: { message?: string | null } = {},
): Promise<FriendRequestSummary> {
  if (requesterId === recipientId) {
    throw new FriendGraphError("self_target", "You cannot add yourself.");
  }
  if (await fetchBlockBetween(requesterId, recipientId)) {
    throw new FriendGraphError("blocked", "One of the users has blocked the other.");
  }
  const existingFriendship = await fetchFriendshipRow(requesterId, recipientId);
  if (existingFriendship) {
    throw new FriendGraphError("already_friends", "You are already friends.", {
      friend: mapFriendRow(existingFriendship),
    });
  }
  const inbound = await fetchPendingRequest(recipientId, requesterId);
  if (inbound) {
    throw new FriendGraphError("incoming_request_pending", "Accept the existing request instead.", {
      request: mapRequestRow(inbound, "incoming"),
    });
  }
  const outbound = await fetchPendingRequest(requesterId, recipientId);
  if (outbound) {
    throw new FriendGraphError("already_pending", "Request already pending.", {
      request: mapRequestRow(outbound, "outgoing"),
    });
  }

  const supabase = getSupabaseAdminClient();
  const latest = await supabase
    .from("friend_requests")
    .select("id,status")
    .eq("requester_id", requesterId)
    .eq("recipient_id", recipientId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (latest.error && latest.error.code !== NO_ROW_CODE) throw latest.error;

  let requestRow: RawRow | null = null;
  if (latest.data && latest.data.status !== "pending") {
    const { data, error } = await supabase
      .from("friend_requests")
      .update({
        status: "pending",
        message: options.message ?? null,
        responded_at: null,
        accepted_at: null,
        deleted_at: null,
      })
      .eq("id", latest.data.id)
      .select(FRIEND_REQUEST_SELECT)
      .single();
    if (error) throw error;
    requestRow = castRow<RawRow>(data);
  } else {
    const { data, error } = await supabase
      .from("friend_requests")
      .insert([
        {
          requester_id: requesterId,
          recipient_id: recipientId,
          status: "pending",
          message: options.message ?? null,
        },
      ])
      .select(FRIEND_REQUEST_SELECT)
      .single();
    if (error) throw error;
    requestRow = castRow<RawRow>(data);
  }
  const outgoingSummary = mapRequestRow(requestRow, "outgoing");
  const incomingSummary = mapRequestRow(requestRow, "incoming");

  await publishFriendEvents([
    {
      userId: requesterId,
      event: {
        type: "friend.request.created",
        payload: { request: outgoingSummary, direction: "outgoing" },
      },
    },
    {
      userId: recipientId,
      event: {
        type: "friend.request.created",
        payload: { request: incomingSummary, direction: "incoming" },
      },
    },
  ]);

  return outgoingSummary;
}

export async function acceptFriendRequest(
  requestId: string,
  actorUserId: string,
): Promise<{ request: FriendRequestSummary; friends: FriendSummary[] }> {
  const supabase = getSupabaseAdminClient();
  const response = await supabase
    .from("friend_requests")
    .select(FRIEND_REQUEST_SELECT)
    .eq("id", requestId)
    .maybeSingle();
  if (response.error && response.error.code !== NO_ROW_CODE) throw response.error;
  if (!response.data) {
    throw new FriendGraphError("not_found", "Friend request not found.");
  }
  const row = castRow<RawRow>(response.data);
  const requesterId = asString(row.requester_id);
  const recipientId = asString(row.recipient_id);
  if (!requesterId || !recipientId) {
    throw new FriendGraphError("conflict", "Friend request is malformed.");
  }
  if (recipientId !== actorUserId) {
    throw new FriendGraphError("unauthorized", "Only the recipient can accept the request.");
  }
  if ((row.status as string) !== "pending" || row.deleted_at) {
    throw new FriendGraphError("invalid_action", "This request is no longer pending.");
  }
  const acceptedAt = nowIso();
  const { data, error } = await supabase
    .from("friend_requests")
    .update({
      status: "accepted",
      responded_at: acceptedAt,
      accepted_at: acceptedAt,
    })
    .eq("id", requestId)
    .eq("status", "pending")
    .is("deleted_at", null)
    .select(FRIEND_REQUEST_SELECT)
    .single();
  if (error) throw error;

  await ensureFriendshipEdge(requesterId, recipientId, requestId);
  await ensureFriendshipEdge(recipientId, requesterId, requestId);
  await closePendingRequest(recipientId, requesterId, "cancelled", acceptedAt);

  const friends = await Promise.all([
    fetchFriendshipRow(requesterId, recipientId),
    fetchFriendshipRow(recipientId, requesterId),
  ]);

  const incomingSummary = mapRequestRow(castRow<RawRow>(data), "incoming");
  const outgoingSummary = mapRequestRow(castRow<RawRow>(data), "outgoing");

  const requesterFriendRow = friends[0];
  const recipientFriendRow = friends[1];
  const requesterFriend = requesterFriendRow
    ? mapFriendRow(castRow<RawRow>(requesterFriendRow))
    : null;
  const recipientFriend = recipientFriendRow
    ? mapFriendRow(castRow<RawRow>(recipientFriendRow))
    : null;

  const events: Array<{ userId: string; event: FriendRealtimeEvent }> = [
    {
      userId: requesterId,
      event: { type: "friend.request.updated", payload: { request: outgoingSummary } },
    },
    {
      userId: recipientId,
      event: { type: "friend.request.updated", payload: { request: incomingSummary } },
    },
  ];

  if (requesterFriend) {
    events.push({
      userId: requesterId,
      event: { type: "friendship.created", payload: { friend: requesterFriend } },
    });
  }

  if (recipientFriend) {
    events.push({
      userId: recipientId,
      event: { type: "friendship.created", payload: { friend: recipientFriend } },
    });
  }

  await publishFriendEvents(events);

  const friendSummaries: FriendSummary[] = [];
  if (requesterFriend) friendSummaries.push(requesterFriend);
  if (recipientFriend) friendSummaries.push(recipientFriend);

  return {
    request: incomingSummary,
    friends: friendSummaries,
  };
}

export async function declineFriendRequest(
  requestId: string,
  actorUserId: string,
): Promise<FriendRequestSummary> {
  const supabase = getSupabaseAdminClient();
  const response = await supabase
    .from("friend_requests")
    .select(FRIEND_REQUEST_SELECT)
    .eq("id", requestId)
    .maybeSingle();
  if (response.error && response.error.code !== NO_ROW_CODE) throw response.error;
  if (!response.data) {
    throw new FriendGraphError("not_found", "Friend request not found.");
  }
  const row = castRow<RawRow>(response.data);
  const requesterId = asString(row.requester_id);
  const recipientId = asString(row.recipient_id);
  if (!requesterId || !recipientId) {
    throw new FriendGraphError("conflict", "Friend request is malformed.");
  }
  if (recipientId !== actorUserId) {
    throw new FriendGraphError("unauthorized", "Only the recipient can decline the request.");
  }
  if ((row.status as string) !== "pending" || row.deleted_at) {
    throw new FriendGraphError("invalid_action", "This request is no longer pending.");
  }
  const declinedAt = nowIso();
  const { data, error } = await supabase
    .from("friend_requests")
    .update({
      status: "declined",
      responded_at: declinedAt,
      deleted_at: declinedAt,
    })
    .eq("id", requestId)
    .eq("status", "pending")
    .is("deleted_at", null)
    .select(FRIEND_REQUEST_SELECT)
    .single();
  if (error) throw error;

  const incomingSummary = mapRequestRow(castRow<RawRow>(data), "incoming");
  const outgoingSummary = mapRequestRow(castRow<RawRow>(data), "outgoing");

  await publishFriendEvents([
    {
      userId: requesterId,
      event: {
        type: "friend.request.removed",
        payload: { requestId, reason: "declined", request: outgoingSummary },
      },
    },
    {
      userId: recipientId,
      event: {
        type: "friend.request.removed",
        payload: { requestId, reason: "declined", request: incomingSummary },
      },
    },
  ]);

  return incomingSummary;
}

export async function cancelFriendRequest(
  requestId: string,
  actorUserId: string,
): Promise<FriendRequestSummary> {
  const supabase = getSupabaseAdminClient();
  const response = await supabase
    .from("friend_requests")
    .select(FRIEND_REQUEST_SELECT)
    .eq("id", requestId)
    .maybeSingle();
  if (response.error && response.error.code !== NO_ROW_CODE) throw response.error;
  if (!response.data) {
    throw new FriendGraphError("not_found", "Friend request not found.");
  }
  const row = castRow<RawRow>(response.data);
  const requesterId = asString(row.requester_id);
  const recipientId = asString(row.recipient_id);
  if (!requesterId || !recipientId) {
    throw new FriendGraphError("conflict", "Friend request is malformed.");
  }
  if (requesterId !== actorUserId) {
    throw new FriendGraphError("unauthorized", "Only the requester can cancel the request.");
  }
  if ((row.status as string) !== "pending" || row.deleted_at) {
    throw new FriendGraphError("invalid_action", "This request is no longer pending.");
  }
  const cancelledAt = nowIso();
  const { data, error } = await supabase
    .from("friend_requests")
    .update({
      status: "cancelled",
      responded_at: cancelledAt,
      deleted_at: cancelledAt,
    })
    .eq("id", requestId)
    .eq("status", "pending")
    .is("deleted_at", null)
    .select(FRIEND_REQUEST_SELECT)
    .single();
  if (error) throw error;

  const outgoingSummary = mapRequestRow(castRow<RawRow>(data), "outgoing");
  const incomingSummary = mapRequestRow(castRow<RawRow>(data), "incoming");

  await publishFriendEvents([
    {
      userId: requesterId,
      event: {
        type: "friend.request.removed",
        payload: { requestId, reason: "cancelled", request: outgoingSummary },
      },
    },
    {
      userId: recipientId,
      event: {
        type: "friend.request.removed",
        payload: { requestId, reason: "cancelled", request: incomingSummary },
      },
    },
  ]);

  return outgoingSummary;
}

export async function removeFriendship(
  userId: string,
  friendUserId: string,
): Promise<FriendSummary> {
  const existing = await fetchFriendshipRow(userId, friendUserId);
  if (!existing) {
    throw new FriendGraphError("not_found", "Friendship not found.");
  }
  const removedAt = nowIso();
  await softDeleteFriendshipEdge(userId, friendUserId, removedAt);
  await softDeleteFriendshipEdge(friendUserId, userId, removedAt);

  await publishFriendEvents([
    {
      userId,
      event: { type: "friendship.removed", payload: { friendUserId } },
    },
    {
      userId: friendUserId,
      event: { type: "friendship.removed", payload: { friendUserId: userId } },
    },
  ]);

  return mapFriendRow(existing);
}

export async function followUser(followerId: string, followeeId: string): Promise<FollowSummary> {
  if (followerId === followeeId) {
    throw new FriendGraphError("self_target", "You cannot follow yourself.");
  }
  if (await fetchBlockBetween(followerId, followeeId)) {
    throw new FriendGraphError("blocked", "One of the users has blocked the other.");
  }
  const supabase = getSupabaseAdminClient();
  const existing = await supabase
    .from("user_follows")
    .select(FOLLOW_EDGE_SELECT)
    .eq("follower_user_id", followerId)
    .eq("followee_user_id", followeeId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (existing.error && existing.error.code !== NO_ROW_CODE) throw existing.error;

  let followRow: RawRow | null = null;
  if (existing.data) {
    const row = castRow<RawRow>(existing.data);
    if (!row.deleted_at) {
      followRow = row;
    } else {
      const updated = await supabase
        .from("user_follows")
        .update({ deleted_at: null })
        .eq("id", row.id)
        .select(FOLLOW_EDGE_SELECT)
        .single();
      if (updated.error) throw updated.error;
      followRow = castRow<RawRow>(updated.data);
    }
  } else {
    const inserted = await supabase
      .from("user_follows")
      .insert([{ follower_user_id: followerId, followee_user_id: followeeId }])
      .select(FOLLOW_EDGE_SELECT)
      .single();
    if (inserted.error) throw inserted.error;
    followRow = castRow<RawRow>(inserted.data);
  }

  if (!followRow) {
    throw new FriendGraphError("conflict", "Failed to establish follow relationship.");
  }

  const followingSummary = mapFollowRow(followRow, "following");
  const followerSummary = mapFollowRow(followRow, "follower");

  await publishFriendEvents([
    {
      userId: followerId,
      event: {
        type: "follow.updated",
        payload: { state: "follow", follow: followingSummary, userId: followeeId },
      },
    },
    {
      userId: followeeId,
      event: {
        type: "follow.updated",
        payload: { state: "follow", follow: followerSummary, userId: followerId },
      },
    },
  ]);

  return followingSummary;
}

export async function unfollowUser(followerId: string, followeeId: string): Promise<void> {
  const removedAt = nowIso();
  await softDeleteFollowEdge(followerId, followeeId, removedAt);

  await publishFriendEvents([
    {
      userId: followerId,
      event: { type: "follow.updated", payload: { state: "unfollow", userId: followeeId } },
    },
    {
      userId: followeeId,
      event: { type: "follow.updated", payload: { state: "unfollow", userId: followerId } },
    },
  ]);
}

export async function blockUser(
  blockerId: string,
  blockedId: string,
  options: { reason?: string | null; expiresAt?: string | null } = {},
): Promise<BlockSummary> {
  if (blockerId === blockedId) {
    throw new FriendGraphError("self_target", "You cannot block yourself.");
  }
  const supabase = getSupabaseAdminClient();
  const existing = await supabase
    .from("user_blocks")
    .select(BLOCK_SELECT)
    .eq("blocker_user_id", blockerId)
    .eq("blocked_user_id", blockedId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (existing.error && existing.error.code !== NO_ROW_CODE) throw existing.error;
  let row: RawRow;
  if (existing.data) {
    const existingRow = castRow<RawRow>(existing.data);
    const blockId = asString(existingRow.id);
    if (!blockId) throw new Error("Block row missing id");
    const update: Record<string, unknown> = {
      deleted_at: null,
      reason: options.reason ?? asString(existingRow.reason),
      expires_at: options.expiresAt ?? null,
    };
    const { data, error } = await supabase
      .from("user_blocks")
      .update(update)
      .eq("id", blockId)
      .select(BLOCK_SELECT)
      .single();
    if (error) throw error;
    row = castRow<RawRow>(data);
  } else {
    const { data, error } = await supabase
      .from("user_blocks")
      .insert([
        {
          blocker_user_id: blockerId,
          blocked_user_id: blockedId,
          reason: options.reason ?? null,
          expires_at: options.expiresAt ?? null,
        },
      ])
      .select(BLOCK_SELECT)
      .single();
    if (error) throw error;
    row = castRow<RawRow>(data);
  }

  const blockSummary = mapBlockRow(row);

  const closedAt = nowIso();
  await softDeleteFriendshipEdge(blockerId, blockedId, closedAt);
  await softDeleteFriendshipEdge(blockedId, blockerId, closedAt);
  await closePendingRequest(blockerId, blockedId, "cancelled", closedAt);
  await closePendingRequest(blockedId, blockerId, "declined", closedAt);
  await softDeleteFollowEdge(blockerId, blockedId, closedAt);
  await softDeleteFollowEdge(blockedId, blockerId, closedAt);

  await publishFriendEvents([
    {
      userId: blockerId,
      event: {
        type: "block.updated",
        payload: { state: "block", block: blockSummary, userId: blockedId },
      },
    },
    {
      userId: blockedId,
      event: { type: "block.updated", payload: { state: "block", userId: blockerId } },
    },
    {
      userId: blockerId,
      event: { type: "friendship.removed", payload: { friendUserId: blockedId } },
    },
    {
      userId: blockedId,
      event: { type: "friendship.removed", payload: { friendUserId: blockerId } },
    },
    {
      userId: blockerId,
      event: { type: "follow.updated", payload: { state: "unfollow", userId: blockedId } },
    },
    {
      userId: blockedId,
      event: { type: "follow.updated", payload: { state: "unfollow", userId: blockerId } },
    },
  ]);

  return blockSummary;
}

export async function unblockUser(
  blockerId: string,
  blockedId: string,
): Promise<BlockSummary | null> {
  const supabase = getSupabaseAdminClient();
  const existing = await supabase
    .from("user_blocks")
    .select(BLOCK_SELECT)
    .eq("blocker_user_id", blockerId)
    .eq("blocked_user_id", blockedId)
    .is("deleted_at", null)
    .maybeSingle();
  if (existing.error && existing.error.code !== NO_ROW_CODE) throw existing.error;
  if (!existing.data) return null;
  const removedAt = nowIso();
  const existingRow = castRow<RawRow>(existing.data);
  const blockId = asString(existingRow.id);
  if (!blockId) throw new Error("Block row missing id");
  const { data, error } = await supabase
    .from("user_blocks")
    .update({ deleted_at: removedAt })
    .eq("id", blockId)
    .select(BLOCK_SELECT)
    .single();
  if (error) throw error;

  const blockSummary = mapBlockRow(castRow<RawRow>(data));

  await publishFriendEvents([
    {
      userId: blockerId,
      event: {
        type: "block.updated",
        payload: { state: "unblock", block: blockSummary, userId: blockedId },
      },
    },
    {
      userId: blockedId,
      event: { type: "block.updated", payload: { state: "unblock", userId: blockerId } },
    },
  ]);

  return blockSummary;
}
