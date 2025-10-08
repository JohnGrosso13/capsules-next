import { publishFriendEvents } from "@/services/realtime/friends";
import type { FriendRealtimeEvent } from "@/services/realtime/friends";

import {
  FriendGraphError,

  type FriendSummary,
  type FriendRequestSummary,
  type FollowSummary,
  type BlockSummary,
  type SocialGraphSnapshot,
  type RawRow,
} from "./types";

import {
  closePendingRequest,
  ensureFriendshipEdge,
  fetchSocialGraphRows,
  findActiveBlock,
  findBlockBetween,
  findFriendshipRow,
  findLatestBlockEdge,
  findLatestFollowEdge,
  findLatestRequestBetween,
  findPendingRequest,
  getRequestById,
  insertBlockEdge,
  insertFollowEdge,
  insertFriendRequest,
  removeBlock,
  restoreFollowEdge,
  softDeleteFollowEdge,
  softDeleteFriendshipEdge,
  updateBlockEdge,
  updateFriendRequest,
  updatePendingRequest,
} from "./repository";

import { asString, mapBlockRow, mapFollowRow, mapFriendRow, mapRequestRow } from "./mappers";

function nowIso(): string {
  return new Date().toISOString();
}

function requireRowId(row: RawRow, key: string, context: string): string {
  const value = asString(row[key]);
  if (!value) {
    throw new Error(`${context}: row is missing ${key}`);
  }
  return value;
}

function assertPending(row: RawRow, context: string): void {
  const status = asString(row.status);
  if (status !== "pending" || row.deleted_at) {
    throw new FriendGraphError("invalid_action", `${context}: request is not pending.`);
  }
}

export async function listSocialGraph(userId: string): Promise<SocialGraphSnapshot> {
  const { friends, incoming, outgoing, followers, following, blocked } = await fetchSocialGraphRows(userId);

  return {
    friends: friends.map((row) => mapFriendRow(row)),
    incomingRequests: incoming.map((row) => mapRequestRow(row, "incoming")),
    outgoingRequests: outgoing.map((row) => mapRequestRow(row, "outgoing")),
    followers: followers.map((row) => mapFollowRow(row, "follower")),
    following: following.map((row) => mapFollowRow(row, "following")),
    blocked: blocked.map((row) => mapBlockRow(row)),
  };
}

export async function sendFriendRequest(
  requesterId: string,
  recipientId: string,
  options: { message?: string | null } = {},
): Promise<FriendRequestSummary> {
  if (requesterId === recipientId) {
    throw new FriendGraphError("self_target", "You cannot add yourself.");
  }
  if (await findBlockBetween(requesterId, recipientId)) {
    throw new FriendGraphError("blocked", "One of the users has blocked the other.");
  }

  const existingFriendship = await findFriendshipRow(requesterId, recipientId);
  if (existingFriendship) {
    throw new FriendGraphError("already_friends", "You are already friends.", {
      friend: mapFriendRow(existingFriendship),
    });
  }

  const inboundPending = await findPendingRequest(recipientId, requesterId);
  if (inboundPending) {
    throw new FriendGraphError("incoming_request_pending", "Accept the existing request instead.", {
      request: mapRequestRow(inboundPending, "incoming"),
    });
  }

  const outboundPending = await findPendingRequest(requesterId, recipientId);
  if (outboundPending) {
    throw new FriendGraphError("already_pending", "Request already pending.", {
      request: mapRequestRow(outboundPending, "outgoing"),
    });
  }

  const latest = await findLatestRequestBetween(requesterId, recipientId);
  let requestRow: RawRow;

  if (latest && asString(latest.status) !== "pending") {
    const latestId = requireRowId(latest, "id", "sendFriendRequest");
    requestRow = await updateFriendRequest(latestId, {
      status: "pending",
      message: options.message ?? null,
      responded_at: null,
      accepted_at: null,
      deleted_at: null,
    });
  } else {
    requestRow = await insertFriendRequest({
      requester_id: requesterId,
      recipient_id: recipientId,
      status: "pending",
      message: options.message ?? null,
    });
  }

  const outgoing = mapRequestRow(requestRow, "outgoing");
  const incoming = mapRequestRow(requestRow, "incoming");

  await publishFriendEvents([
    {
      userId: requesterId,
      event: {
        type: "friend.request.created",
        payload: { request: outgoing, direction: "outgoing" },
      },
    },
    {
      userId: recipientId,
      event: {
        type: "friend.request.created",
        payload: { request: incoming, direction: "incoming" },
      },
    },
  ]);

  return outgoing;
}

export async function acceptFriendRequest(
  requestId: string,
  actorUserId: string,
): Promise<{ request: FriendRequestSummary; friends: FriendSummary[] }> {
  const requestRow = await getRequestById(requestId);
  if (!requestRow) {
    throw new FriendGraphError("not_found", "Friend request not found.");
  }

  const requesterId = asString(requestRow.requester_id);
  const recipientId = asString(requestRow.recipient_id);
  if (!requesterId || !recipientId) {
    throw new FriendGraphError("conflict", "Friend request is malformed.");
  }
  if (recipientId !== actorUserId) {
    throw new FriendGraphError("unauthorized", "Only the recipient can accept the request.");
  }

  assertPending(requestRow, "acceptFriendRequest");

  const acceptedAt = nowIso();
  const updatedRow = await updatePendingRequest(requestId, {
    status: "accepted",
    responded_at: acceptedAt,
    accepted_at: acceptedAt,
  });

  await ensureFriendshipEdge(requesterId, recipientId, requestId);
  await ensureFriendshipEdge(recipientId, requesterId, requestId);
  await closePendingRequest(recipientId, requesterId, "cancelled", acceptedAt);

  const [requesterFriendRow, recipientFriendRow] = await Promise.all([
    findFriendshipRow(requesterId, recipientId),
    findFriendshipRow(recipientId, requesterId),
  ]);

  const incoming = mapRequestRow(updatedRow, "incoming");
  const outgoing = mapRequestRow(updatedRow, "outgoing");

  const events: Array<{ userId: string; event: FriendRealtimeEvent }> = [
    { userId: requesterId, event: { type: "friend.request.updated", payload: { request: outgoing } } },
    { userId: recipientId, event: { type: "friend.request.updated", payload: { request: incoming } } },
  ];

  const createdFriends: FriendSummary[] = [];
  if (requesterFriendRow) {
    const summary = mapFriendRow(requesterFriendRow);
    createdFriends.push(summary);
    events.push({
      userId: requesterId,
      event: { type: "friendship.created", payload: { friend: summary } },
    });
  }
  if (recipientFriendRow) {
    const summary = mapFriendRow(recipientFriendRow);
    createdFriends.push(summary);
    events.push({
      userId: recipientId,
      event: { type: "friendship.created", payload: { friend: summary } },
    });
  }

  await publishFriendEvents(events);

  return {
    request: incoming,
    friends: createdFriends,
  };
}

export async function declineFriendRequest(
  requestId: string,
  actorUserId: string,
): Promise<FriendRequestSummary> {
  const requestRow = await getRequestById(requestId);
  if (!requestRow) {
    throw new FriendGraphError("not_found", "Friend request not found.");
  }

  const requesterId = asString(requestRow.requester_id);
  const recipientId = asString(requestRow.recipient_id);
  if (!requesterId || !recipientId) {
    throw new FriendGraphError("conflict", "Friend request is malformed.");
  }
  if (recipientId !== actorUserId) {
    throw new FriendGraphError("unauthorized", "Only the recipient can decline the request.");
  }

  assertPending(requestRow, "declineFriendRequest");

  const declinedAt = nowIso();
  const updatedRow = await updatePendingRequest(requestId, {
    status: "declined",
    responded_at: declinedAt,
    deleted_at: declinedAt,
  });

  const incoming = mapRequestRow(updatedRow, "incoming");
  const outgoing = mapRequestRow(updatedRow, "outgoing");

  await publishFriendEvents([
    {
      userId: requesterId,
      event: {
        type: "friend.request.removed",
        payload: { requestId, reason: "declined", request: outgoing },
      },
    },
    {
      userId: recipientId,
      event: {
        type: "friend.request.removed",
        payload: { requestId, reason: "declined", request: incoming },
      },
    },
  ]);

  return incoming;
}

export async function cancelFriendRequest(
  requestId: string,
  actorUserId: string,
): Promise<FriendRequestSummary> {
  const requestRow = await getRequestById(requestId);
  if (!requestRow) {
    throw new FriendGraphError("not_found", "Friend request not found.");
  }

  const requesterId = asString(requestRow.requester_id);
  const recipientId = asString(requestRow.recipient_id);
  if (!requesterId || !recipientId) {
    throw new FriendGraphError("conflict", "Friend request is malformed.");
  }
  if (requesterId !== actorUserId) {
    throw new FriendGraphError("unauthorized", "Only the requester can cancel the request.");
  }

  assertPending(requestRow, "cancelFriendRequest");

  const cancelledAt = nowIso();
  const updatedRow = await updatePendingRequest(requestId, {
    status: "cancelled",
    responded_at: cancelledAt,
    deleted_at: cancelledAt,
  });

  const outgoing = mapRequestRow(updatedRow, "outgoing");
  const incoming = mapRequestRow(updatedRow, "incoming");

  await publishFriendEvents([
    {
      userId: requesterId,
      event: {
        type: "friend.request.removed",
        payload: { requestId, reason: "cancelled", request: outgoing },
      },
    },
    {
      userId: recipientId,
      event: {
        type: "friend.request.removed",
        payload: { requestId, reason: "cancelled", request: incoming },
      },
    },
  ]);

  return outgoing;
}

export async function removeFriendship(
  userId: string,
  friendUserId: string,
): Promise<FriendSummary> {
  const existing = await findFriendshipRow(userId, friendUserId);
  if (!existing) {
    throw new FriendGraphError("not_found", "Friendship not found.");
  }

  const removedAt = nowIso();
  await softDeleteFriendshipEdge(userId, friendUserId, removedAt);
  await softDeleteFriendshipEdge(friendUserId, userId, removedAt);

  await publishFriendEvents([
    { userId, event: { type: "friendship.removed", payload: { friendUserId } } },
    { userId: friendUserId, event: { type: "friendship.removed", payload: { friendUserId: userId } } },
  ]);

  return mapFriendRow(existing);
}

export async function followUser(followerId: string, followeeId: string): Promise<FollowSummary> {
  if (followerId === followeeId) {
    throw new FriendGraphError("self_target", "You cannot follow yourself.");
  }
  if (await findBlockBetween(followerId, followeeId)) {
    throw new FriendGraphError("blocked", "One of the users has blocked the other.");
  }

  const latest = await findLatestFollowEdge(followerId, followeeId);
  let followRow: RawRow | null = null;

  if (latest) {
    if (!latest.deleted_at) {
      followRow = latest;
    } else {
      followRow = await restoreFollowEdge(followerId, followeeId);
    }
  }

  if (!followRow) {
    followRow = await insertFollowEdge(followerId, followeeId);
  }

  if (!followRow) {
    throw new FriendGraphError("conflict", "Failed to establish follow relationship.");
  }

  const following = mapFollowRow(followRow, "following");
  const follower = mapFollowRow(followRow, "follower");

  await publishFriendEvents([
    {
      userId: followerId,
      event: {
        type: "follow.updated",
        payload: { state: "follow", follow: following, userId: followeeId },
      },
    },
    {
      userId: followeeId,
      event: {
        type: "follow.updated",
        payload: { state: "follow", follow: follower, userId: followerId },
      },
    },
  ]);

  return following;
}

export async function unfollowUser(followerId: string, followeeId: string): Promise<void> {
  const removedAt = nowIso();
  await softDeleteFollowEdge(followerId, followeeId, removedAt);

  await publishFriendEvents([
    { userId: followerId, event: { type: "follow.updated", payload: { state: "unfollow", userId: followeeId } } },
    { userId: followeeId, event: { type: "follow.updated", payload: { state: "unfollow", userId: followerId } } },
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

  const latest = await findLatestBlockEdge(blockerId, blockedId);
  let blockRow: RawRow;

  if (latest) {
    const blockId = requireRowId(latest, "id", "blockUser");
    blockRow = await updateBlockEdge(blockId, {
      deleted_at: null,
      reason: options.reason ?? asString(latest.reason),
      expires_at: options.expiresAt ?? null,
    });
  } else {
    blockRow = await insertBlockEdge(blockerId, blockedId, {
      reason: options.reason ?? null,
      expires_at: options.expiresAt ?? null,
    });
  }

  const blockSummary = mapBlockRow(blockRow);
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
  const activeBlock = await findActiveBlock(blockerId, blockedId);
  if (!activeBlock) return null;

  const blockId = requireRowId(activeBlock, "id", "unblockUser");
  const removedRow = await removeBlock(blockId, nowIso());
  const blockSummary = mapBlockRow(removedRow);

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
