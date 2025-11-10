import { z } from "zod";

import { ensureUserFromRequest } from "@/lib/auth/payload";
import { getUserProfileSummary, updateUserProfile } from "@/server/users/service";
import { parseJsonBody, returnError, validatedJson } from "@/server/validation/http";
import { deriveRequestOrigin } from "@/lib/url";

const responseSchema = z.object({
  id: z.string(),
  key: z.string().nullable(),
  name: z.string().nullable(),
  avatarUrl: z.string().nullable(),
  bio: z.string().nullable(),
  joinedAt: z.string().nullable(),
});

const updateRequestSchema = z.object({
  name: z.union([z.string().max(80), z.null()]).optional(),
  bio: z.union([z.string().max(560), z.null()]).optional(),
});

const updateResponseSchema = z.object({
  success: z.literal(true),
  name: z.string().nullable(),
  bio: z.string().nullable(),
});

export async function GET(req: Request) {
  const ownerId = await ensureUserFromRequest(req, {}, { allowGuests: false });
  if (!ownerId) {
    return returnError(401, "auth_required", "Sign in to view your profile.");
  }

  try {
    const requestOrigin = deriveRequestOrigin(req);
    const profile = await getUserProfileSummary(ownerId, { origin: requestOrigin ?? null });
    return validatedJson(responseSchema, {
      id: profile.id ?? "",
      key: profile.key ?? null,
      name: profile.name ?? null,
      avatarUrl: profile.avatarUrl ?? null,
      bio: profile.bio ?? null,
      joinedAt: profile.joinedAt ?? null,
    });
  } catch (error) {
    console.error("account.profile fetch error", error);
    return returnError(500, "profile_fetch_failed", "Failed to load your profile.");
  }
}

export const runtime = "edge";

export async function PATCH(req: Request) {
  const ownerId = await ensureUserFromRequest(req, {}, { allowGuests: false });
  if (!ownerId) {
    return returnError(401, "auth_required", "Sign in to change your profile.");
  }

  const parsed = await parseJsonBody(req, updateRequestSchema);
  if (!parsed.success) {
    return parsed.response;
  }

  const hasNameField = Object.prototype.hasOwnProperty.call(parsed.data, "name");
  const rawName = hasNameField ? parsed.data.name : undefined;
  const sanitizedName =
    typeof rawName === "string" ? rawName.replace(/\s+/g, " ").trim() : rawName;
  const nextName =
    sanitizedName === undefined ? undefined : sanitizedName && sanitizedName.length ? sanitizedName : null;
  const hasBioField = Object.prototype.hasOwnProperty.call(parsed.data, "bio");
  const rawBio = hasBioField ? parsed.data.bio : undefined;
  const nextBio =
    rawBio === undefined ? undefined : typeof rawBio === "string" ? rawBio : null;

  const payload: { name?: string | null; bio?: string | null } = {};
  if (nextName !== undefined) {
    payload.name = nextName;
  }
  if (nextBio !== undefined) {
    payload.bio = nextBio;
  }

  try {
    const updated = await updateUserProfile(ownerId, payload);
    return validatedJson(updateResponseSchema, {
      success: true,
      name: updated.name,
      bio: updated.bio,
    });
  } catch (error) {
    console.error("account.profile update error", error);
    const message =
      error instanceof Error ? error.message : "Failed to update your display name.";
    return returnError(500, "profile_update_failed", message);
  }
}
