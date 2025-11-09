"use client";

import type { ComposerMemorySavePayload } from "@/components/composer/types";

export type SaveComposerItemParams = {
  payload: ComposerMemorySavePayload;
  capsuleId?: string | null;
  envelope?: Record<string, unknown> | null;
};

export type SaveComposerItemResult = {
  memoryId: string | null;
  message: string | null;
};

export async function saveComposerItem({
  payload,
  capsuleId,
  envelope,
}: SaveComposerItemParams): Promise<SaveComposerItemResult> {
  const metadata: Record<string, unknown> = {
    source: "ai-composer",
    category: "capsule_creation",
    kind: payload.kind,
  };
  if (payload.prompt) metadata.prompt = payload.prompt;
  if (payload.downloadUrl) metadata.download_url = payload.downloadUrl;
  if (payload.thumbnailUrl) metadata.thumbnail_url = payload.thumbnailUrl;
  if (payload.muxPlaybackId) metadata.mux_playback_id = payload.muxPlaybackId;
  if (payload.muxAssetId) metadata.mux_asset_id = payload.muxAssetId;
  if (payload.runId) metadata.video_run_id = payload.runId;
  if (payload.durationSeconds != null) {
    metadata.duration_seconds = payload.durationSeconds;
  }
  if (capsuleId) {
    metadata.capsule_id = capsuleId;
  }
  if (payload.metadata && typeof payload.metadata === "object") {
    Object.assign(metadata, payload.metadata);
  }

  const body = {
    user: envelope,
    item: {
      title: payload.title,
      description: payload.description,
      kind: payload.kind,
      mediaUrl: payload.mediaUrl,
      mediaType: payload.mediaType ?? null,
      downloadUrl: payload.downloadUrl ?? null,
      thumbnailUrl: payload.thumbnailUrl ?? null,
      prompt: payload.prompt ?? null,
      muxPlaybackId: payload.muxPlaybackId ?? null,
      muxAssetId: payload.muxAssetId ?? null,
      durationSeconds: payload.durationSeconds ?? null,
      runId: payload.runId ?? null,
      tags: payload.tags ?? null,
      metadata,
    },
  };

  const response = await fetch("/api/composer/save", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    throw new Error(errorText || `Save request failed (${response.status})`);
  }
  const result = (await response.json().catch(() => null)) as {
    memoryId?: string | null;
    message?: string | null;
  } | null;

  const memoryId =
    typeof result?.memoryId === "string" ? result.memoryId.trim() || null : null;
  const message = typeof result?.message === "string" ? result.message : null;

  return {
    memoryId,
    message,
  };
}
