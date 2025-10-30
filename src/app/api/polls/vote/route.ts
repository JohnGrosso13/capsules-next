import { NextResponse } from "next/server";

export const runtime = "nodejs";

import { ensureUserFromRequest, mergeUserPayloadFromRequest, type IncomingUserPayload } from "@/lib/auth/payload";
import { fetchPostRowByIdentifier } from "@/lib/supabase/posts";
import {
  fetchPostCoreById,
  listPollVoteAggregates,
  listPollVotesForPost,
  fetchUserKeyById,
  updateUserKeyById,
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

  const userId = await ensureUserFromRequest(req, mergedUserPayload);

  if (!userId) {
    return NextResponse.json({ error: "auth required" }, { status: 401 });
  }

  console.info("[polls.vote] incoming", { postId: postIdInput, optionIndex, userId });
  let userKey = await fetchUserKeyById(userId);
  if (!userKey) {
    const fallbackKey = typeof mergedUserPayload?.key === "string" ? mergedUserPayload.key.trim() : "";
    if (fallbackKey.length) {
      try {
        await updateUserKeyById(userId, fallbackKey);
        userKey = fallbackKey;
        console.info("[polls.vote] assigned fallback user key", { userId, userKey });
      } catch (assignError) {
        console.warn("Failed to assign user key for poll vote", assignError);
      }
    }
  }

  if (!userKey) {
    console.warn("[polls.vote] missing user key", { userId });
    return NextResponse.json({ error: "user key unavailable" }, { status: 403 });
  }

  const targetPost = await fetchPostRowByIdentifier(postIdInput);
  if (!targetPost) {
    console.warn("[polls.vote] post not found", { postId: postIdInput });
    return NextResponse.json({ error: "post not found" }, { status: 404 });
  }
  const postId =
    typeof targetPost.id === "string"
      ? targetPost.id
      : typeof targetPost.id === "number"
        ? String(targetPost.id)
        : null;
  if (!postId?.trim()) {
    console.warn("[polls.vote] post missing identifier", { postId: postIdInput, targetPost });
    return NextResponse.json({ error: "post not found" }, { status: 404 });
  }

  try {
    await upsertPollVote(postId, userKey, optionIndex, userId);
    console.info("[polls.vote] upsert success", { postId, userKey, optionIndex });

    const pollCorePromise = fetchPostCoreById(postId).catch((pollFetchError) => {
      console.warn("Poll post fetch failed", pollFetchError);
      return null;
    });

    const countsMap = new Map<number, number>();
    try {
      const aggregateRows = await listPollVoteAggregates([postId]);
      aggregateRows
        .filter((row) => {
          const rowPostId =
            typeof row.post_id === "string"
              ? row.post_id
              : typeof row.post_id === "number"
                ? String(row.post_id)
                : null;
          return rowPostId === postId;
        })
        .forEach((row) => {
          const indexRaw =
            typeof row.option_index === "number"
              ? row.option_index
              : Number(row.option_index ?? 0);
          const countRaw =
            typeof row.vote_count === "number"
              ? row.vote_count
              : Number(row.vote_count ?? 0);
          if (!Number.isFinite(indexRaw)) return;
          const normalizedIndex = Math.max(0, Math.trunc(indexRaw));
          const normalizedCount = Number.isFinite(countRaw)
            ? Math.max(0, Math.trunc(countRaw))
            : 0;
          countsMap.set(normalizedIndex, normalizedCount);
        });
    } catch (aggregateError) {
      console.warn("poll vote aggregate query failed; falling back to row scan", aggregateError);
    }

    if (countsMap.size === 0) {
      const voteRows = await listPollVotesForPost(postId);
      voteRows.forEach((row) => {
        const indexRaw =
          typeof row.option_index === "number"
            ? row.option_index
            : Number(row.option_index ?? 0);
        if (!Number.isFinite(indexRaw)) return;
        const normalizedIndex = Math.max(0, Math.trunc(indexRaw));
        countsMap.set(normalizedIndex, (countsMap.get(normalizedIndex) ?? 0) + 1);
      });
    }

    const pollCore = await pollCorePromise;
    let poll: unknown = pollCore?.poll ?? null;
    let mediaPrompt: string | null =
      typeof pollCore?.media_prompt === "string" ? pollCore.media_prompt : null;
    let pollAuthorId: string | null =
      typeof pollCore?.author_user_id === "string" && pollCore.author_user_id
        ? pollCore.author_user_id
        : null;
    let pollClientId: string | null =
      typeof pollCore?.client_id === "string" && pollCore.client_id ? pollCore.client_id : null;
    let pollCreatedAt: string | null = null;
    if (pollCore && typeof pollCore === "object") {
      const createdCandidate = (pollCore as { created_at?: unknown }).created_at;
      pollCreatedAt = typeof createdCandidate === "string" ? createdCandidate : null;
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

    const counts = Array.from({ length: finalLength }, (_, idx) => {
      const value = countsMap.get(idx) ?? 0;
      const numeric = typeof value === "number" ? value : Number(value);
      if (!Number.isFinite(numeric)) return 0;
      return Math.max(0, Math.trunc(numeric));
    });

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
      const normalizedCounts = normalizedOptions.map((_, index) => counts[index] ?? 0);
      const totalVotes = normalizedCounts.reduce((sum, value) => sum + value, 0);
      record.question = normalizedQuestion;
      record.options = normalizedOptions;
      record.counts = normalizedCounts;
      record.totalVotes = totalVotes;
      record.updatedAt = new Date().toISOString();

      void (async () => {
        try {
          await updatePostPollJson(postId, record);
        } catch (pollUpdateError) {
          console.warn("Poll JSON update failed", pollUpdateError);
        }
      })();

      if (pollAuthorId && pollClientId) {
        const snapshotCounts = normalizedCounts.slice();
        const ownerId = pollAuthorId;
        const clientId = pollClientId;
        void (async () => {
          try {
            await upsertPollMemorySnapshot({
              ownerId,
              postClientId: clientId,
              postRecordId: postId,
              poll: { question: normalizedQuestion, options: normalizedOptions },
              counts: snapshotCounts,
              eventAt: pollCreatedAt,
            });
          } catch (memoryError) {
            console.warn("poll memory snapshot background failed", memoryError);
          }
        })();
      }
    }

    console.info("[polls.vote] tally", { postId, counts });
    return NextResponse.json({ success: true, counts });
  } catch (error) {
    console.error("Poll vote error", error);

    return NextResponse.json({ error: "Failed to record vote" }, { status: 500 });
  }
}
