import { z } from "zod";

import { ensureUserFromRequest } from "@/lib/auth/payload";
import {
  fetchPartyMetadata,
  getPartyRoomName,
  updatePartyMetadata,
} from "@/server/livekit/party";
import {
  listLivekitRoomParticipants,
  removeLivekitParticipant,
} from "@/adapters/livekit/server";
import { parseJsonBody, returnError, validatedJson } from "@/server/validation/http";

const assistantToggleSchema = z.object({
  desired: z.boolean().optional(),
});

export const runtime = "nodejs";

async function requireParty(partyId: string) {
  const metadata = await fetchPartyMetadata(partyId);
  if (!metadata) {
    return { error: returnError(404, "party_not_found", "This party is no longer active.") };
  }
  return { metadata };
}

export async function POST(
  req: Request,
  context: { params: Promise<{ partyId: string }> },
) {
  const { partyId } = await context.params;
  const normalizedPartyId = partyId?.trim().toLowerCase();
  if (!normalizedPartyId) {
    return returnError(400, "invalid_party_id", "A valid party id is required.");
  }

  const parsedBody = await parseJsonBody(req, assistantToggleSchema);
  if (!parsedBody.success) {
    return parsedBody.response;
  }

  const userId = await ensureUserFromRequest(req, null, { allowGuests: false });
  if (!userId) {
    return returnError(401, "auth_required", "Sign in to manage the assistant.");
  }

  const { metadata, error } = await requireParty(normalizedPartyId);
  if (!metadata) {
    return error!;
  }

  if (metadata.ownerId !== userId) {
    return returnError(403, "assistant_forbidden", "Only the host can summon the assistant.");
  }

  const desired = parsedBody.data.desired ?? true;

  const updated = await updatePartyMetadata(normalizedPartyId, {
    assistant: {
      desired,
      lastRequestedAt: desired ? new Date().toISOString() : undefined,
      lastDismissedAt: desired ? undefined : new Date().toISOString(),
    },
  });

  if (!updated) {
    return returnError(500, "assistant_update_failed", "Unable to update assistant preferences.");
  }

  return validatedJson(z.object({ status: z.literal("ok"), assistant: z.any() }), {
    status: "ok",
    assistant: updated.assistant ?? { desired: desired, lastRequestedAt: null, lastDismissedAt: null },
  });
}

export async function DELETE(
  req: Request,
  context: { params: Promise<{ partyId: string }> },
) {
  const { partyId } = await context.params;
  const normalizedPartyId = partyId?.trim().toLowerCase();
  if (!normalizedPartyId) {
    return returnError(400, "invalid_party_id", "A valid party id is required.");
  }

  const userId = await ensureUserFromRequest(req, null, { allowGuests: false });
  if (!userId) {
    return returnError(401, "auth_required", "Sign in to manage the assistant.");
  }

  const { metadata, error } = await requireParty(normalizedPartyId);
  if (!metadata) {
    return error!;
  }

  if (metadata.ownerId !== userId) {
    return returnError(403, "assistant_forbidden", "Only the host can dismiss the assistant.");
  }

  const roomName = getPartyRoomName(normalizedPartyId);
  try {
    const participants = await listLivekitRoomParticipants(roomName);
    const agentIdentities = participants
      .map((p) => p.identity?.trim() ?? "")
      .filter((id) => id.startsWith("agent-"));

    await Promise.all(
      agentIdentities.map(async (identity) => {
        try {
          await removeLivekitParticipant(roomName, identity);
        } catch (err) {
          console.warn("Failed to remove assistant participant", { roomName, identity, err });
        }
      }),
    );
  } catch (err) {
    console.warn("Assistant removal failed", err);
  }

  const updated = await updatePartyMetadata(normalizedPartyId, {
    assistant: {
      desired: false,
      lastDismissedAt: new Date().toISOString(),
    },
  });

  if (!updated) {
    return returnError(500, "assistant_update_failed", "Unable to update assistant preferences.");
  }

  return validatedJson(z.object({ status: z.literal("ok"), assistant: z.any() }), {
    status: "ok",
    assistant: updated.assistant ?? { desired: false, lastRequestedAt: null, lastDismissedAt: new Date().toISOString() },
  });
}
