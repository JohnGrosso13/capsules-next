import { NextResponse } from "next/server";
import { z } from "zod";

import { ensureUserFromRequest } from "@/lib/auth/payload";
import { CapsuleMembershipError, requireCapsuleOwnership } from "@/server/capsules/service";
import {
  getCapsuleLiveStreamOverview,
  getCapsuleStreamPreferences,
} from "@/server/mux/service";
import { returnError } from "@/server/validation/http";

const querySchema = z.object({
  capsuleId: z.string().uuid("capsuleId must be a valid UUID"),
});

function toFileSafeName(input: string): string {
  const slug = input
    .toLowerCase()
    .replace(/[^a-z0-9-_]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-|-$/g, "");
  return slug.length ? slug : input;
}

export async function GET(req: Request) {
  const ownerId = await ensureUserFromRequest(req, {}, { allowGuests: false });
  if (!ownerId) {
    return returnError(401, "auth_required", "Sign in to download encoder profiles.");
  }

  const url = new URL(req.url);
  const parsed = querySchema.safeParse({ capsuleId: url.searchParams.get("capsuleId") });
  if (!parsed.success) {
    return returnError(
      400,
      "invalid_request",
      parsed.error.issues[0]?.message ?? "Invalid query parameters",
    );
  }

  let capsuleName = "";
  let capsuleSlug = "";
  try {
    const ownership = await requireCapsuleOwnership(parsed.data.capsuleId, ownerId);
    capsuleName = (ownership.capsule?.name as string | undefined) ?? "";
    capsuleSlug = (ownership.capsule?.slug as string | undefined) ?? "";
  } catch (error) {
    if (error instanceof CapsuleMembershipError) {
      return returnError(error.status, error.code, error.message);
    }
    throw error;
  }

  const overview = await getCapsuleLiveStreamOverview(parsed.data.capsuleId);
  if (!overview) {
    return returnError(
      404,
      "stream_unconfigured",
      "Generate streaming credentials before downloading an OBS profile.",
    );
  }

  const preferences = await getCapsuleStreamPreferences(parsed.data.capsuleId);

  const payload = {
    version: "capsules-obs-profile/v1",
    generatedAt: new Date().toISOString(),
    capsule: {
      id: parsed.data.capsuleId,
      name: capsuleName || null,
      slug: capsuleSlug || null,
    },
    mux: {
      liveStreamId: overview.liveStream.muxLiveStreamId,
      ingest: overview.ingest,
      playback: overview.playback,
    },
    preferences,
  };

  const fileStem = toFileSafeName(capsuleSlug || capsuleName || parsed.data.capsuleId);
  const filename = `${fileStem}-obs-profile.json`;

  return new NextResponse(JSON.stringify(payload, null, 2), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
