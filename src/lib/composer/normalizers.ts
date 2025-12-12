"use client";

import { ensurePollStructure, type ComposerDraft } from "@/lib/composer/draft";

export function normalizeDraftFromPost(post: Record<string, unknown>): ComposerDraft {
  const rawKind = typeof post.kind === "string" ? post.kind.toLowerCase() : "text";
  const content = typeof post.content === "string" ? post.content : "";
  const mediaUrl =
    typeof post.mediaUrl === "string"
      ? post.mediaUrl
      : typeof post.media_url === "string"
        ? String(post.media_url)
        : null;
  const mediaPrompt =
    typeof post.mediaPrompt === "string"
      ? post.mediaPrompt
      : typeof post.media_prompt === "string"
        ? String(post.media_prompt)
        : null;
  const mediaThumbnail =
    typeof post.thumbnailUrl === "string"
      ? post.thumbnailUrl
      : typeof post.thumbnail_url === "string"
        ? String(post.thumbnail_url)
        : null;
  const playbackUrl =
    typeof post.playbackUrl === "string"
      ? post.playbackUrl
      : typeof post.playback_url === "string"
        ? String(post.playback_url)
        : null;
  const muxPlaybackId =
    typeof post.muxPlaybackId === "string"
      ? post.muxPlaybackId
      : typeof post.mux_playback_id === "string"
        ? String(post.mux_playback_id)
        : null;
  const muxAssetId =
    typeof post.muxAssetId === "string"
      ? post.muxAssetId
      : typeof post.mux_asset_id === "string"
        ? String(post.mux_asset_id)
        : null;
  const durationSecondsRaw =
    typeof post.mediaDurationSeconds === "number"
      ? post.mediaDurationSeconds
      : typeof post.duration_seconds === "number"
        ? post.duration_seconds
        : typeof post.durationSeconds === "number"
          ? post.durationSeconds
          : null;
  const durationSeconds =
    typeof durationSecondsRaw === "number" && Number.isFinite(durationSecondsRaw)
      ? Number(durationSecondsRaw)
      : null;
  const videoRunId =
    typeof (post as { videoRunId?: unknown }).videoRunId === "string"
      ? ((post as { videoRunId: string }).videoRunId ?? "").trim() || null
      : typeof (post as { video_run_id?: unknown }).video_run_id === "string"
        ? ((post as { video_run_id: string }).video_run_id ?? "").trim() || null
        : null;
  const videoRunStatusRaw =
    typeof (post as { videoRunStatus?: unknown }).videoRunStatus === "string"
      ? ((post as { videoRunStatus: string }).videoRunStatus ?? "").trim().toLowerCase()
      : typeof (post as { video_run_status?: unknown }).video_run_status === "string"
        ? ((post as { video_run_status: string }).video_run_status ?? "")
            .trim()
            .toLowerCase()
        : null;
  const allowedRunStatuses = new Set(["pending", "running", "succeeded", "failed"]);
  const videoRunStatus =
    videoRunStatusRaw && allowedRunStatuses.has(videoRunStatusRaw)
      ? (videoRunStatusRaw as ComposerDraft["videoRunStatus"])
      : null;
  const videoRunError =
    typeof (post as { videoRunError?: unknown }).videoRunError === "string"
      ? ((post as { videoRunError: string }).videoRunError ?? "").trim() || null
      : typeof (post as { video_run_error?: unknown }).video_run_error === "string"
        ? ((post as { video_run_error: string }).video_run_error ?? "").trim() || null
        : null;
  const memoryId =
    typeof (post as { memoryId?: unknown }).memoryId === "string"
      ? ((post as { memoryId: string }).memoryId ?? "").trim() || null
      : typeof (post as { memory_id?: unknown }).memory_id === "string"
        ? ((post as { memory_id: string }).memory_id ?? "").trim() || null
        : null;
  let poll: { question: string; options: string[]; thumbnails?: (string | null)[] | null } | null = null;
  const pollValue = post.poll;
  if (pollValue && typeof pollValue === "object") {
    const pollRecord = pollValue as Record<string, unknown>;
    const question =
      typeof pollRecord.question === "string" ? pollRecord.question.trim() : "";
    const optionsRaw = Array.isArray(pollRecord.options) ? pollRecord.options : [];
    const options = optionsRaw
      .map((option: unknown) => String(option ?? ""))
      .map((option) => option.trim());
    const thumbsRaw = Array.isArray(pollRecord.thumbnails) ? pollRecord.thumbnails : [];
    const thumbnails = thumbsRaw.map((entry: unknown) => {
      if (typeof entry === "string") return entry.trim();
      if (entry == null) return "";
      return String(entry).trim();
    });
    const structured = ensurePollStructure({
      kind: "poll",
      content,
      mediaUrl,
      mediaPrompt,
      poll: { question, options, thumbnails },
    });
    poll = structured;
  }
  let kind = rawKind || (poll ? "poll" : "text");
  if (poll && String(kind).toLowerCase() === "text") {
    kind = "poll";
  }
  if (!kind) {
    kind = poll ? "poll" : "text";
  }
  const suggestionsValue = post.suggestions;
  const suggestions = Array.isArray(suggestionsValue)
    ? suggestionsValue
        .map((suggestion: unknown) => {
          if (typeof suggestion === "string") return suggestion.trim();
          if (suggestion == null) return "";
          return String(suggestion).trim();
        })
        .filter((value) => value.length > 0)
    : undefined;
  const draft: ComposerDraft = {
    kind,
    title: typeof post.title === "string" ? post.title : null,
    content,
    mediaUrl,
    mediaPrompt,
    poll,
  };
  draft.mediaThumbnailUrl = mediaThumbnail ?? null;
  draft.mediaPlaybackUrl = playbackUrl ?? null;
  draft.muxPlaybackId = muxPlaybackId ?? null;
  draft.muxAssetId = muxAssetId ?? null;
  draft.mediaDurationSeconds = durationSeconds ?? null;
  draft.videoRunId = videoRunId;
  draft.videoRunStatus = videoRunStatus ?? null;
  draft.videoRunError = videoRunError ?? null;
  draft.memoryId = memoryId ?? null;
  if (suggestions && suggestions.length) {
    draft.suggestions = suggestions;
  }
  return draft;
}
