"use server";

import { z } from "zod";
import type { NextRequest } from "next/server";

import { ensureUserFromRequest } from "@/lib/auth/payload";
import { parseJsonBody, returnError, validatedJson } from "@/server/validation/http";
import {
  CapsuleLadderAccessError,
  addCapsuleLadderMembers,
  listCapsuleLadderMembers,
} from "@/server/ladders/service";
import type { CapsuleLadderMemberInput } from "@/types/ladders";
const jsonValueSchema = z.any();

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

const memberInputSchema = z.object({
  displayName: z.string().min(1).max(80),
  userId: z.string().max(64).nullable().optional(),
  handle: z.string().max(40).nullable().optional(),
  seed: z.number().int().min(1).max(999).nullable().optional(),
  rank: z.number().int().min(1).max(999).nullable().optional(),
  rating: z.number().int().min(100).max(4000).nullable().optional(),
  wins: z.number().int().min(0).max(500).nullable().optional(),
  losses: z.number().int().min(0).max(500).nullable().optional(),
  draws: z.number().int().min(0).max(500).nullable().optional(),
  streak: z.number().int().min(-20).max(20).nullable().optional(),
  metadata: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

const collectionResponseSchema = z.object({
  members: z.array(ladderMemberSchema),
});

const collectionCreateSchema = z.object({
  members: z.array(memberInputSchema).min(1).max(32),
});

type MemberInput = z.infer<typeof memberInputSchema>;

function toMemberInput(input: MemberInput): CapsuleLadderMemberInput {
  const next: CapsuleLadderMemberInput = {
    displayName: input.displayName,
  };
  if (input.userId !== undefined) {
    next.userId = input.userId ?? null;
  }
  if (input.handle !== undefined) {
    next.handle = input.handle ?? null;
  }
  if (input.seed !== undefined) next.seed = input.seed;
  if (input.rank !== undefined) next.rank = input.rank;
  if (input.rating !== undefined) next.rating = input.rating;
  if (input.wins !== undefined) next.wins = input.wins;
  if (input.losses !== undefined) next.losses = input.losses;
  if (input.draws !== undefined) next.draws = input.draws;
  if (input.streak !== undefined) next.streak = input.streak;
  if (input.metadata !== undefined) next.metadata = input.metadata ?? null;
  return next;
}

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string; ladderId: string }> },
) {
  const params = await context.params;
  const actorId = await ensureUserFromRequest(req, {}, { allowGuests: false });
  if (!actorId) {
    return returnError(401, "auth_required", "Sign in to manage ladder members.");
  }

  try {
    const members = await listCapsuleLadderMembers(actorId, params.ladderId);
    return validatedJson(collectionResponseSchema, { members });
  } catch (error) {
    if (error instanceof CapsuleLadderAccessError) {
      return returnError(error.status, error.code, error.message);
    }
    console.error("ladder.members.list error", error);
    return returnError(500, "ladder_members_error", "Failed to load ladder members.");
  }
}

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string; ladderId: string }> },
) {
  const params = await context.params;
  const actorId = await ensureUserFromRequest(req, {}, { allowGuests: false });
  if (!actorId) {
    return returnError(401, "auth_required", "Sign in to manage ladder members.");
  }

  const parsed = await parseJsonBody(req, collectionCreateSchema);
  if (!parsed.success) {
    return parsed.response;
  }

  try {
    const members = await addCapsuleLadderMembers(
      actorId,
      params.ladderId,
      parsed.data.members.map(toMemberInput),
    );
    return validatedJson(collectionResponseSchema, { members });
  } catch (error) {
    if (error instanceof CapsuleLadderAccessError) {
      return returnError(error.status, error.code, error.message);
    }
    console.error("ladder.members.create error", error);
    return returnError(500, "ladder_members_error", "Failed to add ladder members.");
  }
}
