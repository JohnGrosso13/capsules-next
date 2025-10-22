import { ensureUserFromRequest } from "@/lib/auth/payload";
import {
  sendPartyInvite,
  listIncomingPartyInvites,
  listSentPartyInvites,
} from "@/server/party/invites/service";
import { PartyInviteError } from "@/server/party/invites/types";
import { parseJsonBody, returnError, validatedJson } from "@/server/validation/http";
import {
  partyInviteListResponseSchema,
  partyInviteSendRequestSchema,
  partyInviteSendResponseSchema,
} from "@/server/validation/schemas/party";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const userId = await ensureUserFromRequest(req, null, { allowGuests: false });
  if (!userId) {
    return returnError(401, "auth_required", "Sign in to see your invitations.");
  }

  try {
    const [incoming, sent] = await Promise.all([
      listIncomingPartyInvites(userId),
      listSentPartyInvites(userId),
    ]);
    return validatedJson(partyInviteListResponseSchema, {
      success: true,
      incoming,
      sent,
    });
  } catch (error) {
    console.error("Party invite list error", error);
    return returnError(500, "party_invites_failed", "Unable to load party invitations.");
  }
}

export async function POST(req: Request) {
  const parsed = await parseJsonBody(req, partyInviteSendRequestSchema);
  if (!parsed.success) {
    return parsed.response;
  }

  const senderId = await ensureUserFromRequest(req, null, { allowGuests: false });
  if (!senderId) {
    return returnError(401, "auth_required", "You must be signed in to invite someone.");
  }

  try {
    const invite = await sendPartyInvite({
      senderId,
      recipientId: parsed.data.recipientId,
      partyId: parsed.data.partyId,
      message: parsed.data.message ?? null,
    });
    return validatedJson(partyInviteSendResponseSchema, {
      success: true,
      invite,
    });
  } catch (error) {
    if (error instanceof PartyInviteError) {
      return returnError(error.status, `party_invite_${error.code}`, error.message);
    }
    console.error("Party invite send error", error);
    return returnError(500, "party_invite_failed", "Unable to send that invitation.");
  }
}
