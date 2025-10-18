import { NextResponse } from "next/server";

export const runtime = "nodejs";

import {
  ensureUserFromRequest,
  mergeUserPayloadFromRequest,
  resolveUserKey,
  type IncomingUserPayload,
} from "@/lib/auth/payload";
import { resolvePostId } from "@/lib/supabase/posts";
import { fetchPostCoreById, listPollVotesForPost, upsertPollVote } from "@/server/posts/repository";

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);

  const rawPostId =
    (typeof body?.postId === "string" && body.postId) ||
    (typeof body?.post_id === "string" && body.post_id) ||
    null;

  const postIdInput = String(rawPostId ?? "").trim();

  if (!postIdInput) {
    return NextResponse.json({ error: "postId required" }, { status: 400 });
  }

  const optionIndexValue = (body?.optionIndex ?? body?.option_index) as unknown;

  const optionIndex = Number(optionIndexValue);

  if (!Number.isFinite(optionIndex) || optionIndex < 0) {
    return NextResponse.json({ error: "optionIndex required" }, { status: 400 });
  }

  const baseUserPayload = (body?.user as IncomingUserPayload | undefined) ?? {};

  const mergedUserPayload = mergeUserPayloadFromRequest(req, baseUserPayload);

  const userKey = await resolveUserKey(mergedUserPayload);

  if (!userKey) {
    return NextResponse.json({ error: "auth required" }, { status: 401 });
  }

  const userId = await ensureUserFromRequest(req, baseUserPayload);

  if (!userId) {
    return NextResponse.json({ error: "auth required" }, { status: 401 });
  }

  const postId = await resolvePostId(postIdInput);

  if (!postId) {
    return NextResponse.json({ error: "post not found" }, { status: 404 });
  }

  try {
    await upsertPollVote(postId, userKey, optionIndex);

    const voteRows = await listPollVotesForPost(postId);

    const countsMap = new Map<number, number>();
    voteRows.forEach((row) => {
      const index = Number(row.option_index) || 0;
      countsMap.set(index, (countsMap.get(index) ?? 0) + 1);
    });

    let poll: unknown = null;
    let mediaPrompt: string | null = null;

    try {
      const pollCore = await fetchPostCoreById(postId);
      poll = pollCore?.poll ?? null;
      mediaPrompt = typeof pollCore?.media_prompt === "string" ? pollCore.media_prompt : null;
    } catch (pollFetchError) {
      console.warn("Poll post fetch failed", pollFetchError);
    }

    if (!poll && typeof mediaPrompt === "string" && mediaPrompt.startsWith("__POLL__")) {
      try {
        poll = JSON.parse(mediaPrompt.slice(8));
      } catch {
        poll = null;
      }
    }

    const optionsLength = Array.isArray((poll as { options?: unknown[] } | null)?.options)
      ? (poll as { options: unknown[] }).options.length
      : 0;

    const optionKeys = Array.from(countsMap.keys());
    const maxIndex = optionKeys.length ? Math.max(...optionKeys) : -1;
    const computedLength = Math.max(maxIndex + 1, optionsLength);
    const finalLength = computedLength > 0 ? computedLength : optionsLength;

    const counts = Array.from({ length: finalLength }, (_, idx) => countsMap.get(idx) ?? 0);

    return NextResponse.json({ success: true, counts });
  } catch (error) {
    console.error("Poll vote error", error);

    return NextResponse.json({ error: "Failed to record vote" }, { status: 500 });
  }
}
