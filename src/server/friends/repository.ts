import { getDatabaseAdminClient } from "@/config/database";
import type { DatabaseError, DatabaseResult } from "@/ports/database";

import {
  BLOCK_SELECT,
  FOLLOW_EDGE_SELECT,
  FRIEND_REQUEST_SELECT,
  FRIENDSHIP_SELECT,
  NO_ROW_CODE,
} from "./constants";
import type { FriendRequestStatus, RawRow } from "./types";

function wrapError(context: string, error: DatabaseError): Error {
  const message = context ? `${context}: ${error.message}` : error.message;
  const wrapped = new Error(message);
  const extended = wrapped as Error & Record<string, unknown>;
  if (error.code) extended.code = error.code;
  if (error.details) extended.details = error.details;
  if (error.hint) extended.hint = error.hint;
  return wrapped;
}

function assertSuccess<T>(result: DatabaseResult<T>, context: string): T {
  if (result.error) {
    throw wrapError(context, result.error);
  }
  if (result.data === null || result.data === undefined) {
    throw new Error(`${context}: missing result data`);
  }
  return result.data;
}

function resultOrNull<T>(result: DatabaseResult<T | null>, context: string): T | null {
  if (result.error) {
    if (result.error.code === NO_ROW_CODE) return null;
    throw wrapError(context, result.error);
  }
  return result.data ?? null;
}

function ensureSuccess(result: DatabaseResult<unknown>, context: string): void {
  if (result.error) {
    throw wrapError(context, result.error);
  }
}

export async function listFriendUserIds(userId: string): Promise<string[]> {
  const db = getDatabaseAdminClient();
  const result = await db
    .from("friendships")
    .select<{ friend_user_id: string | null; users: { user_key?: string | null } | null }>(
      "friend_user_id, users:friend_user_id(user_key)",
    )
    .eq("user_id", userId)
    .is("deleted_at", null)
    .order("created_at", { ascending: true })
    .fetch();
  const rows = assertSuccess(result, "friends.listFriendUserIds");
  const unique = new Set<string>();
  rows.forEach((row) => {
    const id = typeof row.friend_user_id === "string" ? row.friend_user_id.trim() : "";
    if (id) unique.add(id);
    const key = row.users && typeof row.users.user_key === "string" ? row.users.user_key.trim() : "";
    if (key) unique.add(key);
  });
  return Array.from(unique);
}

export async function fetchSocialGraphRows(userId: string) {
  const db = getDatabaseAdminClient();
  const [friends, incoming, outgoing, followers, following, blocked] = await Promise.all([
    db
      .from("friendships")
      .select<RawRow>(FRIENDSHIP_SELECT)
      .eq("user_id", userId)
      .is("deleted_at", null)
      .order("created_at", { ascending: true })
      .fetch(),
    db
      .from("friend_requests")
      .select<RawRow>(FRIEND_REQUEST_SELECT)
      .eq("recipient_id", userId)
      .eq("status", "pending")
      .is("deleted_at", null)
      .order("created_at", { ascending: true })
      .fetch(),
    db
      .from("friend_requests")
      .select<RawRow>(FRIEND_REQUEST_SELECT)
      .eq("requester_id", userId)
      .eq("status", "pending")
      .is("deleted_at", null)
      .order("created_at", { ascending: true })
      .fetch(),
    db
      .from("user_follows")
      .select<RawRow>(FOLLOW_EDGE_SELECT)
      .eq("followee_user_id", userId)
      .is("deleted_at", null)
      .order("created_at", { ascending: true })
      .fetch(),
    db
      .from("user_follows")
      .select<RawRow>(FOLLOW_EDGE_SELECT)
      .eq("follower_user_id", userId)
      .is("deleted_at", null)
      .order("created_at", { ascending: true })
      .fetch(),
    db
      .from("user_blocks")
      .select<RawRow>(BLOCK_SELECT)
      .eq("blocker_user_id", userId)
      .is("deleted_at", null)
      .order("created_at", { ascending: true })
      .fetch(),
  ]);

  return {
    friends: assertSuccess<RawRow[]>(friends, "friends.fetch"),
    incoming: assertSuccess<RawRow[]>(incoming, "friends.incoming"),
    outgoing: assertSuccess<RawRow[]>(outgoing, "friends.outgoing"),
    followers: assertSuccess<RawRow[]>(followers, "friends.followers"),
    following: assertSuccess<RawRow[]>(following, "friends.following"),
    blocked: assertSuccess<RawRow[]>(blocked, "friends.blocked"),
  };
}

export async function findPendingRequest(
  requesterId: string,
  recipientId: string,
): Promise<RawRow | null> {
  const db = getDatabaseAdminClient();
  const result = await db
    .from("friend_requests")
    .select<RawRow>(FRIEND_REQUEST_SELECT)
    .eq("requester_id", requesterId)
    .eq("recipient_id", recipientId)
    .eq("status", "pending")
    .is("deleted_at", null)
    .limit(1)
    .maybeSingle();
  return resultOrNull<RawRow>(result, "friends.findPendingRequest");
}

export async function getRequestById(requestId: string): Promise<RawRow | null> {
  const db = getDatabaseAdminClient();
  const result = await db
    .from("friend_requests")
    .select<RawRow>(FRIEND_REQUEST_SELECT)
    .eq("id", requestId)
    .limit(1)
    .maybeSingle();
  return resultOrNull<RawRow>(result, "friends.getRequestById");
}

export async function updatePendingRequest(
  requestId: string,
  updates: Record<string, unknown>,
): Promise<RawRow> {
  const db = getDatabaseAdminClient();
  const result = await db
    .from("friend_requests")
    .update(updates)
    .eq("id", requestId)
    .eq("status", "pending")
    .is("deleted_at", null)
    .select<RawRow>(FRIEND_REQUEST_SELECT)
    .single();
  return assertSuccess(result, "friends.updatePendingRequest") as RawRow;
}

export async function findLatestRequestBetween(
  requesterId: string,
  recipientId: string,
): Promise<RawRow | null> {
  const db = getDatabaseAdminClient();
  const result = await db
    .from("friend_requests")
    .select<RawRow>(FRIEND_REQUEST_SELECT)
    .eq("requester_id", requesterId)
    .eq("recipient_id", recipientId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return resultOrNull<RawRow>(result, "friends.findLatestRequestBetween");
}

export async function findFriendshipRow(
  userId: string,
  friendId: string,
): Promise<RawRow | null> {
  const db = getDatabaseAdminClient();
  const result = await db
    .from("friendships")
    .select<RawRow>(FRIENDSHIP_SELECT)
    .eq("user_id", userId)
    .eq("friend_user_id", friendId)
    .is("deleted_at", null)
    .limit(1)
    .maybeSingle();
  return resultOrNull<RawRow>(result, "friends.findFriendshipRow");
}

export async function findBlockBetween(userA: string, userB: string): Promise<boolean> {
  const db = getDatabaseAdminClient();
  const [first, second] = await Promise.all([
    db
      .from("user_blocks")
      .select<RawRow>("id")
      .eq("blocker_user_id", userA)
      .eq("blocked_user_id", userB)
      .is("deleted_at", null)
      .limit(1)
      .maybeSingle(),
    db
      .from("user_blocks")
      .select<RawRow>("id")
      .eq("blocker_user_id", userB)
      .eq("blocked_user_id", userA)
      .is("deleted_at", null)
      .limit(1)
      .maybeSingle(),
  ]);

  if (resultOrNull<RawRow>(first, "friends.block.checkA")) return true;
  return Boolean(resultOrNull<RawRow>(second, "friends.block.checkB"));
}

export async function ensureFriendshipEdge(
  userId: string,
  friendId: string,
  requestId: string | null,
): Promise<RawRow> {
  const db = getDatabaseAdminClient();
  const existing = await db
    .from("friendships")
    .select<RawRow>("id,deleted_at")
    .eq("user_id", userId)
    .eq("friend_user_id", friendId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const existingRow = resultOrNull<RawRow>(existing, "friends.ensureFriendshipEdge.existing");
  if (existingRow) {
    const result = await db
      .from("friendships")
      .update({ deleted_at: null, request_id: requestId })
      .eq("id", existingRow.id as string)
      .fetch();
    ensureSuccess(result, "friends.ensureFriendshipEdge.update");
  } else {
    const result = await db
      .from("friendships")
      .insert([{ user_id: userId, friend_user_id: friendId, request_id: requestId }])
      .fetch();
    ensureSuccess(result, "friends.ensureFriendshipEdge.insert");
  }

  const refreshed = await db
    .from("friendships")
    .select<RawRow>(FRIENDSHIP_SELECT)
    .eq("user_id", userId)
    .eq("friend_user_id", friendId)
    .is("deleted_at", null)
    .single();

  return assertSuccess(refreshed, "friends.ensureFriendshipEdge.refresh") as RawRow;
}

export async function softDeleteFriendshipEdge(
  userId: string,
  friendId: string,
  removedAt: string,
): Promise<void> {
  const db = getDatabaseAdminClient();
  const result = await db
    .from("friendships")
    .update({ deleted_at: removedAt })
    .eq("user_id", userId)
    .eq("friend_user_id", friendId)
    .is("deleted_at", null)
    .fetch();
  ensureSuccess(result, "friends.softDeleteFriendshipEdge");
}

export async function softDeleteFollowEdge(
  followerId: string,
  followeeId: string,
  removedAt: string,
): Promise<void> {
  const db = getDatabaseAdminClient();
  const result = await db
    .from("user_follows")
    .update({ deleted_at: removedAt })
    .eq("follower_user_id", followerId)
    .eq("followee_user_id", followeeId)
    .is("deleted_at", null)
    .fetch();
  ensureSuccess(result, "friends.softDeleteFollowEdge");
}

export async function closePendingRequest(
  requesterId: string,
  recipientId: string,
  status: FriendRequestStatus,
  closedAt: string,
): Promise<void> {
  const db = getDatabaseAdminClient();
  const result = await db
    .from("friend_requests")
    .update({ status, responded_at: closedAt, deleted_at: closedAt })
    .eq("requester_id", requesterId)
    .eq("recipient_id", recipientId)
    .eq("status", "pending")
    .is("deleted_at", null)
    .fetch();
  ensureSuccess(result, "friends.closePendingRequest");
}

export async function insertFriendRequest(
  payload: Record<string, unknown>,
): Promise<RawRow> {
  const db = getDatabaseAdminClient();
  const result = await db
    .from("friend_requests")
    .insert([payload])
    .select<RawRow>(FRIEND_REQUEST_SELECT)
    .single();
  return assertSuccess(result, "friends.insertFriendRequest") as RawRow;
}

export async function updateFriendRequest(
  requestId: string,
  payload: Record<string, unknown>,
): Promise<RawRow> {
  const db = getDatabaseAdminClient();
  const result = await db
    .from("friend_requests")
    .update(payload)
    .eq("id", requestId)
    .select<RawRow>(FRIEND_REQUEST_SELECT)
    .single();
  return assertSuccess(result, "friends.updateFriendRequest") as RawRow;
}

export async function findLatestFollowEdge(
  followerId: string,
  followeeId: string,
): Promise<RawRow | null> {
  const db = getDatabaseAdminClient();
  const result = await db
    .from("user_follows")
    .select<RawRow>(FOLLOW_EDGE_SELECT)
    .eq("follower_user_id", followerId)
    .eq("followee_user_id", followeeId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return resultOrNull<RawRow>(result, "friends.findLatestFollowEdge");
}

export async function restoreFollowEdge(
  followerId: string,
  followeeId: string,
): Promise<RawRow | null> {
  const db = getDatabaseAdminClient();
  const existing = await db
    .from("user_follows")
    .select<RawRow>(FOLLOW_EDGE_SELECT)
    .eq("follower_user_id", followerId)
    .eq("followee_user_id", followeeId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const row = resultOrNull<RawRow>(existing, "friends.restoreFollowEdge.existing");
  if (!row) return null;

  const updated = await db
    .from("user_follows")
    .update({ deleted_at: null })
    .eq("id", row.id as string)
    .select<RawRow>(FOLLOW_EDGE_SELECT)
    .single();

  return assertSuccess(updated, "friends.restoreFollowEdge.update") as RawRow;
}

export async function insertFollowEdge(
  followerId: string,
  followeeId: string,
): Promise<RawRow> {
  const db = getDatabaseAdminClient();
  const result = await db
    .from("user_follows")
    .insert([{ follower_user_id: followerId, followee_user_id: followeeId }])
    .select<RawRow>(FOLLOW_EDGE_SELECT)
    .single();
  return assertSuccess(result, "friends.insertFollowEdge") as RawRow;
}

export async function findLatestBlockEdge(
  blockerId: string,
  blockedId: string,
): Promise<RawRow | null> {
  const db = getDatabaseAdminClient();
  const result = await db
    .from("user_blocks")
    .select<RawRow>(BLOCK_SELECT)
    .eq("blocker_user_id", blockerId)
    .eq("blocked_user_id", blockedId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return resultOrNull<RawRow>(result, "friends.findLatestBlockEdge");
}

export async function insertBlockEdge(
  blockerId: string,
  blockedId: string,
  payload: Record<string, unknown>,
): Promise<RawRow> {
  const db = getDatabaseAdminClient();
  const result = await db
    .from("user_blocks")
    .insert([{ blocker_user_id: blockerId, blocked_user_id: blockedId, ...payload }])
    .select<RawRow>(BLOCK_SELECT)
    .single();
  return assertSuccess(result, "friends.insertBlockEdge") as RawRow;
}

export async function updateBlockEdge(
  blockId: string,
  payload: Record<string, unknown>,
): Promise<RawRow> {
  const db = getDatabaseAdminClient();
  const result = await db
    .from("user_blocks")
    .update(payload)
    .eq("id", blockId)
    .select<RawRow>(BLOCK_SELECT)
    .single();
  return assertSuccess(result, "friends.updateBlockEdge") as RawRow;
}

export async function findActiveBlock(
  blockerId: string,
  blockedId: string,
): Promise<RawRow | null> {
  const db = getDatabaseAdminClient();
  const result = await db
    .from("user_blocks")
    .select<RawRow>(BLOCK_SELECT)
    .eq("blocker_user_id", blockerId)
    .eq("blocked_user_id", blockedId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return resultOrNull<RawRow>(result, "friends.findActiveBlock");
}

export async function removeBlock(blockId: string, removedAt: string): Promise<RawRow> {
  const db = getDatabaseAdminClient();
  const result = await db
    .from("user_blocks")
    .update({ deleted_at: removedAt })
    .eq("id", blockId)
    .select<RawRow>(BLOCK_SELECT)
    .single();
  return assertSuccess(result, "friends.removeBlock") as RawRow;
}

