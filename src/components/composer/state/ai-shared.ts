import { ensurePollStructure, type ComposerDraft } from "@/lib/composer/draft";
import type { ComposerChatMessage } from "@/lib/composer/chat-types";

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
  nextRaw: Record<string, unknown> | null,
  draft: ComposerDraft,
): Record<string, unknown> {
  const merged: Record<string, unknown> = {};
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

  const setNullableString = (value: string | null | undefined, key: string) => {
    if (typeof value === "string" && value.trim().length) {
      merged[key] = value.trim();
      return true;
    }
    if (value === null) {
      delete merged[key];
      return false;
    }
    return false;
  };

  setNullableString(draft.mediaUrl, "mediaUrl");
  setNullableString(draft.mediaUrl, "media_url");
  setNullableString(draft.mediaPrompt, "mediaPrompt");
  setNullableString(draft.mediaPrompt, "media_prompt");
  setNullableString(draft.mediaThumbnailUrl, "thumbnailUrl");
  setNullableString(draft.mediaThumbnailUrl, "thumbnail_url");
  setNullableString(draft.mediaPlaybackUrl, "playbackUrl");
  setNullableString(draft.mediaPlaybackUrl, "playback_url");
  setNullableString(draft.muxPlaybackId, "muxPlaybackId");
  setNullableString(draft.muxPlaybackId, "mux_playback_id");
  setNullableString(draft.muxAssetId, "muxAssetId");
  setNullableString(draft.muxAssetId, "mux_asset_id");

  if (typeof draft.mediaDurationSeconds === "number" && Number.isFinite(draft.mediaDurationSeconds)) {
    const duration = Number(draft.mediaDurationSeconds);
    merged.mediaDurationSeconds = duration;
    merged.duration_seconds = duration;
  } else if (draft.mediaDurationSeconds === null) {
    delete merged.mediaDurationSeconds;
    delete merged.duration_seconds;
  }

  setNullableString(draft.videoRunId, "videoRunId");
  setNullableString(draft.videoRunId, "video_run_id");

  if (typeof draft.videoRunStatus === "string" && draft.videoRunStatus.trim().length) {
    const status = draft.videoRunStatus.trim().toLowerCase();
    merged.videoRunStatus = status;
    merged.video_run_status = status;
  } else if (draft.videoRunStatus === null) {
    delete merged.videoRunStatus;
    delete merged.video_run_status;
  }

  setNullableString(draft.videoRunError, "videoRunError");
  setNullableString(draft.videoRunError, "video_run_error");
  setNullableString(draft.memoryId, "memoryId");
  setNullableString(draft.memoryId, "memory_id");

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
