import { z } from "zod";

import { ensureUserFromRequest } from "@/lib/auth/payload";
import {
  CapsuleMembershipError,
  approveCapsuleMemberRequest,
  declineCapsuleMemberRequest,
  getCapsuleMembership,
  removeCapsuleMember,
  requestCapsuleMembership,
} from "@/server/capsules/service";
import { parseJsonBody, returnError, validatedJson } from "@/server/validation/http";
import {
  capsuleMembershipActionSchema,
  capsuleMembershipResponseSchema,
} from "@/server/validation/schemas/capsules";

const paramsSchema = z.object({
  id: z.string().uuid("capsule id must be a valid UUID"),
});

export const runtime = "nodejs";

export async function GET(
  req: Request,
  context: { params: { id: string } },
) {
  const parsedParams = paramsSchema.safeParse(context.params);
  if (!parsedParams.success) {
    return returnError(
      400,
      "invalid_request",
      "Invalid capsule id.",
      parsedParams.error.flatten(),
    );
  }

  const viewerId = await ensureUserFromRequest(req, {}, { allowGuests: true });

  try {
    const membership = await getCapsuleMembership(parsedParams.data.id, viewerId);
    return validatedJson(capsuleMembershipResponseSchema, { membership });
  } catch (error) {
    if (error instanceof CapsuleMembershipError) {
      return returnError(error.status, error.code, error.message);
    }
    console.error("capsules.membership.get error", error);
    return returnError(500, "capsules_membership_error", "Failed to load capsule membership.");
  }
}

export async function POST(
  req: Request,
  context: { params: { id: string } },
) {
  const parsedParams = paramsSchema.safeParse(context.params);
  if (!parsedParams.success) {
    return returnError(
      400,
      "invalid_request",
      "Invalid capsule id.",
      parsedParams.error.flatten(),
    );
  }

  const actorId = await ensureUserFromRequest(req, {}, { allowGuests: false });
  if (!actorId) {
    return returnError(401, "auth_required", "Sign in to manage capsule membership.");
  }

  const parsedBody = await parseJsonBody(req, capsuleMembershipActionSchema);
  if (!parsedBody.success) {
    return parsedBody.response;
  }

  const { action, message, requestId, memberId } = parsedBody.data;

  try {
    let membership;
    switch (action) {
      case "request_join": {
        const requestOptions = typeof message === "string" ? { message } : {};
        membership = await requestCapsuleMembership(actorId, parsedParams.data.id, requestOptions);
        break;
      }
      case "approve_request": {
        if (!requestId) {
          return returnError(400, "invalid_request", "requestId is required to approve a request.");
        }
        membership = await approveCapsuleMemberRequest(actorId, parsedParams.data.id, requestId);
        break;
      }
      case "decline_request": {
        if (!requestId) {
          return returnError(400, "invalid_request", "requestId is required to decline a request.");
        }
        membership = await declineCapsuleMemberRequest(actorId, parsedParams.data.id, requestId);
        break;
      }
      case "remove_member": {
        if (!memberId) {
          return returnError(400, "invalid_request", "memberId is required to remove a member.");
        }
        membership = await removeCapsuleMember(actorId, parsedParams.data.id, memberId);
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
