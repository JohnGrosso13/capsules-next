import { ensureUserFromRequest } from "@/lib/auth/payload";
import { deletePartyRoom, fetchPartyMetadata } from "@/server/livekit/party";
import { returnError } from "@/server/validation/http";

export const runtime = "nodejs";

export async function DELETE(
  req: Request,
  context: { params: Promise<{ partyId: string }> },
) {
  const { partyId } = await context.params;
  const partyIdParam = partyId?.trim().toLowerCase();
  if (!partyIdParam) {
    return returnError(400, "invalid_party_id", "A valid party id is required.");
  }

  const userId = await ensureUserFromRequest(req, null, { allowGuests: false });
  if (!userId) {
    return returnError(401, "auth_required", "You must be signed in to close a party.");
  }

  try {
    const metadata = await fetchPartyMetadata(partyIdParam);
    if (!metadata) {
      // Treat missing party as already closed for idempotency
      return new Response(JSON.stringify({ success: true, closed: true }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }

    if (metadata.ownerId !== userId) {
      return returnError(403, "not_party_owner", "Only the host can close this party.");
    }

    await deletePartyRoom(metadata.partyId);
    return new Response(JSON.stringify({ success: true, closed: true }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  } catch (error) {
    console.error("Party close error", error);
    if (
      error instanceof Error &&
      error.message.includes("LiveKit is not fully configured")
    ) {
      return returnError(500, "livekit_not_configured", error.message);
    }
    return returnError(500, "party_close_failed", "Unable to close this party right now.");
  }
}
