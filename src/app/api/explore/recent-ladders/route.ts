import { z } from "zod";

import { ensureUserFromRequest } from "@/lib/auth/payload";
import { deriveRequestOrigin } from "@/lib/url";
import { getRecentLaddersForViewer } from "@/server/ladders/service";
import { returnError, validatedJson } from "@/server/validation/http";

const ladderSchema = z.object({
  id: z.string(),
  capsuleId: z.string(),
  name: z.string(),
  slug: z.string().nullable(),
  summary: z.string().nullable(),
  status: z.enum(["draft", "active", "archived"]),
  visibility: z.enum(["private", "capsule", "public"]),
  createdById: z.string(),
  game: z
    .object({
      title: z.string().nullable(),
      franchise: z.string().nullable().optional(),
      mode: z.string().nullable().optional(),
      platform: z.string().nullable().optional(),
      region: z.string().nullable().optional(),
      summary: z.string().nullable().optional(),
    })
    .optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
  publishedAt: z.string().nullable(),
  meta: z.record(z.string(), z.unknown()).nullable(),
  capsule: z
    .object({
      id: z.string(),
      name: z.string().nullable(),
      slug: z.string().nullable(),
      bannerUrl: z.string().nullable(),
      logoUrl: z.string().nullable(),
    })
    .nullable(),
});

const listResponseSchema = z.object({
  ladders: z.array(ladderSchema),
});

export async function GET(req: Request) {
  const viewerId = await ensureUserFromRequest(req, {}, { allowGuests: false });
  if (!viewerId) {
    return returnError(401, "auth_required", "Sign in to view your ladders.");
  }

  try {
    const { searchParams } = new URL(req.url);
    const limitParam = searchParams.get("limit");
    const parsedLimit = limitParam ? Number.parseInt(limitParam, 10) : undefined;
    const limit =
      typeof parsedLimit === "number" && !Number.isNaN(parsedLimit) ? parsedLimit : undefined;
    const origin = deriveRequestOrigin(req);
    const ladders = await getRecentLaddersForViewer(viewerId, {
      ...(limit !== undefined ? { limit } : {}),
      origin: origin ?? null,
    });
    return validatedJson(listResponseSchema, { ladders });
  } catch (error) {
    console.error("explore.recent-ladders error", error);
    return returnError(500, "ladders_error", "Failed to load recent ladders.");
  }
}

export const runtime = "nodejs";
