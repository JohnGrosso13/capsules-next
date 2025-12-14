import { NextResponse } from "next/server";
import { z } from "zod";

import { ensureUserFromRequest } from "@/lib/auth/payload";
import { insertPostShare, fetchPostShareCount } from "@/server/posts/repository";
import { parseJsonBody, returnError } from "@/server/validation/http";

export const runtime = "nodejs";

const shareRequestSchema = z.object({
  postId: z.string().uuid(),
  capsuleId: z.string().uuid().nullable().optional(),
  channel: z.string().trim().max(64).nullable().optional(),
});

export async function POST(req: Request) {
  const parsed = await parseJsonBody(req, shareRequestSchema);
  if (!parsed.success) return parsed.response;
  const { postId, capsuleId, channel } = parsed.data;

  // Allow guests to share; ignore auth failures.
  const userId = await ensureUserFromRequest(req, null, { allowGuests: true }).catch(() => null);

  try {
    await insertPostShare({
      postId,
      capsuleId: capsuleId ?? null,
      userId,
      channel: channel ?? null,
    });
  } catch (error) {
    console.error("post share insert failed", error);
    return returnError(500, "share_failed", "Failed to record share");
  }

  try {
    const shares = await fetchPostShareCount(postId);
    return NextResponse.json({ success: true, shares });
  } catch (error) {
    console.warn("post share count fetch failed", error);
    return NextResponse.json({ success: true, shares: null });
  }
}
