import { z } from "zod";
import type { NextRequest } from "next/server";

import { ensureUserFromRequest } from "@/lib/auth/payload";
import { parseJsonBody, returnError, validatedJson } from "@/server/validation/http";
import {
  CapsuleLadderAccessError,
  listLadderChallengesForViewer,
  resolveLadderChallenge,
} from "@/server/ladders/service";

const rankChangeSchema = z.object({
  memberId: z.string(),
  from: z.number(),
  to: z.number(),
});

const ratingChangeSchema = z.object({
  memberId: z.string(),
  from: z.number(),
  to: z.number(),
  delta: z.number().optional(),
});

const challengeResultSchema = z.object({
  outcome: z.enum(["challenger", "opponent", "draw"]),
  reportedAt: z.string(),
  reportedById: z.string().nullable(),
  note: z.string().nullable().optional(),
  proofUrl: z.string().nullable().optional(),
  rankChanges: z.array(rankChangeSchema).optional(),
  ratingChanges: z.array(ratingChangeSchema).optional(),
});

const challengeSchema = z.object({
  id: z.string(),
  ladderId: z.string(),
  challengerId: z.string(),
  opponentId: z.string(),
  challengerCapsuleId: z.string().nullable().optional(),
  opponentCapsuleId: z.string().nullable().optional(),
  participantType: z.enum(["member", "capsule"]).optional(),
  createdAt: z.string(),
  createdById: z.string().nullable(),
  status: z.enum(["pending", "resolved", "void"]),
  note: z.string().nullable().optional(),
  proofUrl: z.string().nullable().optional(),
  result: challengeResultSchema.optional(),
});

const historySchema = z.object({
  id: z.string(),
  ladderId: z.string(),
  challengeId: z.string().nullable(),
  challengerId: z.string(),
  opponentId: z.string(),
  challengerCapsuleId: z.string().nullable().optional(),
  opponentCapsuleId: z.string().nullable().optional(),
  participantType: z.enum(["member", "capsule"]).optional(),
  outcome: z.enum(["challenger", "opponent", "draw"]),
  resolvedAt: z.string(),
  note: z.string().nullable().optional(),
  proofUrl: z.string().nullable().optional(),
  rankChanges: z.array(rankChangeSchema).optional(),
  ratingChanges: z.array(ratingChangeSchema).optional(),
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

const resolveSchema = z.object({
  outcome: z.enum(["challenger", "opponent", "draw"]),
  note: z.string().max(240).nullable().optional(),
  challengerCapsuleId: z.string().min(1).optional(),
  opponentCapsuleId: z.string().min(1).optional(),
  proofUrl: z.string().url().max(2048).nullable().optional(),
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
  console.error("ladder.challenge.resolve error", error);
  return returnError(500, "ladder_challenge_error", "Unable to resolve this challenge.");
}

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string; ladderId: string; challengeId: string }> },
) {
  const params = await context.params;
  const actorId = await ensureUserFromRequest(req, {}, { allowGuests: false });
  if (!actorId) {
    return returnError(401, "auth_required", "Sign in to resolve a challenge.");
  }

  const parsed = await parseJsonBody(req, resolveSchema);
  if (!parsed.success) {
    return parsed.response;
  }

  try {
    const result = await resolveLadderChallenge(
      actorId,
      params.ladderId,
      params.challengeId,
      parsed.data.outcome,
      {
        note: parsed.data.note ?? null,
        proofUrl: parsed.data.proofUrl ?? null,
        challengerCapsuleId: parsed.data.challengerCapsuleId ?? null,
        opponentCapsuleId: parsed.data.opponentCapsuleId ?? null,
      },
    );
    const { challenges, history, ladder } = await listLadderChallengesForViewer(
      params.ladderId,
      actorId,
    );
    if (isCapsuleMismatch(params.id, ladder.capsuleId)) {
      return returnError(404, "ladder_not_found", "Ladder not found.");
    }
    return validatedJson(collectionResponseSchema, {
      challenges,
      history,
      members: result.members,
    });
  } catch (error) {
    return handleLadderError(error);
  }
}

export const runtime = "nodejs";
