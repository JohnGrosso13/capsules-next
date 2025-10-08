import { z } from "zod";

import { ensureUserFromRequest } from "@/lib/auth/payload";
import { getRecentCapsules } from "@/server/capsules/service";
import { returnError, validatedJson } from "@/server/validation/http";

const listResponseSchema = z.object({
  capsules: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      slug: z.string().nullable(),
      bannerUrl: z.string().nullable(),
      logoUrl: z.string().nullable(),
      createdAt: z.string().nullable(),
    }),
  ),
});

export async function GET(req: Request) {
  const viewerId = await ensureUserFromRequest(req, {}, { allowGuests: false });
  if (!viewerId) {
    return returnError(401, "auth_required", "Sign in to discover recent capsules.");
  }

  try {
    const { searchParams } = new URL(req.url);
    const limitParam = searchParams.get("limit");
    const limit = limitParam ? Number.parseInt(limitParam, 10) : undefined;
    const capsules = await getRecentCapsules({ viewerId, limit });
    return validatedJson(listResponseSchema, { capsules });
  } catch (error) {
    console.error("explore.recent-capsules error", error);
    return returnError(500, "capsules_error", "Failed to load new capsules.");
  }
}

export const runtime = "nodejs";
