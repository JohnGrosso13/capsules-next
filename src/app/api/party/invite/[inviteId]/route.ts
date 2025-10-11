import { ensureUserFromRequest } from "@/lib/auth/payload";
import {
  acceptPartyInvite,
  cancelPartyInvite,
  declinePartyInvite,
} from "@/server/party/invites/service";
import { PartyInviteError } from "@/server/party/invites/types";
import { parseJsonBody, returnError, validatedJson } from "@/server/validation/http";
import {
  partyInviteActionRequestSchema,
  partyInviteSendResponseSchema,
} from "@/server/validation/schemas/party";

export const runtime = "nodejs";

export async function POST(
  req: Request,
  context: { params: Promise<{ inviteId: string }> },
) {
  const { inviteId } = await context.params;
  const normalizedId = inviteId?.trim();
  if (!normalizedId) {
    return returnError(400, "invalid_invite_id", "A valid invite id is required.");
  }

  const parsed = await parseJsonBody(req, partyInviteActionRequestSchema);
  if (!parsed.success) {
    return parsed.response;
  }

  const userId = await ensureUserFromRequest(req, null, { allowGuests: false });
  if (!userId) {
    return returnError(401, "auth_required", "Sign in to manage party invitations.");
  }

  try {
    let invite;
    switch (parsed.data.action) {
      case "accept":
        invite = await acceptPartyInvite(userId, normalizedId);
        break;
      case "decline":
        invite = await declinePartyInvite(userId, normalizedId);
        break;
      case "cancel":
        invite = await cancelPartyInvite(userId, normalizedId);
        break;
      default:
        return returnError(400, "unsupported_action", "Unsupported invitation action.");
    }
    return validatedJson(partyInviteSendResponseSchema, {
      success: true,
      invite,
    });
  } catch (error) {
    if (error instanceof PartyInviteError) {
      return returnError(error.status, `party_invite_${error.code}`, error.message);
    }
    console.error("Party invite action error", error);
    return returnError(500, "party_invite_action_failed", "Unable to update that invitation.");
  }
}
