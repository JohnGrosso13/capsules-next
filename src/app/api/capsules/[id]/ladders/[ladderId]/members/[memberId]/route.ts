"use server";

import { z } from "zod";
import type { NextRequest } from "next/server";

import { ensureUserFromRequest } from "@/lib/auth/payload";
import { parseJsonBody, returnError, validatedJson } from "@/server/validation/http";
import {
  CapsuleLadderAccessError,
  removeCapsuleLadderMember,
  updateCapsuleLadderMember,
} from "@/server/ladders/service";
import type { CapsuleLadderMemberUpdateInput } from "@/types/ladders";

const jsonValueSchema = z.any();

const ladderMemberSchema = z.object({
  id: z.string(),
  ladderId: z.string(),
  userId: z.string().nullable(),
  displayName: z.string(),
  handle: z.string().nullable(),
  status: z.enum(["pending", "invited", "active", "rejected", "banned"]).optional(),
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

const memberPatchSchema = z
  .object({
    userId: z.string().max(64).nullable().optional(),
    displayName: z.string().min(1).max(80).optional(),
    handle: z.string().max(40).nullable().optional(),
    status: z.enum(["pending", "invited", "active", "rejected", "banned"]).optional(),
    seed: z.number().int().min(1).max(999).nullable().optional(),
    rank: z.number().int().min(1).max(999).nullable().optional(),
    rating: z.number().int().min(100).max(4000).nullable().optional(),
    wins: z.number().int().min(0).max(500).nullable().optional(),
    losses: z.number().int().min(0).max(500).nullable().optional(),
    draws: z.number().int().min(0).max(500).nullable().optional(),
    streak: z.number().int().min(-20).max(20).nullable().optional(),
    metadata: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
  })
  .refine((payload) => Object.keys(payload).length > 0, {
    message: "Provide at least one field to update.",
  });

const memberResponseSchema = z.object({
  member: ladderMemberSchema,
});

type MemberPatch = z.infer<typeof memberPatchSchema>;

function toMemberPatch(data: MemberPatch): CapsuleLadderMemberUpdateInput {
  const patch: CapsuleLadderMemberUpdateInput = {};
  if (data.userId !== undefined) patch.userId = data.userId ?? null;
  if (data.displayName !== undefined) patch.displayName = data.displayName;
  if (data.handle !== undefined) patch.handle = data.handle ?? null;
  if (data.status !== undefined) patch.status = data.status;
  if (data.seed !== undefined) patch.seed = data.seed;
  if (data.rank !== undefined) patch.rank = data.rank;
  if (data.rating !== undefined) patch.rating = data.rating;
  if (data.wins !== undefined) patch.wins = data.wins;
  if (data.losses !== undefined) patch.losses = data.losses;
  if (data.draws !== undefined) patch.draws = data.draws;
  if (data.streak !== undefined) patch.streak = data.streak;
  if (data.metadata !== undefined) patch.metadata = data.metadata ?? null;
  return patch;
}

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string; ladderId: string; memberId: string }> },
) {
  const params = await context.params;
  const actorId = await ensureUserFromRequest(req, {}, { allowGuests: false });
  if (!actorId) {
    return returnError(401, "auth_required", "Sign in to manage ladder members.");
  }

  const parsed = await parseJsonBody(req, memberPatchSchema);
  if (!parsed.success) {
    return parsed.response;
  }

  try {
    const member = await updateCapsuleLadderMember(
      actorId,
      params.ladderId,
      params.memberId,
      toMemberPatch(parsed.data),
    );
    return validatedJson(memberResponseSchema, { member });
  } catch (error) {
    if (error instanceof CapsuleLadderAccessError) {
      return returnError(error.status, error.code, error.message);
    }
    console.error("ladder.member.update error", error);
    return returnError(500, "ladder_member_error", "Failed to update ladder member.");
  }
}

export async function DELETE(
  req: NextRequest,
  context: { params: Promise<{ id: string; ladderId: string; memberId: string }> },
) {
  const params = await context.params;
  const actorId = await ensureUserFromRequest(req, {}, { allowGuests: false });
  if (!actorId) {
    return returnError(401, "auth_required", "Sign in to manage ladder members.");
  }

  try {
    await removeCapsuleLadderMember(actorId, params.ladderId, params.memberId);
    return new Response(null, { status: 204 });
  } catch (error) {
    if (error instanceof CapsuleLadderAccessError) {
      return returnError(error.status, error.code, error.message);
    }
    console.error("ladder.member.delete error", error);
    return returnError(500, "ladder_member_error", "Failed to remove ladder member.");
  }
}
