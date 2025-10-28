import { z } from "zod";

import { ensureUserFromRequest } from "@/lib/auth/payload";
import { parseJsonBody, returnError, validatedJson } from "@/server/validation/http";
import {
  CapsuleLadderAccessError,
  createCapsuleLadder,
  listCapsuleLaddersForViewer,
} from "@/server/ladders/service";

const jsonValueSchema = z.any();

const ladderSummarySchema = z.object({
  id: z.string(),
  capsuleId: z.string(),
  name: z.string(),
  slug: z.string().nullable(),
  summary: z.string().nullable(),
  status: z.enum(["draft", "active", "archived"]),
  visibility: z.enum(["private", "capsule", "public"]),
  createdById: z.string(),
  game: jsonValueSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
  publishedAt: z.string().nullable(),
});

const ladderDetailSchema = ladderSummarySchema.extend({
  publishedById: z.string().nullable(),
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

const listResponseSchema = z.object({
  ladders: z.array(ladderSummarySchema),
});

const createResponseSchema = z.object({
  ladder: ladderDetailSchema,
  members: z.array(ladderMemberSchema),
});

const jsonObjectSchema = z
  .union([z.record(z.string(), z.unknown()), z.null()])
  .optional()
  .transform((value) => (value === undefined ? null : value ?? null));

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
  metadata: jsonObjectSchema,
});

const createRequestSchema = z.object({
  name: z.string().min(3).max(80),
  summary: z.string().max(360).nullable().optional(),
  visibility: z.enum(["private", "capsule", "public"]).optional(),
  status: z.enum(["draft", "active", "archived"]).optional(),
  game: jsonObjectSchema,
  config: jsonObjectSchema,
  sections: jsonObjectSchema,
  aiPlan: jsonObjectSchema,
  meta: jsonObjectSchema,
  members: z.array(ladderMemberInputSchema).max(32).optional(),
  publish: z.boolean().optional(),
});

export async function GET(
  req: Request,
  { params }: { params: { id: string } },
) {
  const viewerId = await ensureUserFromRequest(req, {}, { allowGuests: true });

  try {
    const ladders = await listCapsuleLaddersForViewer(params.id, viewerId, {});
    return validatedJson(listResponseSchema, { ladders });
  } catch (error) {
    if (error instanceof CapsuleLadderAccessError) {
      return returnError(error.status, error.code, error.message);
    }
    console.error("ladders.list error", error);
    return returnError(500, "ladder_list_error", "Failed to load ladders for this capsule.");
  }
}

export async function POST(
  req: Request,
  { params }: { params: { id: string } },
) {
  const actorId = await ensureUserFromRequest(req, {}, { allowGuests: false });
  if (!actorId) {
    return returnError(401, "auth_required", "Sign in to create a ladder.");
  }

  const parsed = await parseJsonBody(req, createRequestSchema);
  if (!parsed.success) {
    return parsed.response;
  }

  const members = parsed.data.members ?? [];

  try {
    const { ladder, members: storedMembers } = await createCapsuleLadder(actorId, {
      capsuleId: params.id,
      name: parsed.data.name,
      summary: parsed.data.summary ?? null,
      visibility: parsed.data.visibility,
      status: parsed.data.status,
      game: (parsed.data.game ?? undefined) as Record<string, unknown> | null,
      config: (parsed.data.config ?? undefined) as Record<string, unknown> | null,
      sections: (parsed.data.sections ?? undefined) as Record<string, unknown> | null,
      aiPlan: (parsed.data.aiPlan ?? undefined) as Record<string, unknown> | null,
      meta: (parsed.data.meta ?? undefined) as Record<string, unknown> | null,
      members,
      publish: parsed.data.publish ?? false,
    });

    return validatedJson(createResponseSchema, { ladder, members: storedMembers }, { status: 201 });
  } catch (error) {
    if (error instanceof CapsuleLadderAccessError) {
      return returnError(error.status, error.code, error.message);
    }
    console.error("ladders.create error", error);
    return returnError(500, "ladder_create_error", "Unable to create ladder for this capsule.");
  }
}

export const runtime = "nodejs";
