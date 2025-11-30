import { z } from "zod";

import { ensureUserFromRequest } from "@/lib/auth/payload";
import { returnError, validatedJson } from "@/server/validation/http";
import { recordChipEvent } from "@/server/prompter/chips";

const bodySchema = z.object({
  chipId: z.string().min(1),
  label: z.string().nullable().optional(),
  surface: z.string().nullable().optional(),
  source: z.string().nullable().optional(),
});

export async function POST(req: Request) {
  const viewerId = await ensureUserFromRequest(req, {}, { allowGuests: false });
  if (!viewerId) {
    return returnError(401, "auth_required", "Sign in to log chip usage.");
  }

  try {
    const body = await req.json();
    const parsed = bodySchema.safeParse(body);
    if (!parsed.success) {
      return returnError(400, "invalid_body", "Invalid chip payload.");
    }
    const payload = parsed.data;
    await recordChipEvent({
      userId: viewerId,
      chipId: payload.chipId,
      label: payload.label ?? null,
      surface: payload.surface ?? payload.source ?? "home",
    });
    return validatedJson(z.object({ ok: z.boolean() }), { ok: true });
  } catch (error) {
    console.error("prompter.chips.log error", error);
    return returnError(500, "chip_log_error", "Failed to log chip usage.");
  }
}

export const runtime = "nodejs";
