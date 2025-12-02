import { z } from "zod";

import { ensureUserFromRequest } from "@/lib/auth/payload";
import { fetchPartyMetadata, isUserInParty, updatePartyMetadata } from "@/server/livekit/party";
import { parseJsonBody, returnError, validatedJson } from "@/server/validation/http";
import { partyMetadataSchema } from "@/server/validation/schemas/party";

const hostHandoffSchema = z.object({
  hostId: z.string().trim().min(1, "Host id is required"),
});

export const runtime = "nodejs";

export async function POST(
  req: Request,
  context: { params: Promise<{ partyId: string }> },
) {
  const { partyId } = await context.params;
  const normalizedPartyId = partyId?.trim().toLowerCase();
  if (!normalizedPartyId) {
    return returnError(400, "invalid_party_id", "A valid party id is required.");
  }

  const parsedBody = await parseJsonBody(req, hostHandoffSchema);
  if (!parsedBody.success) {
    return parsedBody.response;
  }
  const targetHostId = parsedBody.data.hostId.trim();

  const userId = await ensureUserFromRequest(req, null, { allowGuests: false });
  if (!userId) {
    return returnError(401, "auth_required", "Sign in to hand off hosting.");
  }

  const metadata = await fetchPartyMetadata(normalizedPartyId);
  if (!metadata) {
    return returnError(404, "party_not_found", "This party is no longer active.");
  }

  const currentHostId = metadata.hostId ?? metadata.ownerId;
  const isOwner = metadata.ownerId === userId;
  const isHost = currentHostId === userId;
  if (!isOwner && !isHost) {
    return returnError(403, "host_handoff_forbidden", "Only the host can hand off hosting.");
  }

  if (targetHostId === currentHostId) {
    return validatedJson(partyMetadataSchema, metadata);
  }

  const participant = await isUserInParty(normalizedPartyId, targetHostId).catch(() => false);
  if (!participant) {
    return returnError(409, "host_not_in_party", "That user is not currently in the party.");
  }

  const updated = await updatePartyMetadata(normalizedPartyId, { hostId: targetHostId });
  if (!updated) {
    return returnError(500, "host_update_failed", "Unable to update the host right now.");
  }

  return validatedJson(partyMetadataSchema, updated);
}
