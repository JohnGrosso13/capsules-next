import { z } from "zod";

import { ensureUserFromRequest } from "@/lib/auth/payload";
import { getUserProfileSummary, updateUserDisplayName } from "@/server/users/service";
import { parseJsonBody, returnError, validatedJson } from "@/server/validation/http";

const responseSchema = z.object({
  id: z.string(),
  name: z.string().nullable(),
  avatarUrl: z.string().nullable(),
});

const updateRequestSchema = z.object({
  name: z.union([z.string().max(80), z.null()]).optional(),
});

const updateResponseSchema = z.object({
  success: z.literal(true),
  name: z.string().nullable(),
});

export async function GET(req: Request) {
  const ownerId = await ensureUserFromRequest(req, {}, { allowGuests: false });
  if (!ownerId) {
    return returnError(401, "auth_required", "Sign in to view your profile.");
  }

  try {
    const profile = await getUserProfileSummary(ownerId);
    return validatedJson(responseSchema, {
      id: profile.id ?? "",
      name: profile.name ?? null,
      avatarUrl: profile.avatarUrl ?? null,
    });
  } catch (error) {
    console.error("account.profile fetch error", error);
    return returnError(500, "profile_fetch_failed", "Failed to load your profile.");
  }
}

export const runtime = "nodejs";

export async function PATCH(req: Request) {
  const ownerId = await ensureUserFromRequest(req, {}, { allowGuests: false });
  if (!ownerId) {
    return returnError(401, "auth_required", "Sign in to change your profile.");
  }

  const parsed = await parseJsonBody(req, updateRequestSchema);
  if (!parsed.success) {
    return parsed.response;
  }

  const raw = parsed.data.name ?? null;
  const sanitized =
    typeof raw === "string" ? raw.replace(/\s+/g, " ").trim() : null;
  const nextName = sanitized && sanitized.length ? sanitized : null;

  try {
    const updated = await updateUserDisplayName(ownerId, nextName);
    return validatedJson(updateResponseSchema, {
      success: true,
      name: updated.name,
    });
  } catch (error) {
    console.error("account.profile update error", error);
    const message =
      error instanceof Error ? error.message : "Failed to update your display name.";
    return returnError(500, "profile_update_failed", message);
  }
}
