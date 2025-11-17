import { z } from "zod";

import { ensureUserFromRequest } from "@/lib/auth/payload";
import { returnError, validatedJson } from "@/server/validation/http";
import { getComposerSettings, updateComposerSettings, composerSettingsSchema } from "@/server/composer/settings";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const ownerId = await ensureUserFromRequest(req, {}, { allowGuests: false });
  if (!ownerId) {
    return returnError(401, "auth_required", "Authentication required");
  }

  try {
    const settings = await getComposerSettings(ownerId);
    return validatedJson(composerSettingsSchema, settings);
  } catch (error) {
    const message = error instanceof Error ? error.message : "composer settings fetch failed";
    return returnError(500, "composer_settings_fetch_failed", message);
  }
}

const requestSchema = z.object({
  quality: z.enum(["low", "standard", "high"]),
});

export async function POST(req: Request) {
  const ownerId = await ensureUserFromRequest(req, {}, { allowGuests: false });
  if (!ownerId) {
    return returnError(401, "auth_required", "Authentication required");
  }

  const parsed = await req.json().catch(() => null);
  const result = requestSchema.safeParse(parsed);
  if (!result.success) {
    return returnError(400, "invalid_request", "Invalid composer settings payload");
  }

  try {
    const settings = await updateComposerSettings(ownerId, result.data);
    return validatedJson(composerSettingsSchema, settings);
  } catch (error) {
    const message = error instanceof Error ? error.message : "composer settings update failed";
    return returnError(500, "composer_settings_update_failed", message);
  }
}
