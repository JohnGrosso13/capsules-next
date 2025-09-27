import { ensureUserFromRequest } from "@/lib/auth/payload";
import type { IncomingUserPayload } from "@/lib/auth/payload";
import { serverEnv } from "@/lib/env/server";
import { createRealtimeToken } from "@/lib/realtime/ably-server";
import { parseJsonBody, returnError, validatedJson } from "@/server/validation/http";
import { requestUserEnvelopeSchema } from "@/server/validation/schemas/auth";
import {
  realtimeTokenResponseSchema,
  ablyTokenRequestSchema,
} from "@/server/validation/schemas/realtime";

async function handle(req: Request) {
  const parsed = await parseJsonBody(req, requestUserEnvelopeSchema);
  const data = parsed.success ? parsed.data : { user: {} };

  const userPayload: IncomingUserPayload = (data.user ?? {}) as IncomingUserPayload;
  const ownerId = await ensureUserFromRequest(req, userPayload, {
    allowGuests: process.env.NODE_ENV !== "production",
  });
  if (!ownerId) {
    return returnError(401, "auth_required", "Authentication required");
  }

  try {
    const tokenRequest = await createRealtimeToken(ownerId);
    if (!tokenRequest) {
      return returnError(503, "realtime_disabled", "Realtime not configured");
    }

    const parsedToken = ablyTokenRequestSchema.parse(tokenRequest);
    return validatedJson(realtimeTokenResponseSchema, {
      tokenRequest: parsedToken,
      environment: serverEnv.ABLY_ENVIRONMENT ?? null,
    });
  } catch (error) {
    console.error("Realtime token error", error);
    return returnError(500, "realtime_token_failed", "Failed to create realtime token");
  }
}

export async function POST(req: Request) {
  return handle(req);
}

export async function GET(req: Request) {
  return handle(req);
}
