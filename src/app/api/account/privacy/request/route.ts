import { z } from "zod";

import { ensureUserFromRequest } from "@/lib/auth/payload";
import { parseJsonBody, returnError, validatedJson } from "@/server/validation/http";

const requestSchema = z.object({
  type: z.enum(["export", "delete"]),
  note: z
    .string()
    .max(800, "Keep notes under 800 characters.")
    .trim()
    .optional()
    .transform((value) => (value && value.length ? value : undefined)),
});

export const runtime = "nodejs";

export async function POST(req: Request) {
  const userId = await ensureUserFromRequest(req, {}, { allowGuests: false });
  if (!userId) {
    return returnError(401, "auth_required", "Sign in to request data actions.");
  }

  const parsed = await parseJsonBody(req, requestSchema);
  if (!parsed.success) {
    return parsed.response;
  }

  const { type, note } = parsed.data;

  try {
    console.info("privacy.request", {
      userId,
      type,
      note: note ?? null,
      requestedAt: new Date().toISOString(),
    });

    return validatedJson(
      requestSchema.extend({ ok: z.literal(true) }),
      { ok: true, type, note: note ?? undefined },
      { status: 200 },
    );
  } catch (error) {
    console.error("privacy.request.error", error);
    return returnError(500, "privacy_request_failed", "Unable to record that request.");
  }
}
