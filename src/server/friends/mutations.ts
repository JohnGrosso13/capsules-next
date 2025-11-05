import "server-only";

import {
  acceptFriendRequest,
  blockUser,
  cancelFriendRequest,
  declineFriendRequest,
  followUser,
  listSocialGraph,
  removeFriendship,
  sendFriendRequest,
  unfollowUser,
  unblockUser,
  type FriendSummary,
  type SocialGraphSnapshot,
} from "@/server/friends/service";
import { FriendGraphError } from "@/server/friends/types";
import { resolveSupabaseUserId, type UserIdentifierInput } from "@/lib/supabase/users";
import {
  friendTargetSchema,
  type FriendAction,
  type FriendUpdateRequest,
} from "@/server/validation/schemas/friends";

type MutationPayload = Record<string, unknown> | null | undefined;

type ActionResult = Record<string, unknown> | null;

export type FriendMutationOutcome = {
  action: FriendAction;
  result: ActionResult;
  graph: SocialGraphSnapshot;
};

const targetIdentifierSchema = friendTargetSchema.pick({
  userId: true,
  id: true,
  userKey: true,
  key: true,
  email: true,
  name: true,
  avatarUrl: true,
  avatar: true,
});

function normalizeAction(value: FriendAction): FriendAction {
  return value;
}

function buildTargetIdentifier(raw: MutationPayload): UserIdentifierInput {
  if (!raw) return {};
  const parsed = targetIdentifierSchema.safeParse(raw);
  if (!parsed.success) {
    return {};
  }
  const value = parsed.data;
  return {
    userId: value.userId ?? value.id,
    userKey: value.userKey ?? value.key,
    email: value.email,
    name: value.name,
    avatarUrl: value.avatarUrl ?? value.avatar,
  };
}

function mapFriendList(summaries: FriendSummary[]): Array<{
  id: string;
  userId: string | null;
  key: string | null;
  name: string;
  avatar: string | null;
  since: string | null;
  status: "online" | "offline";
}> {
  return summaries.map((friend) => ({
    id: friend.id,
    userId: friend.friendUserId,
    key: friend.user?.key ?? null,
    name: friend.user?.name ?? "Friend",
    avatar: friend.user?.avatarUrl ?? null,
    since: friend.since,
    status: "offline" as const,
  }));
}

async function requireTarget(
  ownerId: string,
  rawTarget: MutationPayload,
  allowAlias = false,
): Promise<{ userId: string }> {
  if (!rawTarget) {
    throw new FriendGraphError("not_found", "Target user required.");
  }
  const targetIdentifier = buildTargetIdentifier(rawTarget);
  const resolved = await resolveSupabaseUserId(targetIdentifier, { allowAlias });
  if (!resolved) {
    throw new FriendGraphError("not_found", "Target user not found.");
  }
  if (resolved.isAlias && !allowAlias) {
    throw new FriendGraphError("conflict", "This action requires a real account.");
  }
  if (resolved.userId === ownerId) {
    throw new FriendGraphError("self_target", "You cannot perform this action on yourself.");
  }
  return { userId: resolved.userId };
}

export async function performFriendMutation(
  ownerId: string,
  request: FriendUpdateRequest,
): Promise<FriendMutationOutcome> {
  const action = normalizeAction(request.action);
  const rawTarget: MutationPayload = request.target ?? request.friend ?? request.userTarget ?? null;
  const message = typeof request.message === "string" && request.message.trim() ? request.message : null;
  const reason = typeof request.reason === "string" && request.reason.trim() ? request.reason : null;
  const requestId =
    typeof request.requestId === "string" && request.requestId.trim().length
      ? request.requestId
      : null;

  let result: ActionResult = null;

  switch (action) {
    case "request": {
      const { userId: targetUserId } = await requireTarget(ownerId, rawTarget, false);
      const requestRow = await sendFriendRequest(ownerId, targetUserId, { message });
      result = { request: requestRow };
      break;
    }
    case "accept": {
      if (!requestId) {
        throw new FriendGraphError("invalid_action", "requestId is required to accept a request.");
      }
      const outcome = await acceptFriendRequest(requestId, ownerId);
      result = { request: outcome.request, friends: outcome.friends };
      break;
    }
    case "decline": {
      if (!requestId) {
        throw new FriendGraphError("invalid_action", "requestId is required to decline a request.");
      }
      const requestRow = await declineFriendRequest(requestId, ownerId);
      result = { request: requestRow };
      break;
    }
    case "cancel": {
      if (!requestId) {
        throw new FriendGraphError("invalid_action", "requestId is required to cancel a request.");
      }
      const requestRow = await cancelFriendRequest(requestId, ownerId);
      result = { request: requestRow };
      break;
    }
    case "remove": {
      const { userId: targetUserId } = await requireTarget(ownerId, rawTarget, true);
      const removed = await removeFriendship(ownerId, targetUserId);
      result = { removed };
      break;
    }
    case "follow": {
      const { userId: targetUserId } = await requireTarget(ownerId, rawTarget, false);
      const follow = await followUser(ownerId, targetUserId);
      result = { follow };
      break;
    }
    case "unfollow": {
      const { userId: targetUserId } = await requireTarget(ownerId, rawTarget, false);
      await unfollowUser(ownerId, targetUserId);
      result = { unfollowed: targetUserId };
      break;
    }
    case "block": {
      const { userId: targetUserId } = await requireTarget(ownerId, rawTarget, false);
      const block = await blockUser(ownerId, targetUserId, { reason, expiresAt: null });
      result = { block };
      break;
    }
    case "unblock": {
      const { userId: targetUserId } = await requireTarget(ownerId, rawTarget, false);
      const unblocked = await unblockUser(ownerId, targetUserId);
      result = { unblocked: targetUserId, previous: unblocked };
      break;
    }
    default:
      throw new FriendGraphError("invalid_action", `Unsupported action: ${action}`);
  }

  const graph = await listSocialGraph(ownerId);
  return { action, result, graph };
}

export const friendMutationErrors = {
  already_friends: 409,
  already_pending: 409,
  incoming_request_pending: 409,
  blocked: 403,
  not_found: 404,
  unauthorized: 403,
  invalid_action: 400,
  self_target: 400,
  conflict: 409,
} as const;

export type FriendMutationErrorCode = keyof typeof friendMutationErrors;

export { mapFriendList };
