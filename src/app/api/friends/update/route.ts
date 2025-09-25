import { ensureUserFromRequest } from "@/lib/auth/payload";
import {
  FriendGraphError,
  type FriendGraphErrorCode,
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
} from "@/lib/supabase/friends";
import { resolveSupabaseUserId, type UserIdentifierInput } from "@/lib/supabase/users";
import { parseJsonBody, returnError, validatedJson } from "@/server/validation/http";
import {
  friendTargetSchema,
  friendUpdateRequestSchema,
  friendUpdateResponseSchema,
  type FriendAction,
  type FriendUpdateRequest,
} from "@/server/validation/schemas/friends";

const ERROR_STATUS: Record<FriendGraphErrorCode, number> = {
  already_friends: 409,
  already_pending: 409,
  incoming_request_pending: 409,
  blocked: 403,
  not_found: 404,
  unauthorized: 403,
  invalid_action: 400,
  self_target: 400,
  conflict: 409,
};

type ActionResult = Record<string, unknown> | null;

type JsonRecord = Record<string, unknown>;

type TargetPayload = Record<string, unknown> | null;

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

function buildTargetIdentifier(raw: TargetPayload): UserIdentifierInput {
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

function normalizeAction(value: FriendAction): FriendAction {
  return value;
}

function formatFriendList(graph: Awaited<ReturnType<typeof listSocialGraph>>["friends"]) {
  return graph.map((friend) => ({
    id: friend.id,
    userId: friend.friendUserId,
    key: friend.user?.key ?? null,
    name: friend.user?.name ?? "Friend",
    avatar: friend.user?.avatarUrl ?? null,
    since: friend.since,
    online: false,
  }));
}

export async function POST(req: Request) {
  const parsed = await parseJsonBody(req, friendUpdateRequestSchema);
  if (!parsed.success) {
    return parsed.response;
  }

  const data: FriendUpdateRequest = parsed.data;
  const action = normalizeAction(data.action);

  const userPayload = data.user ?? {};
  const ownerId = await ensureUserFromRequest(req, userPayload);
  if (!ownerId) {
    return returnError(401, "auth_required", "Authentication required");
  }

  const rawTarget: TargetPayload = (data.target as JsonRecord | null | undefined)
    ?? (data.friend as JsonRecord | null | undefined)
    ?? (data.userTarget as JsonRecord | null | undefined)
    ?? null;

  const targetIdentifier: UserIdentifierInput = buildTargetIdentifier(rawTarget);

  const message = typeof data.message === "string" && data.message.trim() ? data.message : null;
  const reason = typeof data.reason === "string" && data.reason.trim() ? data.reason : null;
  const requestId = typeof data.requestId === "string" && data.requestId.trim() ? data.requestId : null;

  async function requireTarget(allowAlias = false) {
    if (!rawTarget) {
      throw new FriendGraphError("not_found", "Target user required.");
    }
    const resolved = await resolveSupabaseUserId(targetIdentifier, { allowAlias });
    if (!resolved) {
      throw new FriendGraphError("not_found", "Target user not found.");
    }
    if (resolved.isAlias && !allowAlias) {
      throw new FriendGraphError("conflict", "This action requires a real account.");
    }
    return resolved;
  }

  let result: ActionResult = null;

  try {
    switch (action) {
      case "request": {
        const { userId: targetUserId } = await requireTarget(false);
        const request = await sendFriendRequest(ownerId, targetUserId, { message });
        result = { request };
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
        const request = await declineFriendRequest(requestId, ownerId);
        result = { request };
        break;
      }
      case "cancel": {
        if (!requestId) {
          throw new FriendGraphError("invalid_action", "requestId is required to cancel a request.");
        }
        const request = await cancelFriendRequest(requestId, ownerId);
        result = { request };
        break;
      }
      case "remove": {
        const { userId: targetUserId } = await requireTarget(true);
        const removed = await removeFriendship(ownerId, targetUserId);
        result = { removed };
        break;
      }
      case "follow": {
        const { userId: targetUserId } = await requireTarget(false);
        const follow = await followUser(ownerId, targetUserId);
        result = { follow };
        break;
      }
      case "unfollow": {
        const { userId: targetUserId } = await requireTarget(false);
        await unfollowUser(ownerId, targetUserId);
        result = { unfollowed: targetUserId };
        break;
      }
      case "block": {
        const { userId: targetUserId } = await requireTarget(false);
        const block = await blockUser(ownerId, targetUserId, { reason, expiresAt: null });
        result = { block };
        break;
      }
      case "unblock": {
        const { userId: targetUserId } = await requireTarget(false);
        const block = await unblockUser(ownerId, targetUserId);
        result = { unblocked: targetUserId, previous: block };
        break;
      }
      default:
        throw new FriendGraphError("invalid_action", `Unsupported action: ${action}`);
    }

    const graph = await listSocialGraph(ownerId);
    return validatedJson(friendUpdateResponseSchema, {
      success: true,
      action,
      result: result ?? null,
      graph,
      friends: formatFriendList(graph.friends),
    });
  } catch (error) {
    if (error instanceof FriendGraphError) {
      const status = ERROR_STATUS[error.code] ?? 400;
      return returnError(status, error.code, error.message, error.data ?? null);
    }
    console.error("Friends update error", error);
    return returnError(500, "friends_update_failed", "Failed to update friends");
  }
}


