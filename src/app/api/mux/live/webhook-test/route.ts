import { NextResponse } from "next/server";
import { z } from "zod";

import { ensureUserFromRequest } from "@/lib/auth/payload";
import { CapsuleMembershipError, requireCapsuleOwnership } from "@/server/capsules/service";
import { triggerWebhookTestDelivery } from "@/server/mux/service";
import { returnError } from "@/server/validation/http";

const requestSchema = z.object({
  capsuleId: z.string().uuid("capsuleId must be a valid UUID"),
  endpointId: z.string().min(1, "endpointId is required"),
});

export async function POST(req: Request) {
  const ownerId = await ensureUserFromRequest(req, {}, { allowGuests: false });
  if (!ownerId) {
    return returnError(401, "auth_required", "Sign in to manage streaming.");
  }

  let parsedBody;
  try {
    parsedBody = requestSchema.parse(await req.json());
  } catch (error) {
    if (error instanceof z.ZodError) {
      const message = error.issues[0]?.message ?? "Invalid request payload";
      return returnError(400, "invalid_request", message);
    }
    throw error;
  }

  try {
    await requireCapsuleOwnership(parsedBody.capsuleId, ownerId);
  } catch (error) {
    if (error instanceof CapsuleMembershipError) {
      return returnError(error.status, error.code, error.message);
    }
    throw error;
  }

  try {
    const result = await triggerWebhookTestDelivery({
      capsuleId: parsedBody.capsuleId,
      ownerUserId: ownerId,
      endpointId: parsedBody.endpointId,
    });
    return NextResponse.json(result, { status: 200, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to deliver the webhook test event.";
    return returnError(502, "webhook_delivery_failed", message);
  }
}
