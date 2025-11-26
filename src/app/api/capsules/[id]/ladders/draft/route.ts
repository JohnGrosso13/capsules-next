import { z } from "zod";
import type { NextRequest } from "next/server";

import { ensureUserFromRequest } from "@/lib/auth/payload";
import { parseJsonBody, returnError, validatedJson } from "@/server/validation/http";
import {
  CapsuleLadderAccessError,
  generateLadderDraftForCapsule,
} from "@/server/ladders/service";
import { AIConfigError } from "@/lib/ai/prompter";
import type { LadderDraftSeed } from "@/server/ladders/service";

const jsonValueSchema = z.any();

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
  metadata: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

const draftResponseSchema = z.object({
  ladder: z.object({
    name: z.string(),
    summary: z.string().nullable(),
    visibility: z.enum(["private", "capsule", "public"]),
    status: z.enum(["draft", "active", "archived"]),
    publish: z.boolean(),
    game: jsonValueSchema,
    config: jsonValueSchema,
    sections: jsonValueSchema,
    aiPlan: jsonValueSchema.nullable(),
    meta: jsonValueSchema.nullable(),
  }),
  members: z.array(ladderMemberInputSchema),
});

const stringArraySchema = z
  .array(z.string().min(1).max(160))
  .max(10)
  .optional()
  .transform((value) => value ?? []);

const draftRequestSchema = z.object({
  goal: z.string().max(600).optional(),
  audience: z.string().max(200).optional(),
  tone: z.string().max(160).optional(),
  capsuleBrief: z.string().max(400).optional(),
  existingRules: z.string().max(400).optional(),
  prizeIdeas: stringArraySchema,
  announcementsFocus: stringArraySchema,
  shoutouts: stringArraySchema,
  timezone: z.string().max(60).optional(),
  seasonLengthWeeks: z.number().int().min(1).max(52).optional(),
  participants: z.number().int().min(2).max(512).optional(),
  registrationNotes: z.string().max(240).optional(),
  notes: z.string().max(400).optional(),
  game: z
    .object({
      title: z.string().max(120).optional(),
      mode: z.string().max(120).optional(),
      platform: z.string().max(60).optional(),
      region: z.string().max(60).optional(),
    })
    .optional(),
});

type DraftRequestPayload = z.infer<typeof draftRequestSchema>;

function buildDraftSeed(data: DraftRequestPayload): LadderDraftSeed {
  const seed: LadderDraftSeed = {};
  if (data.goal !== undefined) seed.goal = data.goal;
  if (data.audience !== undefined) seed.audience = data.audience;
  if (data.tone !== undefined) seed.tone = data.tone;
  if (data.capsuleBrief !== undefined) seed.capsuleBrief = data.capsuleBrief;
  if (data.existingRules !== undefined) seed.existingRules = data.existingRules;
  if (data.timezone !== undefined) seed.timezone = data.timezone;
  if (data.seasonLengthWeeks !== undefined) seed.seasonLengthWeeks = data.seasonLengthWeeks;
  if (data.participants !== undefined) seed.participants = data.participants;
  if (data.registrationNotes !== undefined) seed.registrationNotes = data.registrationNotes;
  if (data.notes !== undefined) seed.notes = data.notes;
  seed.prizeIdeas = data.prizeIdeas;
  seed.announcementsFocus = data.announcementsFocus;
  seed.shoutouts = data.shoutouts;
  if (data.game !== undefined) {
    seed.game = {
      title: data.game.title ?? null,
      mode: data.game.mode ?? null,
      platform: data.game.platform ?? null,
      region: data.game.region ?? null,
    };
  }
  return seed;
}

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const params = await context.params;
  const actorId = await ensureUserFromRequest(req, {}, { allowGuests: false });
  if (!actorId) {
    return returnError(401, "auth_required", "Sign in to generate a ladder draft.");
  }

  const parsed = await parseJsonBody(req, draftRequestSchema);
  if (!parsed.success) {
    return parsed.response;
  }

  try {
    const seed = buildDraftSeed(parsed.data);
    const blueprint = await generateLadderDraftForCapsule(actorId, params.id, seed);

    return validatedJson(draftResponseSchema, {
      ladder: {
        name: blueprint.name,
        summary: blueprint.summary,
        visibility: blueprint.visibility,
        status: blueprint.status,
        publish: blueprint.publish,
        game: blueprint.game,
        config: blueprint.config,
        sections: blueprint.sections,
        aiPlan: blueprint.aiPlan,
        meta: blueprint.meta,
      },
      members: blueprint.members,
    });
  } catch (error) {
    if (error instanceof CapsuleLadderAccessError) {
      return returnError(error.status, error.code, error.message);
    }
    if (error instanceof AIConfigError) {
      return returnError(
        503,
        "ai_unavailable",
        "AI configuration is required to generate ladder drafts.",
      );
    }
    console.error("ladders.draft error", error);
    return returnError(500, "ladder_draft_error", "Unable to generate ladder draft.");
  }
}

export const runtime = "nodejs";
