import { NextResponse } from "next/server";
import { z } from "zod";

import { ensureUserFromRequest } from "@/lib/auth/payload";
import {
  ensureCapsuleLiveStream,
  getCapsuleLiveStreamOverview,
  getCapsuleStreamPreferences,
  rotateLiveStreamKeyForCapsule,
  upsertCapsuleStreamPreferences,
} from "@/server/mux/service";
import { CapsuleMembershipError, requireCapsuleOwnership } from "@/server/capsules/service";
import { parseJsonBody, returnError, validatedJson } from "@/server/validation/http";

const getQuerySchema = z.object({
  capsuleId: z.string().uuid("capsuleId must be a valid UUID"),
});

const postRequestSchema = z.object({
  capsuleId: z.string().uuid("capsuleId must be a valid UUID"),
  action: z.enum(["ensure", "rotate-key"]).default("ensure"),
  latencyMode: z.enum(["low", "reduced", "standard"]).optional(),
});

const updatePreferencesSchema = z.object({
  capsuleId: z.string().uuid("capsuleId must be a valid UUID"),
  preferences: z
    .object({
      latencyMode: z.enum(["low", "reduced", "standard"]).optional(),
      disconnectProtection: z.boolean().optional(),
      audioWarnings: z.boolean().optional(),
      storePastBroadcasts: z.boolean().optional(),
      alwaysPublishVods: z.boolean().optional(),
      autoClips: z.boolean().optional(),
    })
    .refine(
      (prefs) => Object.values(prefs).some((value) => value !== undefined),
      "At least one preference must be provided.",
    ),
});

const liveStreamResponseSchema = z.object({
  liveStream: z.unknown(),
  playback: z.object({
    playbackId: z.string().nullable(),
    playbackUrl: z.string().nullable(),
    playbackPolicy: z.string().nullable(),
  }),
  ingest: z.object({
    primary: z.string().nullable(),
    backup: z.string().nullable(),
    streamKey: z.string(),
    backupStreamKey: z.string().nullable(),
  }),
  sessions: z.array(z.unknown()),
  assets: z.array(z.unknown()),
  aiJobs: z.array(z.unknown()),
});

const streamPreferencesSchema = z.object({
  latencyMode: z.enum(["low", "reduced", "standard"]),
  disconnectProtection: z.boolean(),
  audioWarnings: z.boolean(),
  storePastBroadcasts: z.boolean(),
  alwaysPublishVods: z.boolean(),
  autoClips: z.boolean(),
});

const streamOverviewPayloadSchema = z.object({
  overview: liveStreamResponseSchema.nullable(),
  preferences: streamPreferencesSchema,
});

function ensureOwnership(ownerId: string, liveStreamOwnerId: string): NextResponse | null {
  if (ownerId !== liveStreamOwnerId) {
    return returnError(
      403,
      "forbidden",
      "You do not have permission to manage streaming for this capsule.",
    );
  }
  return null;
}

export async function GET(req: Request) {
  const ownerId = await ensureUserFromRequest(req, {}, { allowGuests: false });
  if (!ownerId) {
    return returnError(401, "auth_required", "Sign in to manage streaming.");
  }

  const url = new URL(req.url);
  const parsed = getQuerySchema.safeParse({
    capsuleId: url.searchParams.get("capsuleId"),
  });
  if (!parsed.success) {
    return returnError(
      400,
      "invalid_request",
      parsed.error.issues[0]?.message ?? "Invalid query parameters",
    );
  }

  const overview = await getCapsuleLiveStreamOverview(parsed.data.capsuleId);

  if (overview) {
    const ownershipError = ensureOwnership(ownerId, overview.liveStream.ownerUserId);
    if (ownershipError) {
      return ownershipError;
    }
  } else {
    try {
      await requireCapsuleOwnership(parsed.data.capsuleId, ownerId);
    } catch (error) {
      if (error instanceof CapsuleMembershipError) {
        return returnError(error.status, error.code, error.message);
      }
      throw error;
    }
  }

  const preferences = await getCapsuleStreamPreferences(parsed.data.capsuleId);

  return validatedJson(streamOverviewPayloadSchema, { overview: overview ?? null, preferences });
}

export async function POST(req: Request) {
  const ownerId = await ensureUserFromRequest(req, {}, { allowGuests: false });
  if (!ownerId) {
    return returnError(401, "auth_required", "Sign in to manage streaming.");
  }

  const bodyResult = await parseJsonBody(req, postRequestSchema);
  if (!bodyResult.success) {
    return bodyResult.response;
  }

  const data = bodyResult.data;
  let capsuleOwnerId: string;
  try {
    const ownership = await requireCapsuleOwnership(data.capsuleId, ownerId);
    capsuleOwnerId = ownership.ownerId;
  } catch (error) {
    if (error instanceof CapsuleMembershipError) {
      return returnError(error.status, error.code, error.message);
    }
    throw error;
  }

  let overview = null;
  try {
    if (data.action === "rotate-key") {
      overview = await rotateLiveStreamKeyForCapsule({
        capsuleId: data.capsuleId,
        ownerUserId: ownerId,
      });
    } else {
      if (data.latencyMode) {
        await upsertCapsuleStreamPreferences({
          capsuleId: data.capsuleId,
          ownerUserId: capsuleOwnerId,
          preferences: { latencyMode: data.latencyMode },
        });
      }

      const params: { capsuleId: string; ownerUserId: string; latencyMode?: "low" | "reduced" | "standard" } = {
        capsuleId: data.capsuleId,
        ownerUserId: capsuleOwnerId,
      };
      if (data.latencyMode) {
        params.latencyMode = data.latencyMode;
      }
      overview = await ensureCapsuleLiveStream(params);
    }
  } catch (error) {
    console.error("mux.live.post", error);
    const message =
      error && typeof error === "object" && "message" in error && typeof error.message === "string"
        ? error.message
        : "Failed to update streaming configuration.";
    return returnError(500, "mux_error", message);
  }

  if (!overview) {
    return returnError(404, "not_found", "Unable to locate the requested live stream.");
  }

  const ownershipError = ensureOwnership(ownerId, overview.liveStream.ownerUserId);
  if (ownershipError) {
    return ownershipError;
  }

  const preferences = await getCapsuleStreamPreferences(data.capsuleId);

  return validatedJson(streamOverviewPayloadSchema, { overview, preferences }, { status: 200 });
}

export async function PUT(req: Request) {
  const ownerId = await ensureUserFromRequest(req, {}, { allowGuests: false });
  if (!ownerId) {
    return returnError(401, "auth_required", "Sign in to manage streaming.");
  }

  const bodyResult = await parseJsonBody(req, updatePreferencesSchema);
  if (!bodyResult.success) {
    return bodyResult.response;
  }

  const { capsuleId, preferences } = bodyResult.data;

  let capsuleOwnerId: string;
  try {
    const ownership = await requireCapsuleOwnership(capsuleId, ownerId);
    capsuleOwnerId = ownership.ownerId;
  } catch (error) {
    if (error instanceof CapsuleMembershipError) {
      return returnError(error.status, error.code, error.message);
    }
    throw error;
  }

  const updatedPreferences = await upsertCapsuleStreamPreferences({
    capsuleId,
    ownerUserId: capsuleOwnerId,
    preferences,
  });

  const overview = await getCapsuleLiveStreamOverview(capsuleId);
  if (overview) {
    const ownershipError = ensureOwnership(ownerId, overview.liveStream.ownerUserId);
    if (ownershipError) {
      return ownershipError;
    }
  }

  return validatedJson(
    streamOverviewPayloadSchema,
    { overview: overview ?? null, preferences: updatedPreferences },
    { status: 200 },
  );
}
