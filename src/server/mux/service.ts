import type { LiveStream } from "@mux/mux-node/resources/video/live-streams";
import type { Asset } from "@mux/mux-node/resources/video/assets";

import {
  buildMuxPlaybackUrl,
  createMuxLiveStream,
  fetchMuxLiveStream,
  resetMuxStreamKey,
  type MuxWebhookEvent,
} from "@/adapters/mux/server";
import {
  attachAssetToLiveStream,
  createLiveStreamRecord,
  createLiveStreamSession,
  createMuxAssetRecord,
  getAssetByMuxAssetId,
  getLiveStreamByCapsuleId,
  getLiveStreamByMuxId,
  findActiveSessionForStream,
  listAssetsForCapsule,
  listLiveStreamSessions,
  listPendingAiJobs,
  markWebhookEventProcessed,
  updateLiveStreamByMuxId,
  updateLiveStreamRecord,
  updateLiveStreamSession,
  updateMuxAssetRecord,
  insertWebhookEvent,
  type MuxAiJobRecord,
  type MuxAssetRecord,
  type MuxLiveStreamRecord,
  type MuxLiveStreamSessionRecord,
} from "@/server/mux/repository";
import {
  queueAssetHighlightSummaries,
  queueClipDetection,
  queueLiveTranscriptionStart,
  queueLiveTranscriptionStop,
} from "@/server/mux/pipeline";
import { muxAttemptSequence, muxWebhookObjectId } from "@/adapters/mux/server";
import { isMuxNotFoundError } from "@/adapters/mux/server";

const PRIMARY_INGEST_URL = "rtmps://global-live.mux.com:443/app";
const BACKUP_INGEST_URL = "rtmps://global-live-backup.mux.com:443/app";
const MAX_SESSION_HISTORY = 20;
const MAX_ASSET_HISTORY = 20;

type LiveStreamPlayback = {
  playbackId: string | null;
  playbackUrl: string | null;
  playbackPolicy: string | null;
};

type StreamIngestInfo = {
  primary: string | null;
  backup: string | null;
};

export type CapsuleLiveStreamOverview = {
  liveStream: MuxLiveStreamRecord;
  playback: LiveStreamPlayback;
  ingest: StreamIngestInfo & { streamKey: string; backupStreamKey: string | null };
  sessions: MuxLiveStreamSessionRecord[];
  assets: MuxAssetRecord[];
  aiJobs: MuxAiJobRecord[];
};

function selectPlayback(muxStream: LiveStream | null): LiveStreamPlayback {
  if (!muxStream?.playback_ids || !muxStream.playback_ids.length) {
    return { playbackId: null, playbackUrl: null, playbackPolicy: null };
  }
  const publicPlayback =
    muxStream.playback_ids.find((entry) => entry.policy === "public") ??
    muxStream.playback_ids[0];
  const playbackId = publicPlayback?.id ?? null;
  return {
    playbackId,
    playbackPolicy: publicPlayback?.policy ?? null,
    playbackUrl: playbackId ? buildMuxPlaybackUrl(playbackId) : null,
  };
}

function deriveIngestInfo(): StreamIngestInfo {
  return {
    primary: PRIMARY_INGEST_URL,
    backup: BACKUP_INGEST_URL,
  };
}

function ensureMetadata(meta: Record<string, unknown> | null | undefined): Record<string, unknown> {
  if (meta && typeof meta === "object") return { ...meta };
  return {};
}

function extractAssetPlayback(asset: Asset | null): LiveStreamPlayback {
  if (!asset?.playback_ids || !asset.playback_ids.length) {
    return { playbackId: null, playbackUrl: null, playbackPolicy: null };
  }
  const publicPlayback =
    asset.playback_ids.find((entry) => entry.policy === "public") ?? asset.playback_ids[0];
  const playbackId = publicPlayback?.id ?? null;
  return {
    playbackId,
    playbackPolicy: publicPlayback?.policy ?? null,
    playbackUrl: playbackId ? buildMuxPlaybackUrl(playbackId) : null,
  };
}

async function syncLiveStreamFromMux(
  record: MuxLiveStreamRecord,
  muxStream: LiveStream,
): Promise<MuxLiveStreamRecord> {
  const playback = selectPlayback(muxStream);
  const metadata = ensureMetadata(record.metadata);
  metadata.mux = {
    ...(metadata.mux as Record<string, unknown> | undefined),
    lastSyncAt: new Date().toISOString(),
    latency_mode: muxStream.latency_mode,
    reconnect_window: muxStream.reconnect_window ?? null,
    max_continuous_duration: muxStream.max_continuous_duration ?? null,
  };

  const updates = await updateLiveStreamRecord(record.id, {
    status: muxStream.status ?? record.status,
    latencyMode: muxStream.latency_mode ?? record.latencyMode,
    isLowLatency: muxStream.latency_mode
      ? muxStream.latency_mode === "low"
      : record.isLowLatency,
    reconnectWindowSeconds: muxStream.reconnect_window ?? record.reconnectWindowSeconds,
    playbackId: playback.playbackId ?? record.playbackId,
    playbackUrl: playback.playbackUrl ?? record.playbackUrl,
    playbackPolicy: playback.playbackPolicy ?? record.playbackPolicy,
    activeAssetId: muxStream.active_asset_id ?? record.activeAssetId,
    metadata,
  });

  return updates ?? record;
}

async function createLiveStreamFromMux(params: {
  capsuleId: string;
  ownerUserId: string;
  muxStream: LiveStream;
}): Promise<MuxLiveStreamRecord> {
  const playback = selectPlayback(params.muxStream);
  const metadata: Record<string, unknown> = {
    mux: {
      createdAt: params.muxStream.created_at ?? null,
      latency_mode: params.muxStream.latency_mode ?? null,
      reconnect_window: params.muxStream.reconnect_window ?? null,
    },
  };

  return createLiveStreamRecord({
    capsuleId: params.capsuleId,
    ownerUserId: params.ownerUserId,
    muxLiveStreamId: params.muxStream.id,
    streamKey: params.muxStream.stream_key,
    status: params.muxStream.status ?? "idle",
    latencyMode: params.muxStream.latency_mode ?? "low",
    isLowLatency: params.muxStream.latency_mode
      ? params.muxStream.latency_mode === "low"
      : true,
    reconnectWindowSeconds: params.muxStream.reconnect_window ?? null,
    streamKeyBackup: null,
    ingestUrl: PRIMARY_INGEST_URL,
    ingestUrlBackup: BACKUP_INGEST_URL,
    playbackId: playback.playbackId,
    playbackUrl: playback.playbackUrl,
    playbackPolicy: playback.playbackPolicy,
    metadata,
    activeAssetId: params.muxStream.active_asset_id ?? null,
  });
}

async function ensureLiveStreamRecord(params: {
  capsuleId: string;
  ownerUserId: string;
  latencyMode?: "low" | "reduced" | "standard";
}): Promise<MuxLiveStreamRecord> {
  const existing = await getLiveStreamByCapsuleId(params.capsuleId);
  if (existing) {
    try {
      const muxStream = await fetchMuxLiveStream(existing.muxLiveStreamId);
      return await syncLiveStreamFromMux(existing, muxStream);
    } catch (error) {
      if (!isMuxNotFoundError(error)) {
        console.warn("mux.ensureLiveStreamRecord.sync", error);
      }
      return existing;
    }
  }

  const muxStream = await createMuxLiveStream({
    playback_policies: ["public"],
    new_asset_settings: {
      playback_policies: ["public"],
      passthrough: `capsule:${params.capsuleId}`,
    },
    latency_mode: params.latencyMode ?? "low",
    reconnect_window: (params.latencyMode ?? "low") === "low" ? 30 : 60,
    use_slate_for_standard_latency: (params.latencyMode ?? "low") === "standard",
  });

  return createLiveStreamFromMux({
    capsuleId: params.capsuleId,
    ownerUserId: params.ownerUserId,
    muxStream,
  });
}

async function buildOverview(record: MuxLiveStreamRecord): Promise<CapsuleLiveStreamOverview> {
  const [sessions, assets, aiJobs] = await Promise.all([
    listLiveStreamSessions(record.id, { limit: MAX_SESSION_HISTORY }),
    listAssetsForCapsule(record.capsuleId, { limit: MAX_ASSET_HISTORY }),
    listPendingAiJobs(record.capsuleId, { limit: 50 }),
  ]);

  return {
    liveStream: record,
    playback: {
      playbackId: record.playbackId,
      playbackUrl: record.playbackUrl,
      playbackPolicy: record.playbackPolicy,
    },
    ingest: {
      primary: record.ingestUrl ?? PRIMARY_INGEST_URL,
      backup: record.ingestUrlBackup ?? BACKUP_INGEST_URL,
      streamKey: record.streamKey,
      backupStreamKey: record.streamKeyBackup,
    },
    sessions,
    assets,
    aiJobs,
  };
}

export async function ensureCapsuleLiveStream(params: {
  capsuleId: string;
  ownerUserId: string;
  latencyMode?: "low" | "reduced" | "standard";
}): Promise<CapsuleLiveStreamOverview> {
  const ensureParams: { capsuleId: string; ownerUserId: string; latencyMode?: "low" | "reduced" | "standard" } = {
    capsuleId: params.capsuleId,
    ownerUserId: params.ownerUserId,
  };
  if (params.latencyMode) {
    ensureParams.latencyMode = params.latencyMode;
  }
  const record = await ensureLiveStreamRecord(ensureParams);
  return buildOverview(record);
}

export async function getCapsuleLiveStreamOverview(
  capsuleId: string,
): Promise<CapsuleLiveStreamOverview | null> {
  const record = await getLiveStreamByCapsuleId(capsuleId);
  if (!record) return null;
  return buildOverview(record);
}

export async function rotateLiveStreamKeyForCapsule(params: {
  capsuleId: string;
  ownerUserId: string;
}): Promise<CapsuleLiveStreamOverview | null> {
  const record = await getLiveStreamByCapsuleId(params.capsuleId);
  if (!record) return null;
  try {
    const muxStream = await resetMuxStreamKey(record.muxLiveStreamId);
    const updated = await updateLiveStreamRecord(record.id, {
      streamKey: muxStream.stream_key,
      streamKeyBackup: null,
      metadata: {
        ...(record.metadata ?? {}),
        mux: {
          ...(ensureMetadata(record.metadata).mux as Record<string, unknown> | undefined),
          lastRotatedAt: new Date().toISOString(),
        },
      },
    });
    return buildOverview(updated ?? record);
  } catch (error) {
    console.error("mux.rotateLiveStreamKey.error", error);
    throw error;
  }
}

function normalizeEventTimestamp(raw: string | null | undefined): string {
  if (raw) {
    const parsed = Date.parse(raw);
    if (Number.isFinite(parsed)) {
      return new Date(parsed).toISOString();
    }
  }
  return new Date().toISOString();
}

function computeDurationSeconds(start: string | null, end: string | null): number | null {
  if (!start || !end) return null;
  const startMs = Date.parse(start);
  const endMs = Date.parse(end);
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) {
    return null;
  }
  return Math.round((endMs - startMs) / 1000);
}

function toPlainObject(data: unknown): Record<string, unknown> {
  if (data && typeof data === "object") {
    try {
      return JSON.parse(JSON.stringify(data)) as Record<string, unknown>;
    } catch (error) {
      console.warn("mux.webhook.serialize error", error);
    }
  }
  return { value: data ?? null };
}

async function ensureActiveSession(
  record: MuxLiveStreamRecord,
  status: "connected" | "active",
  eventTime: string,
): Promise<void> {
  const existing = await findActiveSessionForStream(record.id);
  if (existing) {
    await updateLiveStreamSession(existing.id, {
      status,
      startedAt: existing.startedAt ?? eventTime,
    });
    return;
  }

  await createLiveStreamSession({
    liveStreamId: record.id,
    capsuleId: record.capsuleId,
    muxLiveStreamId: record.muxLiveStreamId,
    status,
    startedAt: eventTime,
  });
}

async function finalizeActiveSession(
  record: MuxLiveStreamRecord,
  status: "idle" | "disconnected",
  eventTime: string,
): Promise<void> {
  const existing = await findActiveSessionForStream(record.id);
  if (!existing) return;
  const durationSeconds = computeDurationSeconds(existing.startedAt, eventTime);
  await updateLiveStreamSession(existing.id, {
    status,
    endedAt: eventTime,
    durationSeconds,
  });
}
async function handleLiveStreamWebhookEvent(event: MuxWebhookEvent): Promise<string> {
  const muxStream = (event.data ?? null) as LiveStream | null;
  if (!muxStream || typeof muxStream.id !== "string") {
    return "ignored";
  }

  const record = await getLiveStreamByMuxId(muxStream.id);
  if (!record) {
    console.warn("mux.liveStream event for unknown stream", muxStream.id, event.type);
    return "not_tracked";
  }

  const synced = await syncLiveStreamFromMux(record, muxStream);
  const eventTime = normalizeEventTimestamp(event.created_at);

  switch (event.type) {
    case "video.live_stream.connected": {
      await updateLiveStreamRecord(synced.id, {
        status: muxStream.status ?? "connected",
        lastSeenAt: eventTime,
      });
      await ensureActiveSession(synced, "connected", eventTime);
      return "processed";
    }
    case "video.live_stream.active": {
      await updateLiveStreamRecord(synced.id, {
        status: muxStream.status ?? "active",
        lastSeenAt: eventTime,
        lastActiveAt: eventTime,
      });
      await ensureActiveSession(synced, "active", eventTime);
      await queueLiveTranscriptionStart({
        capsuleId: synced.capsuleId,
        liveStreamId: synced.id,
        muxLiveStreamId: synced.muxLiveStreamId,
      });
      return "processed";
    }
    case "video.live_stream.disconnected": {
      await updateLiveStreamRecord(synced.id, {
        status: muxStream.status ?? "disconnected",
        lastSeenAt: eventTime,
        lastErrorAt: eventTime,
      });
      await finalizeActiveSession(synced, "disconnected", eventTime);
      await queueLiveTranscriptionStop({
        capsuleId: synced.capsuleId,
        liveStreamId: synced.id,
        muxLiveStreamId: synced.muxLiveStreamId,
      });
      return "processed";
    }
    case "video.live_stream.idle": {
      await updateLiveStreamRecord(synced.id, {
        status: muxStream.status ?? "idle",
        lastSeenAt: eventTime,
        lastIdleAt: eventTime,
      });
      await finalizeActiveSession(synced, "idle", eventTime);
      await queueLiveTranscriptionStop({
        capsuleId: synced.capsuleId,
        liveStreamId: synced.id,
        muxLiveStreamId: synced.muxLiveStreamId,
      });
      return "processed";
    }
    case "video.live_stream.recording":
    case "video.live_stream.updated":
    case "video.live_stream.enabled":
    case "video.live_stream.disabled":
    case "video.live_stream.warning": {
      await updateLiveStreamRecord(synced.id, {
        status: muxStream.status ?? synced.status,
        lastSeenAt: eventTime,
      });
      return "processed";
    }
    default:
      return "ignored";
  }
}
async function handleAssetWebhookEvent(event: MuxWebhookEvent): Promise<string> {
  const muxAsset = (event.data ?? null) as Asset | null;
  if (!muxAsset || typeof muxAsset.id !== "string") {
    return "ignored";
  }

  const muxLiveStreamId = muxAsset.live_stream_id ?? null;
  if (!muxLiveStreamId) {
    return "ignored";
  }

  const liveStreamRecord = await getLiveStreamByMuxId(muxLiveStreamId);
  if (!liveStreamRecord) {
    console.warn("mux.asset event for unknown live stream", muxLiveStreamId, event.type);
    return "not_tracked";
  }

  const eventTime = normalizeEventTimestamp(event.created_at);
  let assetRecord = await getAssetByMuxAssetId(muxAsset.id);
  const playback = extractAssetPlayback(muxAsset);

  if (!assetRecord) {
    assetRecord = await createMuxAssetRecord({
      capsuleId: liveStreamRecord.capsuleId,
      liveStreamId: liveStreamRecord.id,
      muxAssetId: muxAsset.id,
      muxLiveStreamId,
      status: muxAsset.status ?? "created",
      playbackId: playback.playbackId,
      playbackUrl: playback.playbackUrl,
      playbackPolicy: playback.playbackPolicy,
      durationSeconds: muxAsset.duration ?? null,
      aspectRatio: muxAsset.aspect_ratio ?? null,
      maxFrameRate: muxAsset.max_stored_frame_rate ?? null,
      resolution: muxAsset.max_stored_resolution ?? null,
      mediaJson: {
        mux: {
          createdAt: muxAsset.created_at ?? null,
          duration: muxAsset.duration ?? null,
        },
      },
    });
  }

  switch (event.type) {
    case "video.asset.created": {
      await updateMuxAssetRecord(assetRecord.id, {
        status: muxAsset.status ?? "created",
        playbackId: playback.playbackId,
        playbackUrl: playback.playbackUrl,
        playbackPolicy: playback.playbackPolicy,
        durationSeconds: muxAsset.duration ?? assetRecord.durationSeconds ?? null,
        muxLiveStreamId,
      });
      await attachAssetToLiveStream(liveStreamRecord.id, muxAsset.id);
      await updateLiveStreamRecord(liveStreamRecord.id, {
        activeAssetId: muxAsset.id,
      });
      return "processed";
    }
    case "video.asset.ready": {
      const updated = await updateMuxAssetRecord(assetRecord.id, {
        status: "ready",
        playbackId: playback.playbackId,
        playbackUrl: playback.playbackUrl,
        playbackPolicy: playback.playbackPolicy,
        durationSeconds: muxAsset.duration ?? assetRecord.durationSeconds ?? null,
        aspectRatio: muxAsset.aspect_ratio ?? assetRecord.aspectRatio ?? null,
        maxFrameRate: muxAsset.max_stored_frame_rate ?? assetRecord.maxFrameRate ?? null,
        resolution: muxAsset.max_stored_resolution ?? assetRecord.resolution ?? null,
        readyAt: eventTime,
      });
      const effective = updated ?? assetRecord;
      await attachAssetToLiveStream(liveStreamRecord.id, muxAsset.id);
      await updateLiveStreamRecord(liveStreamRecord.id, {
        activeAssetId: muxAsset.id,
      });
      await queueClipDetection({
        capsuleId: effective.capsuleId,
        liveStreamId: effective.liveStreamId,
        assetId: effective.id,
        muxAssetId: muxAsset.id,
      });
      await queueAssetHighlightSummaries({
        capsuleId: effective.capsuleId,
        liveStreamId: effective.liveStreamId,
        assetId: effective.id,
        muxAssetId: muxAsset.id,
      });
      return "processed";
    }
    case "video.asset.errored": {
      await updateMuxAssetRecord(assetRecord.id, {
        status: "errored",
        erroredAt: eventTime,
      });
      return "processed";
    }
    default:
      return "ignored";
  }
}

export async function handleMuxWebhook(event: MuxWebhookEvent): Promise<void> {
  const objectId = muxWebhookObjectId(event);
  const statusAttempt = muxAttemptSequence(event);
  const payload = toPlainObject(event.data);
  const eventRecord = await insertWebhookEvent({
    eventId: event.id,
    eventType: event.type,
    muxObjectType: typeof event.object?.type === "string" ? event.object.type : null,
    muxObjectId: objectId,
    attempt: statusAttempt ?? null,
    status: "received",
    receivedAt: event.created_at ?? null,
    data: payload,
  });

  let handlerStatus: string = "ignored";

  try {
    if (event.type.startsWith("video.live_stream.")) {
      handlerStatus = await handleLiveStreamWebhookEvent(event);
    } else if (event.type.startsWith("video.asset.")) {
      handlerStatus = await handleAssetWebhookEvent(event);
    } else {
      handlerStatus = "ignored";
    }
  } catch (error) {
    console.error("mux.webhook handler error", event.type, error);
    handlerStatus = "errored";
  }

  const normalized = handlerStatus === "processed" ? "processed" : handlerStatus === "errored" ? "errored" : "ignored";
  await markWebhookEventProcessed(eventRecord.id, normalized);
}
