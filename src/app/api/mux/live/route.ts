import { NextResponse } from "next/server";
import { z } from "zod";

import { ensureUserFromRequest } from "@/lib/auth/payload";
import {
  ensureCapsuleLiveStream,
  getCapsuleLiveStreamOverview,
  rotateLiveStreamKeyForCapsule,
} from "@/server/mux/service";
import { parseJsonBody, returnError, validatedJson } from "@/server/validation/http";

const getQuerySchema = z.object({
  capsuleId: z.string().uuid("capsuleId must be a valid UUID"),
});

const postRequestSchema = z.object({
  capsuleId: z.string().uuid("capsuleId must be a valid UUID"),
  action: z.enum(["ensure", "rotate-key"]).default("ensure"),
  latencyMode: z.enum(["low", "reduced", "standard"]).optional(),
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
  if (!overview) {
    return returnError(404, "not_found", "No live stream found for this capsule.");
  }

  const ownershipError = ensureOwnership(ownerId, overview.liveStream.ownerUserId);
  if (ownershipError) {
    return ownershipError;
  }

  return validatedJson(liveStreamResponseSchema, overview);
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
  let overview = null;
  if (data.action === "rotate-key") {
    overview = await rotateLiveStreamKeyForCapsule({
      capsuleId: data.capsuleId,
      ownerUserId: ownerId,
    });
  } else {
    const params: { capsuleId: string; ownerUserId: string; latencyMode?: "low" | "reduced" | "standard" } = {
      capsuleId: data.capsuleId,
      ownerUserId: ownerId,
    };
    if (data.latencyMode) {
      params.latencyMode = data.latencyMode;
    }
    overview = await ensureCapsuleLiveStream(params);
  }

  if (!overview) {
    return returnError(404, "not_found", "Unable to locate the requested live stream.");
  }

  const ownershipError = ensureOwnership(ownerId, overview.liveStream.ownerUserId);
  if (ownershipError) {
    return ownershipError;
  }

  return validatedJson(liveStreamResponseSchema, overview, { status: 200 });
}
