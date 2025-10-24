import { NextResponse } from "next/server";

export const runtime = "nodejs";

import {
  ensureUserFromRequest,
  mergeUserPayloadFromRequest,
  resolveUserKey,
  type IncomingUserPayload,
} from "@/lib/auth/payload";
import { resolvePostId } from "@/lib/supabase/posts";
import {
  fetchPostCoreById,
  listPollVotesForPost,
  upsertPollVote,
  updatePostPollJson,
} from "@/server/posts/repository";
import { upsertPollMemorySnapshot } from "@/server/posts/service";

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
    await upsertPollVote(postId, userKey, optionIndex, userId);

    const voteRows = await listPollVotesForPost(postId);

    const countsMap = new Map<number, number>();
    voteRows.forEach((row) => {
      const index = Number(row.option_index) || 0;
      countsMap.set(index, (countsMap.get(index) ?? 0) + 1);
    });

    let poll: unknown = null;
    let mediaPrompt: string | null = null;
    let pollAuthorId: string | null = null;
    let pollClientId: string | null = null;
    let pollCreatedAt: string | null = null;

    try {
      const pollCore = await fetchPostCoreById(postId);
      poll = pollCore?.poll ?? null;
      mediaPrompt = typeof pollCore?.media_prompt === "string" ? pollCore.media_prompt : null;
      pollAuthorId =
        typeof pollCore?.author_user_id === "string" && pollCore.author_user_id
          ? pollCore.author_user_id
          : null;
      pollClientId =
        typeof pollCore?.client_id === "string" && pollCore.client_id ? pollCore.client_id : null;
      if (pollCore && typeof pollCore === "object") {
        const createdCandidate = (pollCore as { created_at?: unknown }).created_at;
        pollCreatedAt = typeof createdCandidate === "string" ? createdCandidate : null;
      }
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

    if (poll && typeof poll === "object" && !Array.isArray(poll)) {
      const record = { ...(poll as Record<string, unknown>) };
      const rawOptions = Array.isArray(record.options) ? record.options : [];
      const normalizedOptions = rawOptions.map((option, index) => {
        if (typeof option === "string") {
          const trimmed = option.trim();
          return trimmed.length ? trimmed : `Option ${index + 1}`;
        }
        if (typeof option === "number" && Number.isFinite(option)) {
          return String(option);
        }
        return `Option ${index + 1}`;
      });
      const normalizedQuestion =
        typeof record.question === "string" && record.question.trim().length
          ? record.question.trim()
          : "Community poll";
      const normalizedCounts = normalizedOptions.map((_, index) => {
        const value = counts[index] ?? 0;
        const numeric = typeof value === "number" ? value : Number(value);
        if (!Number.isFinite(numeric)) return 0;
        return Math.max(0, Math.trunc(numeric));
      });
      const totalVotes = normalizedCounts.reduce((sum, value) => sum + value, 0);
      record.question = normalizedQuestion;
      record.options = normalizedOptions;
      record.counts = normalizedCounts;
      record.totalVotes = totalVotes;
      record.updatedAt = new Date().toISOString();

      try {
        await updatePostPollJson(postId, record);
      } catch (pollUpdateError) {
        console.warn("Poll JSON update failed", pollUpdateError);
      }

      if (pollAuthorId && pollClientId) {
        await upsertPollMemorySnapshot({
          ownerId: pollAuthorId,
          postClientId: pollClientId,
          postRecordId: postId,
          poll: { question: normalizedQuestion, options: normalizedOptions },
          counts: normalizedCounts,
          eventAt: pollCreatedAt,
        });
      }
    }

    return NextResponse.json({ success: true, counts });
  } catch (error) {
    console.error("Poll vote error", error);

    return NextResponse.json({ error: "Failed to record vote" }, { status: 500 });
  }
}
