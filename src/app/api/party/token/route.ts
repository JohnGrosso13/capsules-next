import { ensureUserFromRequest } from "@/lib/auth/payload";
import { fetchPartyMetadata, issuePartyToken } from "@/server/livekit/party";
import { parseJsonBody, returnError, validatedJson } from "@/server/validation/http";
import {
  partyTokenRequestSchema,
  partyTokenResponseSchema,
} from "@/server/validation/schemas/party";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const parsed = await parseJsonBody(req, partyTokenRequestSchema);
  if (!parsed.success) {
    return parsed.response;
  }

  const userId = await ensureUserFromRequest(req, null, { allowGuests: false });
  if (!userId) {
    return returnError(401, "auth_required", "You must be signed in to join a party.");
  }

  const partyId = parsed.data.partyId.trim().toLowerCase();
  try {
    const metadata = await fetchPartyMetadata(partyId);
    if (!metadata) {
      return returnError(404, "party_not_found", "This party is no longer active.");
    }

    const displayName = parsed.data.displayName?.trim() || null;
    const isOwner = metadata.ownerId === userId;

    const issued = await issuePartyToken({
      identity: userId,
      partyId: metadata.partyId,
      displayName,
      metadata,
      isOwner,
    });

    return validatedJson(partyTokenResponseSchema, {
      success: true,
      partyId: metadata.partyId,
      livekitUrl: issued.livekitUrl,
      token: issued.token,
      expiresAt: issued.expiresAt,
      isOwner,
      metadata,
    });
  } catch (error) {
    console.error("Party token error", error);
    if (error instanceof Error && error.message.includes("LiveKit is not fully configured")) {
      return returnError(500, "livekit_not_configured", error.message);
    }
    return returnError(500, "party_join_failed", "Unable to join this party right now.");
  }
}
