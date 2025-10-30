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
  let poll: { question: string; options: string[] } | null = null;
  const pollValue = post.poll;
  if (pollValue && typeof pollValue === "object") {
    const pollRecord = pollValue as Record<string, unknown>;
    const question =
      typeof pollRecord.question === "string" ? pollRecord.question.trim() : "";
    const optionsRaw = Array.isArray(pollRecord.options) ? pollRecord.options : [];
    const options = optionsRaw
      .map((option: unknown) => String(option ?? ""))
      .map((option) => option.trim());
    const structured = ensurePollStructure({
      kind: "poll",
      content,
      mediaUrl,
      mediaPrompt,
      poll: { question, options },
    });
    poll = structured;
  }
  let kind = rawKind || "text";
  if (!kind) {
    kind = "text";
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
  if (suggestions && suggestions.length) {
    draft.suggestions = suggestions;
  }
  return draft;
}
