import { NextResponse } from "next/server";
import { z } from "zod";

import { ensureUserFromRequest } from "@/lib/auth/payload";
import { getCapsuleMembership } from "@/server/capsules/service";
import { getCapsuleLiveStreamOverview, reconcileCapsuleLiveStream } from "@/server/mux/service";
import { returnError } from "@/server/validation/http";

const querySchema = z.object({
  capsuleId: z.string().uuid("capsuleId must be a valid UUID"),
});

export async function GET(req: Request) {
  const viewerId = await ensureUserFromRequest(req, {}, { allowGuests: false });
  if (!viewerId) {
    return returnError(401, "auth_required", "Sign in to watch this stream.");
  }

  const url = new URL(req.url);
  const parsed = querySchema.safeParse({
    capsuleId: url.searchParams.get("capsuleId"),
  });
  if (!parsed.success) {
    return returnError(
      400,
      "invalid_request",
      parsed.error.issues[0]?.message ?? "Invalid query parameters",
    );
  }

  // Gate viewing to members/followers/owners.
  const membership = await getCapsuleMembership(parsed.data.capsuleId, viewerId);
  const viewer = membership.viewer;
  if (!viewer.isOwner && !viewer.isMember && !viewer.isFollower) {
    return returnError(
      403,
      "forbidden",
      "You do not have access to view this capsule's live stream.",
    );
  }

  const overview =
    (await reconcileCapsuleLiveStream(parsed.data.capsuleId)) ??
    (await getCapsuleLiveStreamOverview(parsed.data.capsuleId));
  if (!overview) {
    return returnError(404, "not_found", "Stream is not configured for this capsule yet.");
  }

  return NextResponse.json(
    {
      status: overview.health.status,
      playback: overview.playback,
      liveStream: {
        id: overview.liveStream.id,
        capsuleId: overview.liveStream.capsuleId,
        muxLiveStreamId: overview.liveStream.muxLiveStreamId,
        latencyMode: overview.liveStream.latencyMode,
        lastSeenAt: overview.liveStream.lastSeenAt,
        lastActiveAt: overview.liveStream.lastActiveAt,
      },
    },
    { status: 200, headers: { "Cache-Control": "no-store" } },
  );
}
