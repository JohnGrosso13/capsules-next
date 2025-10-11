import { z } from "zod";

import { ensureUserFromRequest } from "@/lib/auth/payload";
import { getUserProfileSummary } from "@/server/users/service";
import { returnError, validatedJson } from "@/server/validation/http";

const responseSchema = z.object({
  id: z.string(),
  name: z.string().nullable(),
  avatarUrl: z.string().nullable(),
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
