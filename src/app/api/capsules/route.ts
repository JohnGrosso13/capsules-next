import { z } from "zod";

import { ensureUserFromRequest } from "@/lib/auth/payload";
import { createCapsule, getUserCapsules } from "@/server/capsules/service";
import { parseJsonBody, returnError, validatedJson } from "@/server/validation/http";

const createRequestSchema = z.object({
  name: z
    .string({ required_error: "name is required" })
    .trim()
    .min(1, "name is required")
    .max(80, "name must be 80 characters or fewer"),
});

const listResponseSchema = z.object({
  capsules: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      slug: z.string().nullable(),
      bannerUrl: z.string().nullable(),
      logoUrl: z.string().nullable(),
      role: z.string().nullable(),
      ownership: z.union([z.literal("owner"), z.literal("member")]),
    }),
  ),
});

const createResponseSchema = z.object({
  capsule: listResponseSchema.shape.capsules.element,
});

export async function GET(req: Request) {
  const ownerId = await ensureUserFromRequest(req, {}, { allowGuests: false });
  if (!ownerId) {
    return returnError(401, "auth_required", "Sign in to view your capsules.");
  }

  try {
    const capsules = await getUserCapsules(ownerId);
    return validatedJson(listResponseSchema, { capsules });
  } catch (error) {
    console.error("capsules.list error", error);
    return returnError(500, "capsules_error", "Failed to load capsules.");
  }
}

export async function POST(req: Request) {
  const ownerId = await ensureUserFromRequest(req, {}, { allowGuests: false });
  if (!ownerId) {
    return returnError(401, "auth_required", "Sign in to create a capsule.");
  }

  const parsed = await parseJsonBody(req, createRequestSchema);
  if (!parsed.success) {
    return parsed.response;
  }

  try {
    const capsule = await createCapsule(ownerId, { name: parsed.data.name });
    return validatedJson(createResponseSchema, { capsule }, { status: 201 });
  } catch (error) {
    console.error("capsules.create error", error);
    return returnError(500, "capsules_error", "Failed to create capsule.");
  }
}

export const runtime = "nodejs";
