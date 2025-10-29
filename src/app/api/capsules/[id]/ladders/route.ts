import { z } from "zod";
import type { NextRequest } from "next/server";

import { ensureUserFromRequest } from "@/lib/auth/payload";
import { parseJsonBody, returnError, validatedJson } from "@/server/validation/http";
import {
  CapsuleLadderAccessError,
  createCapsuleLadder,
  listCapsuleLaddersForViewer,
} from "@/server/ladders/service";
import type { CreateCapsuleLadderInput } from "@/server/ladders/service";
import type {
  CapsuleLadderMemberInput,
  LadderAiPlan,
  LadderConfig,
  LadderGameConfig,
  LadderSections,
} from "@/types/ladders";

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
  seed: z.number().int().min(1).max(999).nullable().optional(),
  rank: z.number().int().min(1).max(999).nullable().optional(),
  rating: z.number().int().min(100).max(4000).nullable().optional(),
  wins: z.number().int().min(0).max(500).nullable().optional(),
  losses: z.number().int().min(0).max(500).nullable().optional(),
  draws: z.number().int().min(0).max(500).nullable().optional(),
  streak: z.number().int().min(-20).max(20).nullable().optional(),
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

type CreateRequestPayload = z.infer<typeof createRequestSchema>;

type RawMemberPayload = z.infer<typeof ladderMemberInputSchema>;

function normalizeMemberInput(member: RawMemberPayload): CapsuleLadderMemberInput {
  const normalized: CapsuleLadderMemberInput = {
    displayName: member.displayName,
  };
  if (member.handle !== undefined) normalized.handle = member.handle;
  if (member.seed !== undefined) normalized.seed = member.seed;
  if (member.rank !== undefined) normalized.rank = member.rank;
  if (member.rating !== undefined) normalized.rating = member.rating;
  if (member.wins !== undefined) normalized.wins = member.wins;
  if (member.losses !== undefined) normalized.losses = member.losses;
  if (member.draws !== undefined) normalized.draws = member.draws;
  if (member.streak !== undefined) normalized.streak = member.streak;
  if (member.metadata !== undefined) normalized.metadata = member.metadata ?? null;
  return normalized;
}

function buildCreateInput(capsuleId: string, data: CreateRequestPayload): CreateCapsuleLadderInput {
  const input: CreateCapsuleLadderInput = {
    capsuleId,
    name: data.name,
  };
  if (data.summary !== undefined) input.summary = data.summary;
  if (data.visibility !== undefined) input.visibility = data.visibility;
  if (data.status !== undefined) input.status = data.status;
  input.game = (data.game ?? null) as LadderGameConfig | null;
  input.config = (data.config ?? null) as LadderConfig | null;
  input.sections = (data.sections ?? null) as LadderSections | null;
  input.aiPlan = (data.aiPlan ?? null) as LadderAiPlan | null;
  input.meta = data.meta ?? null;
  if (data.publish !== undefined) input.publish = data.publish;
  return input;
}

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const params = await context.params;
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
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const params = await context.params;
  const actorId = await ensureUserFromRequest(req, {}, { allowGuests: false });
  if (!actorId) {
    return returnError(401, "auth_required", "Sign in to create a ladder.");
  }

  const parsed = await parseJsonBody(req, createRequestSchema);
  if (!parsed.success) {
    return parsed.response;
  }

  const members = (parsed.data.members ?? []).map(normalizeMemberInput);

  try {
    const createInput = buildCreateInput(params.id, parsed.data);
    createInput.members = members;
    const { ladder, members: storedMembers } = await createCapsuleLadder(actorId, createInput);

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
