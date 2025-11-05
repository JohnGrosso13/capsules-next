import { ensureUserFromRequest } from "@/lib/auth/payload";
import { FriendGraphError } from "@/lib/supabase/friends";
import { parseJsonBody, returnError, validatedJson } from "@/server/validation/http";
import {
  friendUpdateRequestSchema,
  friendUpdateResponseSchema,
  type FriendUpdateRequest,
} from "@/server/validation/schemas/friends";
import {
  mapFriendList,
  performFriendMutation,
  friendMutationErrors,
} from "@/server/friends/mutations";

export const runtime = "nodejs";

const ERROR_STATUS = friendMutationErrors;

export async function POST(req: Request) {
  const parsed = await parseJsonBody(req, friendUpdateRequestSchema);
  if (!parsed.success) {
    return parsed.response;
  }

  const data: FriendUpdateRequest = parsed.data;

  const userPayload = data.user ?? {};
  const ownerId = await ensureUserFromRequest(req, userPayload, {
    allowGuests: process.env.NODE_ENV !== "production",
  });
  if (!ownerId) {
    return returnError(401, "auth_required", "Authentication required");
  }

  try {
    const outcome = await performFriendMutation(ownerId, data);
    return validatedJson(friendUpdateResponseSchema, {
      success: true,
      action: outcome.action,
      result: outcome.result ?? null,
      graph: outcome.graph,
      friends: mapFriendList(outcome.graph.friends),
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
