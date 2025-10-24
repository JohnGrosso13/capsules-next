import type { LiveStream } from "@mux/mux-node/resources/video/live-streams";
import type { Asset } from "@mux/mux-node/resources/video/assets";
import { createHmac, randomUUID } from "node:crypto";

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
  getCapsuleStreamSettings,
  getLiveStreamByMuxId,
  findActiveSessionForStream,
  listAssetsForCapsule,
  listLiveStreamSessions,
  listPendingAiJobs,
  markWebhookEventProcessed,
  updateLiveStreamRecord,
  updateLiveStreamSession,
  updateMuxAssetRecord,
  upsertCapsuleStreamSettings,
  insertWebhookEvent,
  type MuxAiJobRecord,
  type MuxAssetRecord,
  type MuxLiveStreamRecord,
  type MuxLiveStreamSessionRecord,
  type CapsuleStreamSettingsRecord,
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
const DEFAULT_SIMULCAST_STATUS = "idle" as const;
const ALLOWED_SIMULCAST_STATUSES = new Set(["idle", "live", "error"]);
const MAX_STREAM_AUDIT_LOG = 20;

type StreamAuditEvent = {
  id: string;
  type: "preferences.updated" | "stream.key_rotated" | "webhook.test_dispatched";
  actorUserId: string;
  createdAt: string;
  details?: Record<string, unknown>;
};

export class MuxPlanRestrictionError extends Error {
  status = 402;
  code = "mux_plan_required";

  constructor(message = "Live streaming is not enabled for the current Mux plan.") {
    super(message);
    this.name = "MuxPlanRestrictionError";
  }
}

export type CapsuleStreamSimulcastDestination = {
  id: string;
  label: string;
  provider: string;
  url: string;
  streamKey: string | null;
  enabled: boolean;
  status: "idle" | "live" | "error";
  lastSyncedAt: string | null;
};

export type CapsuleStreamWebhookEndpoint = {
  id: string;
  label: string;
  url: string;
  secret: string | null;
  events: string[];
  enabled: boolean;
  lastDeliveredAt: string | null;
};

function ensurePreferenceId(value: unknown): string {
  if (typeof value === "string" && value.trim().length) {
    return value.trim();
  }
  try {
    return randomUUID();
  } catch {
    return `pref-${Math.random().toString(36).slice(2, 10)}`;
  }
}

function sanitizeSimulcastDestinations(value: unknown): CapsuleStreamSimulcastDestination[] {
  if (!Array.isArray(value)) return [];
  const results: CapsuleStreamSimulcastDestination[] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== "object") continue;
    const data = entry as Record<string, unknown>;
    const url = typeof data.url === "string" ? data.url.trim() : "";
    if (!url) continue;
    const labelRaw = typeof data.label === "string" ? data.label.trim() : "";
    const providerRaw = typeof data.provider === "string" ? data.provider.trim() : "";
    const streamKeyRaw = typeof data.streamKey === "string" ? data.streamKey.trim() : "";
    const enabled = typeof data.enabled === "boolean" ? data.enabled : true;
    const statusRaw = typeof data.status === "string" ? data.status.trim().toLowerCase() : DEFAULT_SIMULCAST_STATUS;
    const status = ALLOWED_SIMULCAST_STATUSES.has(statusRaw)
      ? (statusRaw as CapsuleStreamSimulcastDestination["status"])
      : DEFAULT_SIMULCAST_STATUS;
    const lastSyncedAt =
      typeof data.lastSyncedAt === "string" && data.lastSyncedAt.trim().length
        ? data.lastSyncedAt.trim()
        : null;

    results.push({
      id: ensurePreferenceId(data.id),
      label: labelRaw.length ? labelRaw : "Custom destination",
      provider: providerRaw.length ? providerRaw : "custom",
      url,
      streamKey: streamKeyRaw.length ? streamKeyRaw : null,
      enabled,
      status,
      lastSyncedAt,
    });
  }
  return results;
}

function sanitizeWebhookEndpoints(value: unknown): CapsuleStreamWebhookEndpoint[] {
  if (!Array.isArray(value)) return [];
  const results: CapsuleStreamWebhookEndpoint[] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== "object") continue;
    const data = entry as Record<string, unknown>;
    const url = typeof data.url === "string" ? data.url.trim() : "";
    if (!url) continue;
    const labelRaw = typeof data.label === "string" ? data.label.trim() : "";
    const secretRaw = typeof data.secret === "string" ? data.secret.trim() : "";
    const eventsValue = Array.isArray(data.events) ? data.events : [];
    const events = eventsValue
      .map((event) => (typeof event === "string" ? event.trim() : ""))
      .filter((event) => event.length);
    const enabled = typeof data.enabled === "boolean" ? data.enabled : true;
    const lastDeliveredAt =
      typeof data.lastDeliveredAt === "string" && data.lastDeliveredAt.trim().length
        ? data.lastDeliveredAt.trim()
        : null;

    results.push({
      id: ensurePreferenceId(data.id),
      label: labelRaw.length ? labelRaw : "Streaming automation",
      url,
      secret: secretRaw.length ? secretRaw : null,
      events,
      enabled,
      lastDeliveredAt,
    });
  }
  return results;
}

function normalizeLatencyModeValue(
  value: string | null | undefined,
): CapsuleStreamPreferences["latencyMode"] {
  if (value === "standard" || value === "reduced") {
    return value;
  }
  return "low";
}

function normalizeBoolean(value: boolean | null | undefined, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function normalizeStreamSettingsRecord(
  record: CapsuleStreamSettingsRecord | null,
): CapsuleStreamPreferences {
  if (!record) {
    return { ...DEFAULT_STREAM_PREFERENCES };
  }
  const metadata = (record.metadata ?? {}) as Record<string, unknown>;
  return {
    latencyMode: normalizeLatencyModeValue(record.latencyMode),
    disconnectProtection: normalizeBoolean(
      record.disconnectProtection,
      DEFAULT_STREAM_PREFERENCES.disconnectProtection,
    ),
    audioWarnings: normalizeBoolean(record.audioWarnings, DEFAULT_STREAM_PREFERENCES.audioWarnings),
    storePastBroadcasts: normalizeBoolean(
      record.storePastBroadcasts,
      DEFAULT_STREAM_PREFERENCES.storePastBroadcasts,
    ),
    alwaysPublishVods: normalizeBoolean(
      record.alwaysPublishVods,
      DEFAULT_STREAM_PREFERENCES.alwaysPublishVods,
    ),
    autoClips: normalizeBoolean(record.autoClips, DEFAULT_STREAM_PREFERENCES.autoClips),
    simulcastDestinations: sanitizeSimulcastDestinations(metadata.simulcastDestinations),
    webhookEndpoints: sanitizeWebhookEndpoints(metadata.webhookEndpoints),
  };
}

type LiveStreamPlayback = {
  playbackId: string | null;
  playbackUrl: string | null;
  playbackPolicy: string | null;
};

type StreamIngestInfo = {
  primary: string | null;
  backup: string | null;
};

export type CapsuleStreamPreferences = {
  latencyMode: "low" | "reduced" | "standard";
  disconnectProtection: boolean;
  audioWarnings: boolean;
  storePastBroadcasts: boolean;
  alwaysPublishVods: boolean;
  autoClips: boolean;
  simulcastDestinations: CapsuleStreamSimulcastDestination[];
  webhookEndpoints: CapsuleStreamWebhookEndpoint[];
};

const DEFAULT_STREAM_PREFERENCES: CapsuleStreamPreferences = {
  latencyMode: "low",
  disconnectProtection: true,
  audioWarnings: true,
  storePastBroadcasts: true,
  alwaysPublishVods: true,
  autoClips: false,
  simulcastDestinations: [],
  webhookEndpoints: [],
};

export type CapsuleLiveStreamOverview = {
  liveStream: MuxLiveStreamRecord;
  playback: LiveStreamPlayback;
  ingest: StreamIngestInfo & { streamKey: string; backupStreamKey: string | null };
  health: {
    status: string;
    latencyMode: string | null;
    reconnectWindowSeconds: number | null;
    lastSeenAt: string | null;
    lastActiveAt: string | null;
    lastIdleAt: string | null;
    lastErrorAt: string | null;
    recentError: string | null;
  };
  sessions: MuxLiveStreamSessionRecord[];
  assets: MuxAssetRecord[];
  aiJobs: MuxAiJobRecord[];
};

export async function getCapsuleStreamPreferences(
  capsuleId: string,
): Promise<CapsuleStreamPreferences> {
  const record = await getCapsuleStreamSettings(capsuleId);
  return normalizeStreamSettingsRecord(record);
}

export async function upsertCapsuleStreamPreferences(params: {
  capsuleId: string;
  ownerUserId: string;
  preferences: Partial<CapsuleStreamPreferences>;
}): Promise<CapsuleStreamPreferences> {
  const updates: Record<string, unknown> = {};
  if (params.preferences.latencyMode !== undefined) {
    updates.latencyMode = params.preferences.latencyMode;
  }
  if (params.preferences.disconnectProtection !== undefined) {
    updates.disconnectProtection = params.preferences.disconnectProtection;
  }
  if (params.preferences.audioWarnings !== undefined) {
    updates.audioWarnings = params.preferences.audioWarnings;
  }
  if (params.preferences.storePastBroadcasts !== undefined) {
    updates.storePastBroadcasts = params.preferences.storePastBroadcasts;
  }
  if (params.preferences.alwaysPublishVods !== undefined) {
    updates.alwaysPublishVods = params.preferences.alwaysPublishVods;
  }
  if (params.preferences.autoClips !== undefined) {
    updates.autoClips = params.preferences.autoClips;
  }
  if (params.preferences.simulcastDestinations !== undefined) {
    updates.simulcastDestinations = sanitizeSimulcastDestinations(
      params.preferences.simulcastDestinations,
    );
  }
  if (params.preferences.webhookEndpoints !== undefined) {
    updates.webhookEndpoints = sanitizeWebhookEndpoints(params.preferences.webhookEndpoints);
  }

  const record = await upsertCapsuleStreamSettings({
    capsuleId: params.capsuleId,
    ownerUserId: params.ownerUserId,
    updates,
  });

  const changedFields = Object.keys(updates);
  if (changedFields.length) {
    await logAuditEventForCapsule(params.capsuleId, {
      id: randomUUID(),
      type: "preferences.updated",
      actorUserId: params.ownerUserId,
      createdAt: new Date().toISOString(),
      details: { fields: changedFields },
    });
  }

  return normalizeStreamSettingsRecord(record);
}

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

function ensureMetadata(meta: Record<string, unknown> | null | undefined): Record<string, unknown> {
  if (meta && typeof meta === "object") return { ...meta };
  return {};
}

function coerceAuditLogEntries(value: unknown): StreamAuditEvent[] {
  if (!Array.isArray(value)) return [];
  const results: StreamAuditEvent[] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== "object") continue;
    const data = entry as Record<string, unknown>;
    const id = typeof data.id === "string" && data.id.length ? data.id : undefined;
    const type = typeof data.type === "string" && data.type.length ? data.type : undefined;
    const actorUserId =
      typeof data.actorUserId === "string" && data.actorUserId.length ? data.actorUserId : undefined;
    const createdAt =
      typeof data.createdAt === "string" && data.createdAt.length ? data.createdAt : undefined;
    if (!id || !type || !actorUserId || !createdAt) continue;
    const details =
      data.details && typeof data.details === "object" ? (data.details as Record<string, unknown>) : undefined;
    results.push({ id, type: type as StreamAuditEvent["type"], actorUserId, createdAt, ...(details ? { details } : {}) });
  }
  return results;
}

async function appendAuditEvent(
  record: MuxLiveStreamRecord,
  event: StreamAuditEvent,
): Promise<void> {
  const metadata = ensureMetadata(record.metadata);
  const auditLog = coerceAuditLogEntries(metadata.auditLog);
  auditLog.unshift(event);
  metadata.auditLog = auditLog.slice(0, MAX_STREAM_AUDIT_LOG);
  await updateLiveStreamRecord(record.id, { metadata });
}

async function logAuditEventForCapsule(
  capsuleId: string,
  event: StreamAuditEvent,
): Promise<void> {
  const record = await getLiveStreamByCapsuleId(capsuleId);
  if (!record) return;
  await appendAuditEvent(record, event);
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

  let muxStream: Awaited<ReturnType<typeof createMuxLiveStream>>;
  try {
    muxStream = await createMuxLiveStream({
      playback_policies: ["public"],
      new_asset_settings: {
        playback_policies: ["public"],
      },
      latency_mode: params.latencyMode ?? "low",
      reconnect_window: (params.latencyMode ?? "low") === "low" ? 30 : 60,
      use_slate_for_standard_latency: (params.latencyMode ?? "low") === "standard",
      passthrough: `capsule:${params.capsuleId}`,
    });
  } catch (error) {
    const messagesArray =
      typeof error === "object" &&
      error !== null &&
      "error" in error &&
      error.error &&
      Array.isArray((error as { error: { messages?: unknown } }).error.messages)
        ? ((error as { error: { messages: unknown[] } }).error.messages as unknown[])
        : [];
    const combinedMessage =
      messagesArray.length > 0
        ? messagesArray.map((message) => (typeof message === "string" ? message : "")).join(" ")
        : "";
    if (combinedMessage && /live streams are unavailable on the free plan/i.test(combinedMessage)) {
      throw new MuxPlanRestrictionError(
        "Live streaming is not available on the current Mux plan. Contact Capsules to enable live streaming.",
      );
    }
    throw error;
  }

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
    health: {
      status: record.status,
      latencyMode: record.latencyMode,
      reconnectWindowSeconds: record.reconnectWindowSeconds,
      lastSeenAt: record.lastSeenAt,
      lastActiveAt: record.lastActiveAt,
      lastIdleAt: record.lastIdleAt,
      lastErrorAt: record.lastErrorAt,
      recentError: record.recentError,
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
  } else {
    const preferences = await getCapsuleStreamPreferences(params.capsuleId);
    ensureParams.latencyMode = preferences.latencyMode;
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

    await appendAuditEvent(updated ?? record, {
      id: randomUUID(),
      type: "stream.key_rotated",
      actorUserId: params.ownerUserId,
      createdAt: new Date().toISOString(),
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


export async function triggerWebhookTestDelivery(params: {
  capsuleId: string;
  ownerUserId: string;
  endpointId: string;
}): Promise<{ deliveredAt: string; responseStatus: number }> {
  const preferences = await getCapsuleStreamPreferences(params.capsuleId);
  const endpoint = preferences.webhookEndpoints.find((entry) => entry.id === params.endpointId);
  if (!endpoint) {
    throw new Error("Webhook endpoint not found.");
  }
  if (!endpoint.enabled) {
    throw new Error("Webhook endpoint is currently disabled. Enable it before sending a test event.");
  }

  const overview = await getCapsuleLiveStreamOverview(params.capsuleId);
  const triggeredAt = new Date().toISOString();
  const payload = {
    type: "capsules.webhook.test",
    triggeredAt,
    capsuleId: params.capsuleId,
    endpoint: {
      id: endpoint.id,
      label: endpoint.label,
    },
    stream: overview
      ? {
          status: overview.health.status,
          lastSeenAt: overview.health.lastSeenAt,
          latencyMode: overview.health.latencyMode,
          ingest: overview.ingest,
          playback: overview.playback,
        }
      : null,
  };

  const body = JSON.stringify(payload);
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "User-Agent": "CapsulesWebhookTester/1.0",
  };

  if (endpoint.secret) {
    const signature = createHmac("sha256", endpoint.secret).update(body).digest("hex");
    headers["X-Capsules-Signature"] = `sha256=${signature}`;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  let response: Response;
  try {
    response = await fetch(endpoint.url, {
      method: "POST",
      headers,
      body,
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("The webhook endpoint did not respond within 8 seconds.");
    }
    throw error instanceof Error
      ? error
      : new Error("Failed to deliver the webhook test event.");
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    throw new Error(
      `Endpoint responded with ${response.status}${errorText ? `: ${errorText.slice(0, 200)}` : ""}`,
    );
  }

  await logAuditEventForCapsule(params.capsuleId, {
    id: randomUUID(),
    type: "webhook.test_dispatched",
    actorUserId: params.ownerUserId,
    createdAt: triggeredAt,
    details: { endpointId: endpoint.id, responseStatus: response.status },
  });

  return { deliveredAt: triggeredAt, responseStatus: response.status };
}
