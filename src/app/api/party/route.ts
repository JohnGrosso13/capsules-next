import { ensureUserFromRequest } from "@/lib/auth/payload";
import {
  buildPartyMetadata,
  createPartyId,
  ensurePartyRoom,
  issuePartyToken,
} from "@/server/livekit/party";
import { parseJsonBody, returnError, validatedJson } from "@/server/validation/http";
import {
  partyCreateRequestSchema,
  partyTokenResponseSchema,
} from "@/server/validation/schemas/party";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const parsed = await parseJsonBody(req, partyCreateRequestSchema);
  if (!parsed.success) {
    return parsed.response;
  }

  const ownerId = await ensureUserFromRequest(req, null, { allowGuests: false });
  if (!ownerId) {
    return returnError(401, "auth_required", "You must be signed in to start a party.");
  }

  const displayName = parsed.data.displayName?.trim() || null;
  const topic = parsed.data.topic?.trim() || null;

  try {
    const partyId = createPartyId();
    const metadata = buildPartyMetadata({
      partyId,
      ownerId,
      ownerDisplayName: displayName,
      topic,
    });

    await ensurePartyRoom(metadata);

    const issued = await issuePartyToken({
      identity: ownerId,
      partyId,
      displayName,
      metadata,
      isOwner: true,
    });

    return validatedJson(partyTokenResponseSchema, {
      success: true,
      partyId,
      livekitUrl: issued.livekitUrl,
      token: issued.token,
      expiresAt: issued.expiresAt,
      isOwner: true,
      metadata,
    });
  } catch (error) {
    console.error("Party creation error", error);
    if (error instanceof Error && error.message.includes("LiveKit is not fully configured")) {
      return returnError(500, "livekit_not_configured", error.message);
    }
    return returnError(500, "party_create_failed", "Unable to start a party. Please try again.");
  }
}
