import { z } from "zod";

import { ensureUserFromRequest } from "@/lib/auth/payload";
import { returnError, validatedJson } from "@/server/validation/http";
import {
  ablyTokenRequestSchema,
  realtimeTokenResponseSchema,
} from "@/server/validation/schemas/realtime";
import { createCapsuleLiveChatAuth } from "@/services/realtime/live-chat";

const querySchema = z.object({
  capsuleId: z.string().uuid("capsuleId must be a valid UUID"),
});

export const runtime = "nodejs";

export async function GET(req: Request) {
  const userId = await ensureUserFromRequest(req, {}, { allowGuests: false });
  if (!userId) {
    return returnError(401, "auth_required", "Sign in to join live chat.");
  }

  const url = new URL(req.url);
  const parsed = querySchema.safeParse({ capsuleId: url.searchParams.get("capsuleId") });
  if (!parsed.success) {
    return returnError(
      400,
      "invalid_request",
      parsed.error.issues[0]?.message ?? "Invalid query parameters",
    );
  }

  const authPayload = await createCapsuleLiveChatAuth({
    capsuleId: parsed.data.capsuleId,
    userId,
  });
  if (!authPayload) {
    return returnError(503, "realtime_disabled", "Realtime chat is not configured.");
  }

  const token =
    authPayload.provider === "ably"
      ? ablyTokenRequestSchema.parse(authPayload.token)
      : authPayload.token;

  return validatedJson(realtimeTokenResponseSchema, {
    provider: authPayload.provider,
    token,
    environment: authPayload.environment ?? null,
  });
}
