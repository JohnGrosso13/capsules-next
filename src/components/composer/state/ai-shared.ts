import { ensurePollStructure, type ComposerDraft } from "@/lib/composer/draft";
import type { ComposerChatMessage } from "@/lib/composer/chat-types";

export const IMAGE_INTENT_REGEX =
  /\b(image|visual|graphic|photo|picture|illustration|art|banner|logo|avatar|thumbnail|poster|cover)\b/i;

export function appendCapsuleContext(
  post: Record<string, unknown>,
  capsuleId: string | null,
): Record<string, unknown> {
  if (!capsuleId) return post;
  const hasCapsule =
    (typeof (post as { capsuleId?: unknown }).capsuleId === "string" &&
      ((post as { capsuleId?: string }).capsuleId ?? "").trim().length > 0) ||
    (typeof (post as { capsule_id?: unknown }).capsule_id === "string" &&
      ((post as { capsule_id?: string }).capsule_id ?? "").trim().length > 0);
  if (hasCapsule) return post;
  return {
    ...post,
    capsuleId,
    capsule_id: capsuleId,
  };
}

export function mergeComposerRawPost(
  prevRaw: Record<string, unknown> | null,
  nextRaw: Record<string, unknown> | null,
  draft: ComposerDraft,
): Record<string, unknown> {
  const merged: Record<string, unknown> = { ...(prevRaw ?? {}) };
  if (nextRaw) {
    for (const [key, value] of Object.entries(nextRaw)) {
      if (value === undefined) continue;
      merged[key] = value;
    }
  }

  if (typeof draft.kind === "string" && draft.kind.trim().length) {
    merged.kind = draft.kind;
  }
  if (typeof draft.title === "string") {
    merged.title = draft.title;
  } else if (draft.title === null) {
    merged.title = null;
  }

  if (typeof draft.content === "string") {
    merged.content = draft.content;
  }

  if (typeof draft.mediaUrl === "string" && draft.mediaUrl.trim().length) {
    merged.mediaUrl = draft.mediaUrl;
    merged.media_url = draft.mediaUrl;
  } else if (draft.mediaUrl === null) {
    delete merged.mediaUrl;
    delete merged.media_url;
  }

  if (typeof draft.mediaPrompt === "string" && draft.mediaPrompt.trim().length) {
    merged.mediaPrompt = draft.mediaPrompt;
    merged.media_prompt = draft.mediaPrompt;
  } else if (draft.mediaPrompt === null) {
    delete merged.mediaPrompt;
    delete merged.media_prompt;
  }

  if (typeof draft.mediaThumbnailUrl === "string" && draft.mediaThumbnailUrl.trim().length) {
    const thumb = draft.mediaThumbnailUrl.trim();
    merged.thumbnailUrl = thumb;
    merged.thumbnail_url = thumb;
  } else if (draft.mediaThumbnailUrl === null) {
    delete merged.thumbnailUrl;
    delete merged.thumbnail_url;
  }

  if (typeof draft.mediaPlaybackUrl === "string" && draft.mediaPlaybackUrl.trim().length) {
    const playback = draft.mediaPlaybackUrl.trim();
    merged.playbackUrl = playback;
    merged.playback_url = playback;
  } else if (draft.mediaPlaybackUrl === null) {
    delete merged.playbackUrl;
    delete merged.playback_url;
  }

  if (typeof draft.muxPlaybackId === "string" && draft.muxPlaybackId.trim().length) {
    const playbackId = draft.muxPlaybackId.trim();
    merged.muxPlaybackId = playbackId;
    merged.mux_playback_id = playbackId;
  } else if (draft.muxPlaybackId === null) {
    delete merged.muxPlaybackId;
    delete merged.mux_playback_id;
  }

  if (typeof draft.muxAssetId === "string" && draft.muxAssetId.trim().length) {
    const assetId = draft.muxAssetId.trim();
    merged.muxAssetId = assetId;
    merged.mux_asset_id = assetId;
  } else if (draft.muxAssetId === null) {
    delete merged.muxAssetId;
    delete merged.mux_asset_id;
  }

  if (
    typeof draft.mediaDurationSeconds === "number" &&
    Number.isFinite(draft.mediaDurationSeconds)
  ) {
    const duration = Number(draft.mediaDurationSeconds);
    merged.mediaDurationSeconds = duration;
    merged.duration_seconds = duration;
  } else if (draft.mediaDurationSeconds === null) {
    delete merged.mediaDurationSeconds;
    delete merged.duration_seconds;
  }

  if (typeof draft.videoRunId === "string" && draft.videoRunId.trim().length) {
    const runId = draft.videoRunId.trim();
    merged.videoRunId = runId;
    merged.video_run_id = runId;
  } else if (draft.videoRunId === null) {
    delete merged.videoRunId;
    delete merged.video_run_id;
  }

  if (typeof draft.videoRunStatus === "string" && draft.videoRunStatus.trim().length) {
    const status = draft.videoRunStatus.trim().toLowerCase();
    merged.videoRunStatus = status;
    merged.video_run_status = status;
  } else if (draft.videoRunStatus === null) {
    delete merged.videoRunStatus;
    delete merged.video_run_status;
  }

  if (typeof draft.videoRunError === "string" && draft.videoRunError.trim().length) {
    const errorMessage = draft.videoRunError.trim();
    merged.videoRunError = errorMessage;
    merged.video_run_error = errorMessage;
  } else if (draft.videoRunError === null) {
    delete merged.videoRunError;
    delete merged.video_run_error;
  }

  if (typeof draft.memoryId === "string" && draft.memoryId.trim().length) {
    const memoryId = draft.memoryId.trim();
    merged.memoryId = memoryId;
    merged.memory_id = memoryId;
  } else if (draft.memoryId === null) {
    delete merged.memoryId;
    delete merged.memory_id;
  }

  if (draft.poll) {
    const structured = ensurePollStructure(draft);
    merged.poll = {
      question: structured.question,
      options: [...structured.options],
    };
  } else if (!draft.poll) {
    delete merged.poll;
  }

  return merged;
}

export function mergeComposerChatHistory(
  previous: ComposerChatMessage[] | null | undefined,
  incoming: ComposerChatMessage[],
): ComposerChatMessage[] {
  const base = Array.isArray(previous) ? previous.slice() : [];
  const next = Array.isArray(incoming) ? incoming.slice() : [];
  if (!base.length && !next.length) return [];

  const normalizeContentKey = (entry: ComposerChatMessage | null | undefined): string => {
    if (!entry) return "";
    return `${entry.role}|${(entry.content ?? "").trim().toLowerCase()}`;
  };

  if (base.length && next.length) {
    const incomingUserKeys = new Set(
      next
        .filter((message) => message?.role === "user")
        .map((message) => normalizeContentKey(message))
        .filter((key) => key.length > 0),
    );
    while (base.length) {
      const tail = base[base.length - 1];
      if (!tail || tail.role !== "user") break;
      const key = normalizeContentKey(tail);
      if (!key || !incomingUserKeys.has(key)) break;
      // Drop optimistic user entries when the server echoed the same text
      base.pop();
    }
  }

  const byId = new Map<string, ComposerChatMessage>();

  const buildKey = (m: ComposerChatMessage): string => {
    const content = (m.content ?? "").trim().toLowerCase();
    if (m.id && m.id.trim().length) return m.id.trim();
    if (content) return `${m.role}|${content}`;
    return `${m.role}|${(m.createdAt ?? "").trim() || "unknown"}`;
  };

  const push = (m: ComposerChatMessage) => {
    if (!m || typeof m !== "object") return;
    const key = buildKey(m);
    // Prefer the latest entry when keys collide (e.g., replacing optimistic user bubble with server copy)
    byId.set(key, m);
  };

  for (const entry of base) push(entry);
  for (const entry of next) push(entry);

  return Array.from(byId.values());
}
