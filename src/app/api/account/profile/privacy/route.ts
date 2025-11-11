import { z } from "zod";

import { ensureUserFromRequest } from "@/lib/auth/payload";
import {
  getProfilePrivacySettings,
  updateProfilePrivacySettings,
} from "@/server/profile/privacy";
import { parseJsonBody, returnError, validatedJson } from "@/server/validation/http";

const privacySchema = z.object({
  statsVisibility: z.union([z.literal("public"), z.literal("private")]),
});

export const runtime = "edge";

export async function GET(req: Request) {
  const ownerId = await ensureUserFromRequest(req, {}, { allowGuests: false });
  if (!ownerId) {
    return returnError(401, "auth_required", "Sign in to view privacy settings.");
  }

  try {
    const settings = await getProfilePrivacySettings(ownerId);
    return validatedJson(privacySchema, settings);
  } catch (error) {
    console.error("account.profile.privacy.fetch_failed", error);
    return returnError(500, "privacy_fetch_failed", "Failed to load privacy settings.");
  }
}

export async function PUT(req: Request) {
  const ownerId = await ensureUserFromRequest(req, {}, { allowGuests: false });
  if (!ownerId) {
    return returnError(401, "auth_required", "Sign in to update privacy settings.");
  }

  const parsed = await parseJsonBody(req, privacySchema);
  if (!parsed.success) {
    return parsed.response;
  }

  try {
    const next = await updateProfilePrivacySettings(ownerId, parsed.data);
    return validatedJson(privacySchema, next);
  } catch (error) {
    console.error("account.profile.privacy.update_failed", error);
    const message =
      error instanceof Error ? error.message : "Failed to update privacy settings.";
    return returnError(500, "privacy_update_failed", message);
  }
}
