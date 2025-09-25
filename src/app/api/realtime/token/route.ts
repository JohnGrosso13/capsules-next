import { ensureUserFromRequest } from "@/lib/auth/payload";
import { serverEnv } from "@/lib/env/server";
import { createRealtimeToken } from "@/lib/realtime/ably-server";
import { parseJsonBody, returnError, validatedJson } from "@/server/validation/http";
import { requestUserEnvelopeSchema } from "@/server/validation/schemas/auth";
import { realtimeTokenResponseSchema } from "@/server/validation/schemas/realtime";

export async function POST(req: Request) {
  const parsed = await parseJsonBody(req, requestUserEnvelopeSchema);
  if (!parsed.success) {
    return parsed.response;
  }

  const userPayload = parsed.data.user ?? {};
  const ownerId = await ensureUserFromRequest(req, userPayload);
  if (!ownerId) {
    return returnError(401, "auth_required", "Authentication required");
  }

  try {
    const tokenRequest = await createRealtimeToken(ownerId);
    if (!tokenRequest) {
      return returnError(503, "realtime_disabled", "Realtime not configured");
    }

    return validatedJson(realtimeTokenResponseSchema, {
      tokenRequest: tokenRequest as unknown as Record<string, unknown>,
      environment: serverEnv.ABLY_ENVIRONMENT ?? null,
    });
  } catch (error) {
    console.error("Realtime token error", error);
    return returnError(500, "realtime_token_failed", "Failed to create realtime token");
  }
}

