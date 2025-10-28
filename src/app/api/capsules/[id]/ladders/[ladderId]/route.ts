import { z } from "zod";

import { ensureUserFromRequest } from "@/lib/auth/payload";
import { parseJsonBody, returnError, validatedJson } from "@/server/validation/http";
import {
  CapsuleLadderAccessError,
  deleteCapsuleLadder,
  getCapsuleLadderForViewer,
  updateCapsuleLadder,
} from "@/server/ladders/service";

const jsonValueSchema = z.any();

const ladderDetailSchema = z.object({
  id: z.string(),
  capsuleId: z.string(),
  name: z.string(),
  slug: z.string().nullable(),
  summary: z.string().nullable(),
  status: z.enum(["draft", "active", "archived"]),
  visibility: z.enum(["private", "capsule", "public"]),
  createdById: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
  publishedAt: z.string().nullable(),
  publishedById: z.string().nullable(),
  game: jsonValueSchema,
  config: jsonValueSchema,
  sections: jsonValueSchema,
  aiPlan: jsonValueSchema.nullable(),
  meta: jsonValueSchema.nullable(),
});

const ladderMemberSchema = z.object({
  id: z.string(),
  ladderId: z.string(),
  userId: z.string().nullable(),
  displayName: z.string(),
  handle: z.string().nullable(),
  seed: z.number().nullable(),
  rank: z.number().nullable(),
  rating: z.number(),
  wins: z.number(),
  losses: z.number(),
  draws: z.number(),
  streak: z.number(),
  metadata: jsonValueSchema.nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

const getResponseSchema = z.object({
  ladder: ladderDetailSchema,
  members: z.array(ladderMemberSchema).optional(),
});

const updateResponseSchema = z.object({
  ladder: ladderDetailSchema.nullable(),
  members: z.array(ladderMemberSchema).nullable().optional(),
});

const ladderMemberInputSchema = z.object({
  displayName: z.string().min(1).max(80),
  handle: z.string().max(40).nullable().optional(),
  seed: z.number().int().min(1).max(999).optional(),
  rank: z.number().int().min(1).max(999).optional(),
  rating: z.number().int().min(100).max(4000).optional(),
  wins: z.number().int().min(0).max(500).optional(),
  losses: z.number().int().min(0).max(500).optional(),
  draws: z.number().int().min(0).max(500).optional(),
  streak: z.number().int().min(-20).max(20).optional(),
  metadata: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

const jsonObjectSchema = z
  .union([z.record(z.string(), z.unknown()), z.null()])
  .optional()
  .transform((value) => (value === undefined ? undefined : value ?? null));

const updateRequestSchema = z.object({
  name: z.string().min(3).max(80).optional(),
  summary: z.string().max(360).nullable().optional(),
  visibility: z.enum(["private", "capsule", "public"]).optional(),
  status: z.enum(["draft", "active", "archived"]).optional(),
  slug: z.string().max(120).nullable().optional(),
  game: jsonObjectSchema,
  config: jsonObjectSchema,
  sections: jsonObjectSchema,
  aiPlan: jsonObjectSchema,
  meta: jsonObjectSchema,
  publish: z.boolean().optional(),
  archive: z.boolean().optional(),
  members: z.array(ladderMemberInputSchema).max(32).optional(),
});

export async function GET(
  req: Request,
  { params }: { params: { id: string; ladderId: string } },
) {
  const viewerId = await ensureUserFromRequest(req, {}, { allowGuests: true });

  const url = new URL(req.url);
  const includeMembersParam = url.searchParams.get("includeMembers");
  const includeMembers =
    includeMembersParam !== null
      ? ["1", "true", "yes"].includes(includeMembersParam.toLowerCase())
      : false;

  try {
    const result = await getCapsuleLadderForViewer(params.ladderId, viewerId, {
      includeMembers,
    });
    return validatedJson(getResponseSchema, result);
  } catch (error) {
    if (error instanceof CapsuleLadderAccessError) {
      return returnError(error.status, error.code, error.message);
    }
    console.error("ladder.detail error", error);
    return returnError(500, "ladder_detail_error", "Failed to load ladder.");
  }
}

export async function PATCH(
  req: Request,
  { params }: { params: { id: string; ladderId: string } },
) {
  const actorId = await ensureUserFromRequest(req, {}, { allowGuests: false });
  if (!actorId) {
    return returnError(401, "auth_required", "Sign in to update this ladder.");
  }

  const parsed = await parseJsonBody(req, updateRequestSchema);
  if (!parsed.success) {
    return parsed.response;
  }

  try {
    const result = await updateCapsuleLadder(actorId, params.ladderId, parsed.data);
    if (!result.ladder) {
      return returnError(404, "ladder_not_found", "Ladder not found.");
    }
    return validatedJson(updateResponseSchema, {
      ladder: result.ladder,
      members:
        parsed.data.members !== undefined
          ? result.members ?? []
          : undefined,
    });
  } catch (error) {
    if (error instanceof CapsuleLadderAccessError) {
      return returnError(error.status, error.code, error.message);
    }
    console.error("ladder.update error", error);
    return returnError(500, "ladder_update_error", "Unable to update ladder.");
  }
}

export async function DELETE(
  req: Request,
  { params }: { params: { id: string; ladderId: string } },
) {
  const actorId = await ensureUserFromRequest(req, {}, { allowGuests: false });
  if (!actorId) {
    return returnError(401, "auth_required", "Sign in to remove this ladder.");
  }

  try {
    await deleteCapsuleLadder(actorId, params.ladderId);
    return new Response(null, { status: 204 });
  } catch (error) {
    if (error instanceof CapsuleLadderAccessError) {
      return returnError(error.status, error.code, error.message);
    }
    console.error("ladder.delete error", error);
    return returnError(500, "ladder_delete_error", "Unable to delete ladder.");
  }
}

export const runtime = "nodejs";
