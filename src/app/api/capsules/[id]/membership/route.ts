import { z } from "zod";

import { ensureUserFromRequest } from "@/lib/auth/payload";
import {
  CapsuleMembershipError,
  approveCapsuleMemberRequest,
  acceptCapsuleInvite,
  declineCapsuleInvite,
  declineCapsuleMemberRequest,
  followCapsule,
  getCapsuleMembership,
  inviteCapsuleMember,
  leaveCapsule,
  removeCapsuleMember,
  requestCapsuleMembership,
  setCapsuleMemberRole,
  setCapsuleMembershipPolicy,
  unfollowCapsule,
} from "@/server/capsules/service";
import { parseJsonBody, returnError, validatedJson } from "@/server/validation/http";
import {
  capsuleMembershipActionSchema,
  capsuleMembershipResponseSchema,
} from "@/server/validation/schemas/capsules";
import { deriveRequestOrigin } from "@/lib/url";

const paramsSchema = z.object({
  id: z.string().uuid("capsule id must be a valid UUID"),
});

export const runtime = "nodejs";

type CapsuleMembershipRouteContext = {
  params: { id: string } | Promise<{ id: string }>;
};

async function resolveMembershipParams(
  context: CapsuleMembershipRouteContext,
): Promise<{ id: string }> {
  const value = context.params;
  if (value instanceof Promise) {
    return value;
  }
  return value;
}

export async function GET(req: Request, context: CapsuleMembershipRouteContext) {
  const params = await resolveMembershipParams(context);
  const parsedParams = paramsSchema.safeParse(params);
  if (!parsedParams.success) {
    return returnError(400, "invalid_request", "Invalid capsule id.", parsedParams.error.flatten());
  }

  const viewerId = await ensureUserFromRequest(req, {}, { allowGuests: true });
  const requestOrigin = deriveRequestOrigin(req);

  try {
    const membership = await getCapsuleMembership(parsedParams.data.id, viewerId, {
      origin: requestOrigin ?? null,
    });
    return validatedJson(capsuleMembershipResponseSchema, { membership });
  } catch (error) {
    if (error instanceof CapsuleMembershipError) {
      return returnError(error.status, error.code, error.message);
    }
    console.error("capsules.membership.get error", error);
    return returnError(500, "capsules_membership_error", "Failed to load capsule membership.");
  }
}

export async function POST(req: Request, context: CapsuleMembershipRouteContext) {
  const params = await resolveMembershipParams(context);
  const parsedParams = paramsSchema.safeParse(params);
  if (!parsedParams.success) {
    return returnError(400, "invalid_request", "Invalid capsule id.", parsedParams.error.flatten());
  }

  const actorId = await ensureUserFromRequest(req, {}, { allowGuests: false });
  if (!actorId) {
    return returnError(401, "auth_required", "Sign in to manage capsule membership.");
  }

  const parsedBody = await parseJsonBody(req, capsuleMembershipActionSchema);
  if (!parsedBody.success) {
    return parsedBody.response;
  }

  const { action, message, requestId, memberId, role } = parsedBody.data;
  const membershipPolicy = parsedBody.data.membershipPolicy;
  const targetUserId = parsedBody.data.targetUserId;
  const requestOrigin = deriveRequestOrigin(req) ?? null;

  try {
    let membership;
    switch (action) {
      case "request_join": {
        const requestOptions = typeof message === "string" ? { message } : {};
        membership = await requestCapsuleMembership(actorId, parsedParams.data.id, requestOptions, {
          origin: requestOrigin,
        });
        break;
      }
      case "approve_request": {
        if (!requestId) {
          return returnError(400, "invalid_request", "requestId is required to approve a request.");
        }
        membership = await approveCapsuleMemberRequest(
          actorId,
          parsedParams.data.id,
          requestId,
          { origin: requestOrigin },
        );
        break;
      }
      case "decline_request": {
        if (!requestId) {
          return returnError(400, "invalid_request", "requestId is required to decline a request.");
        }
        membership = await declineCapsuleMemberRequest(
          actorId,
          parsedParams.data.id,
          requestId,
          { origin: requestOrigin },
        );
        break;
      }
      case "remove_member": {
        if (!memberId) {
          return returnError(400, "invalid_request", "memberId is required to remove a member.");
        }
        membership = await removeCapsuleMember(actorId, parsedParams.data.id, memberId, {
          origin: requestOrigin,
        });
        break;
      }
      case "set_role": {
        if (!memberId) {
          return returnError(400, "invalid_request", "memberId is required to set a role.");
        }
        if (!role) {
          return returnError(400, "invalid_request", "role is required to set a member role.");
        }
        membership = await setCapsuleMemberRole(
          actorId,
          parsedParams.data.id,
          memberId,
          role,
          { origin: requestOrigin },
        );
        break;
      }
      case "follow": {
        membership = await followCapsule(actorId, parsedParams.data.id, { origin: requestOrigin });
        break;
      }
      case "unfollow": {
        membership = await unfollowCapsule(actorId, parsedParams.data.id, {
          origin: requestOrigin,
        });
        break;
      }
      case "leave": {
        membership = await leaveCapsule(actorId, parsedParams.data.id, { origin: requestOrigin });
        break;
      }
      case "set_policy": {
        if (!membershipPolicy) {
          return returnError(
            400,
            "invalid_request",
            "membershipPolicy is required to set a policy.",
          );
        }
        membership = await setCapsuleMembershipPolicy(
          actorId,
          parsedParams.data.id,
          membershipPolicy,
          { origin: requestOrigin },
        );
        break;
      }
      case "invite_member": {
        if (!targetUserId) {
          return returnError(400, "invalid_request", "targetUserId is required to invite a user.");
        }
        membership = await inviteCapsuleMember(actorId, parsedParams.data.id, targetUserId, {
          origin: requestOrigin,
        });
        break;
      }
      case "accept_invite": {
        if (!requestId) {
          return returnError(400, "invalid_request", "requestId is required to accept an invite.");
        }
        membership = await acceptCapsuleInvite(actorId, requestId, { origin: requestOrigin });
        break;
      }
      case "decline_invite": {
        if (!requestId) {
          return returnError(400, "invalid_request", "requestId is required to decline an invite.");
        }
        membership = await declineCapsuleInvite(actorId, requestId, { origin: requestOrigin });
        break;
      }
      default:
        return returnError(400, "invalid_request", `Unsupported action: ${action}`);
    }

    return validatedJson(capsuleMembershipResponseSchema, { membership });
  } catch (error) {
    if (error instanceof CapsuleMembershipError) {
      return returnError(error.status, error.code, error.message);
    }
    console.error("capsules.membership.post error", error);
    return returnError(500, "capsules_membership_error", "Failed to update capsule membership.");
  }
}
