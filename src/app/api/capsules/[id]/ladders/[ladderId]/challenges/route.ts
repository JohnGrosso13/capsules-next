import { z } from "zod";
import type { NextRequest } from "next/server";

import { ensureUserFromRequest } from "@/lib/auth/payload";
import { parseJsonBody, returnError, validatedJson } from "@/server/validation/http";
import {
  CapsuleLadderAccessError,
  createSimpleLadderChallenge,
  listLadderChallengesForViewer,
} from "@/server/ladders/service";

const rankChangeSchema = z.object({
  memberId: z.string(),
  from: z.number(),
  to: z.number(),
});

const challengeResultSchema = z.object({
  outcome: z.enum(["challenger", "opponent", "draw"]),
  reportedAt: z.string(),
  reportedById: z.string().nullable(),
  note: z.string().nullable().optional(),
  rankChanges: z.array(rankChangeSchema).optional(),
});

const challengeSchema = z.object({
  id: z.string(),
  ladderId: z.string(),
  challengerId: z.string(),
  opponentId: z.string(),
  createdAt: z.string(),
  createdById: z.string().nullable(),
  status: z.enum(["pending", "resolved", "void"]),
  note: z.string().nullable().optional(),
  result: challengeResultSchema.optional(),
});

const historySchema = z.object({
  id: z.string(),
  ladderId: z.string(),
  challengeId: z.string().nullable(),
  challengerId: z.string(),
  opponentId: z.string(),
  outcome: z.enum(["challenger", "opponent", "draw"]),
  resolvedAt: z.string(),
  note: z.string().nullable().optional(),
  rankChanges: z.array(rankChangeSchema).optional(),
});

const memberSchema = z.object({
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
  metadata: z.any().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

const collectionResponseSchema = z.object({
  challenges: z.array(challengeSchema),
  history: z.array(historySchema),
  members: z.array(memberSchema).optional(),
});

const createChallengeSchema = z.object({
  challengerId: z.string().min(1),
  opponentId: z.string().min(1),
  note: z.string().max(240).optional(),
});

function isCapsuleMismatch(
  capsuleId: string,
  ladderCapsuleId: string,
): boolean {
  return capsuleId.trim() !== ladderCapsuleId.trim();
}

function handleLadderError(error: unknown) {
  if (error instanceof CapsuleLadderAccessError) {
    return returnError(error.status, error.code, error.message);
  }
  console.error("ladder.challenges error", error);
  return returnError(500, "ladder_challenges_error", "Unable to process ladder challenges.");
}

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string; ladderId: string }> },
) {
  const params = await context.params;
  const viewerId = await ensureUserFromRequest(req, {}, { allowGuests: true });
  try {
    const { challenges, history, ladder } = await listLadderChallengesForViewer(
      params.ladderId,
      viewerId,
    );
    if (isCapsuleMismatch(params.id, ladder.capsuleId)) {
      return returnError(404, "ladder_not_found", "Ladder not found.");
    }
    return validatedJson(collectionResponseSchema, { challenges, history });
  } catch (error) {
    return handleLadderError(error);
  }
}

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string; ladderId: string }> },
) {
  const params = await context.params;
  const actorId = await ensureUserFromRequest(req, {}, { allowGuests: false });
  if (!actorId) {
    return returnError(401, "auth_required", "Sign in to create a challenge.");
  }

  const parsed = await parseJsonBody(req, createChallengeSchema);
  if (!parsed.success) {
    return parsed.response;
  }

  try {
    const result = await createSimpleLadderChallenge(actorId, params.ladderId, {
      ...parsed.data,
      note: parsed.data.note ?? null,
    });
    if (isCapsuleMismatch(params.id, result.ladder.capsuleId)) {
      return returnError(404, "ladder_not_found", "Ladder not found.");
    }
    const { challenges, history } = await listLadderChallengesForViewer(
      params.ladderId,
      actorId,
    );
    return validatedJson(collectionResponseSchema, { challenges, history });
  } catch (error) {
    return handleLadderError(error);
  }
}

export const runtime = "nodejs";
