"use client";

import { safeRandomUUID } from "@/lib/random";
import type { ComposerDraft } from "@/lib/composer/draft";

import { sanitizePollFromDraft } from "./poll";

type AuthorMeta = { name: string | null; avatar: string | null } | undefined;

export function buildPostPayload(
  draft: ComposerDraft,
  rawPost: Record<string, unknown> | null,
  author?: AuthorMeta,
): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    client_id: typeof rawPost?.client_id === "string" ? rawPost.client_id : safeRandomUUID(),
    kind: (draft.kind ?? "text").toLowerCase(),
    content: draft.content ?? "",
    source: rawPost?.source ?? "ai-prompter",
  };
  if (author?.name) {
    payload.userName = author.name;
    payload.user_name = author.name;
  }
  if (author?.avatar) {
    payload.userAvatar = author.avatar;
    payload.user_avatar = author.avatar;
  }
  if (draft.title && draft.title.trim()) payload.title = draft.title.trim();
  if (draft.mediaUrl && draft.mediaUrl.trim()) {
    const media = draft.mediaUrl.trim();
    payload.mediaUrl = media;
  }
  if (draft.mediaPrompt && draft.mediaPrompt.trim()) {
    const prompt = draft.mediaPrompt.trim();
    payload.mediaPrompt = prompt;
    payload.media_prompt = prompt;
  }
  if (typeof draft.mediaThumbnailUrl === "string" && draft.mediaThumbnailUrl.trim().length) {
    const thumb = draft.mediaThumbnailUrl.trim();
    payload.thumbnailUrl = thumb;
    payload.thumbnail_url = thumb;
  } else if (draft.mediaThumbnailUrl === null) {
    payload.thumbnailUrl = null;
    payload.thumbnail_url = null;
  }
  if (typeof draft.mediaPlaybackUrl === "string" && draft.mediaPlaybackUrl.trim().length) {
    const playback = draft.mediaPlaybackUrl.trim();
    payload.playbackUrl = playback;
    payload.playback_url = playback;
  } else if (draft.mediaPlaybackUrl === null) {
    payload.playbackUrl = null;
    payload.playback_url = null;
  }
  if (typeof draft.muxPlaybackId === "string" && draft.muxPlaybackId.trim().length) {
    const playbackId = draft.muxPlaybackId.trim();
    payload.muxPlaybackId = playbackId;
    payload.mux_playback_id = playbackId;
  } else if (draft.muxPlaybackId === null) {
    payload.muxPlaybackId = null;
    payload.mux_playback_id = null;
  }
  if (typeof draft.muxAssetId === "string" && draft.muxAssetId.trim().length) {
    const assetId = draft.muxAssetId.trim();
    payload.muxAssetId = assetId;
    payload.mux_asset_id = assetId;
  } else if (draft.muxAssetId === null) {
    payload.muxAssetId = null;
    payload.mux_asset_id = null;
  }
  if (
    typeof draft.mediaDurationSeconds === "number" &&
    Number.isFinite(draft.mediaDurationSeconds)
  ) {
    const duration = Number(draft.mediaDurationSeconds);
    payload.mediaDurationSeconds = duration;
    payload.duration_seconds = duration;
  } else if (draft.mediaDurationSeconds === null) {
    payload.mediaDurationSeconds = null;
    payload.duration_seconds = null;
  }
  if (typeof draft.videoRunId === "string" && draft.videoRunId.trim().length) {
    const runId = draft.videoRunId.trim();
    payload.videoRunId = runId;
    payload.video_run_id = runId;
  } else if (draft.videoRunId === null) {
    payload.videoRunId = null;
    payload.video_run_id = null;
  }
  if (typeof draft.videoRunStatus === "string" && draft.videoRunStatus.trim().length) {
    const status = draft.videoRunStatus.trim().toLowerCase();
    payload.videoRunStatus = status;
    payload.video_run_status = status;
  } else if (draft.videoRunStatus === null) {
    payload.videoRunStatus = null;
    payload.video_run_status = null;
  }
  if (typeof draft.videoRunError === "string" && draft.videoRunError.trim().length) {
    const errorText = draft.videoRunError.trim();
    payload.videoRunError = errorText;
    payload.video_run_error = errorText;
  } else if (draft.videoRunError === null) {
    payload.videoRunError = null;
    payload.video_run_error = null;
  }
  if (typeof draft.memoryId === "string" && draft.memoryId.trim().length) {
    const memoryId = draft.memoryId.trim();
    payload.memoryId = memoryId;
    payload.memory_id = memoryId;
  } else if (draft.memoryId === null) {
    payload.memoryId = null;
    payload.memory_id = null;
  }
  const sanitizedPoll = sanitizePollFromDraft(draft);
  if (sanitizedPoll) {
    payload.poll = sanitizedPoll;
  } else {
    delete payload.poll;
  }
  if (rawPost?.capsule_id) payload.capsule_id = rawPost.capsule_id;
  if (rawPost?.capsuleId) payload.capsuleId = rawPost.capsuleId;
  return payload;
}
