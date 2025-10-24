import { getDatabaseAdminClient } from "@/config/database";
import { decorateDatabaseError } from "@/lib/database/utils";

const db = getDatabaseAdminClient();

const LIVE_STREAM_COLUMNS =
  "id, capsule_id, owner_user_id, mux_live_stream_id, status, latency_mode, is_low_latency, reconnect_window_seconds, stream_key, stream_key_backup, ingest_url, ingest_url_backup, playback_id, playback_url, playback_policy, active_asset_id, recent_error, metadata, created_at, updated_at, last_seen_at, last_active_at, last_idle_at, last_error_at";
const SESSION_COLUMNS =
  "id, live_stream_id, capsule_id, mux_live_stream_id, mux_session_id, mux_asset_id, status, started_at, ended_at, duration_seconds, error_code, error_message, metadata, created_at, updated_at";
const ASSET_COLUMNS =
  "id, live_stream_id, capsule_id, mux_asset_id, mux_live_stream_id, status, playback_id, playback_url, playback_policy, duration_seconds, aspect_ratio, max_frame_rate, resolution, preview_image_url, thumbnail_url, storyboard_url, media_json, created_at, updated_at, ready_at, errored_at";
const WEBHOOK_COLUMNS =
  "id, event_id, event_type, mux_object_type, mux_object_id, attempt, status, received_at, processed_at, data, created_at";
const AI_JOB_COLUMNS =
  "id, capsule_id, live_stream_id, asset_id, job_type, status, priority, payload, result, error_message, started_at, completed_at, created_at, updated_at";
const STREAM_SETTINGS_COLUMNS =
  "capsule_id, owner_user_id, latency_mode, disconnect_protection, audio_warnings, store_past_broadcasts, always_publish_vods, auto_clips, metadata, created_at, updated_at";

type LiveStreamRow = {
  id: string;
  capsule_id: string | null;
  owner_user_id: string | null;
  mux_live_stream_id: string | null;
  status: string | null;
  latency_mode: string | null;
  is_low_latency: boolean | null;
  reconnect_window_seconds: number | null;
  stream_key: string | null;
  stream_key_backup: string | null;
  ingest_url: string | null;
  ingest_url_backup: string | null;
  playback_id: string | null;
  playback_url: string | null;
  playback_policy: string | null;
  active_asset_id: string | null;
  recent_error: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string | null;
  updated_at: string | null;
  last_seen_at: string | null;
  last_active_at: string | null;
  last_idle_at: string | null;
  last_error_at: string | null;
};

type SessionRow = {
  id: string;
  live_stream_id: string | null;
  capsule_id: string | null;
  mux_live_stream_id: string | null;
  mux_session_id: string | null;
  mux_asset_id: string | null;
  status: string | null;
  started_at: string | null;
  ended_at: string | null;
  duration_seconds: number | null;
  error_code: string | null;
  error_message: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string | null;
  updated_at: string | null;
};

type AssetRow = {
  id: string;
  live_stream_id: string | null;
  capsule_id: string | null;
  mux_asset_id: string | null;
  mux_live_stream_id: string | null;
  status: string | null;
  playback_id: string | null;
  playback_url: string | null;
  playback_policy: string | null;
  duration_seconds: number | null;
  aspect_ratio: string | null;
  max_frame_rate: number | null;
  resolution: string | null;
  preview_image_url: string | null;
  thumbnail_url: string | null;
  storyboard_url: string | null;
  media_json: Record<string, unknown> | null;
  created_at: string | null;
  updated_at: string | null;
  ready_at: string | null;
  errored_at: string | null;
};

type WebhookRow = {
  id: string;
  event_id: string | null;
  event_type: string | null;
  mux_object_type: string | null;
  mux_object_id: string | null;
  attempt: number | null;
  status: string | null;
  received_at: string | null;
  processed_at: string | null;
  data: Record<string, unknown> | null;
  created_at: string | null;
};

type AiJobRow = {
  id: string;
  capsule_id: string | null;
  live_stream_id: string | null;
  asset_id: string | null;
  job_type: string | null;
  status: string | null;
  priority: number | null;
  payload: Record<string, unknown> | null;
  result: Record<string, unknown> | null;
  error_message: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string | null;
  updated_at: string | null;
};

type StreamSettingsRow = {
  capsule_id: string | null;
  owner_user_id: string | null;
  latency_mode: string | null;
  disconnect_protection: boolean | null;
  audio_warnings: boolean | null;
  store_past_broadcasts: boolean | null;
  always_publish_vods: boolean | null;
  auto_clips: boolean | null;
  metadata: Record<string, unknown> | null;
  created_at: string | null;
  updated_at: string | null;
};

export type MuxLiveStreamRecord = {
  id: string;
  capsuleId: string;
  ownerUserId: string;
  muxLiveStreamId: string;
  status: string;
  latencyMode: string | null;
  isLowLatency: boolean;
  reconnectWindowSeconds: number | null;
  streamKey: string;
  streamKeyBackup: string | null;
  ingestUrl: string | null;
  ingestUrlBackup: string | null;
  playbackId: string | null;
  playbackUrl: string | null;
  playbackPolicy: string | null;
  activeAssetId: string | null;
  recentError: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
  lastSeenAt: string | null;
  lastActiveAt: string | null;
  lastIdleAt: string | null;
  lastErrorAt: string | null;
};

export type MuxLiveStreamSessionRecord = {
  id: string;
  liveStreamId: string;
  capsuleId: string;
  muxLiveStreamId: string;
  muxSessionId: string | null;
  muxAssetId: string | null;
  status: string;
  startedAt: string | null;
  endedAt: string | null;
  durationSeconds: number | null;
  errorCode: string | null;
  errorMessage: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
};

export type MuxAssetRecord = {
  id: string;
  liveStreamId: string | null;
  capsuleId: string;
  muxAssetId: string;
  muxLiveStreamId: string | null;
  status: string;
  playbackId: string | null;
  playbackUrl: string | null;
  playbackPolicy: string | null;
  durationSeconds: number | null;
  aspectRatio: string | null;
  maxFrameRate: number | null;
  resolution: string | null;
  previewImageUrl: string | null;
  thumbnailUrl: string | null;
  storyboardUrl: string | null;
  mediaJson: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
  readyAt: string | null;
  erroredAt: string | null;
};

export type MuxWebhookEventRecord = {
  id: string;
  eventId: string | null;
  eventType: string;
  muxObjectType: string | null;
  muxObjectId: string | null;
  attempt: number | null;
  status: string | null;
  receivedAt: string;
  processedAt: string | null;
  data: Record<string, unknown> | null;
  createdAt: string;
};

export type MuxAiJobRecord = {
  id: string;
  capsuleId: string;
  liveStreamId: string | null;
  assetId: string | null;
  jobType: string;
  status: string;
  priority: number;
  payload: Record<string, unknown> | null;
  result: Record<string, unknown> | null;
  errorMessage: string | null;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type CapsuleStreamSettingsRecord = {
  capsuleId: string;
  ownerUserId: string;
  latencyMode: string | null;
  disconnectProtection: boolean;
  audioWarnings: boolean;
  storePastBroadcasts: boolean;
  alwaysPublishVods: boolean;
  autoClips: boolean;
  metadata: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
};

function filterNull<T>(value: T | null | undefined): value is T {
  return value !== null && value !== undefined;
}

function mapLiveStream(row: LiveStreamRow | null): MuxLiveStreamRecord | null {
  if (!row?.id || !row.capsule_id || !row.owner_user_id || !row.mux_live_stream_id || !row.stream_key) {
    return null;
  }
  const createdAt = row.created_at ?? new Date().toISOString();
  return {
    id: row.id,
    capsuleId: row.capsule_id,
    ownerUserId: row.owner_user_id,
    muxLiveStreamId: row.mux_live_stream_id,
    status: row.status ?? "idle",
    latencyMode: row.latency_mode ?? null,
    isLowLatency: row.is_low_latency ?? true,
    reconnectWindowSeconds:
      typeof row.reconnect_window_seconds === "number" ? row.reconnect_window_seconds : null,
    streamKey: row.stream_key,
    streamKeyBackup: row.stream_key_backup ?? null,
    ingestUrl: row.ingest_url ?? null,
    ingestUrlBackup: row.ingest_url_backup ?? null,
    playbackId: row.playback_id ?? null,
    playbackUrl: row.playback_url ?? null,
    playbackPolicy: row.playback_policy ?? null,
    activeAssetId: row.active_asset_id ?? null,
    recentError: row.recent_error ?? null,
    metadata: row.metadata ?? null,
    createdAt,
    updatedAt: row.updated_at ?? createdAt,
    lastSeenAt: row.last_seen_at ?? null,
    lastActiveAt: row.last_active_at ?? null,
    lastIdleAt: row.last_idle_at ?? null,
    lastErrorAt: row.last_error_at ?? null,
  };
}

function mapSession(row: SessionRow | null): MuxLiveStreamSessionRecord | null {
  if (!row?.id || !row.live_stream_id || !row.capsule_id || !row.mux_live_stream_id) {
    return null;
  }
  const createdAt = row.created_at ?? new Date().toISOString();
  return {
    id: row.id,
    liveStreamId: row.live_stream_id,
    capsuleId: row.capsule_id,
    muxLiveStreamId: row.mux_live_stream_id,
    muxSessionId: row.mux_session_id ?? null,
    muxAssetId: row.mux_asset_id ?? null,
    status: row.status ?? "initialized",
    startedAt: row.started_at ?? null,
    endedAt: row.ended_at ?? null,
    durationSeconds: typeof row.duration_seconds === "number" ? row.duration_seconds : null,
    errorCode: row.error_code ?? null,
    errorMessage: row.error_message ?? null,
    metadata: row.metadata ?? null,
    createdAt,
    updatedAt: row.updated_at ?? createdAt,
  };
}

function mapAsset(row: AssetRow | null): MuxAssetRecord | null {
  if (!row?.id || !row.capsule_id || !row.mux_asset_id) {
    return null;
  }
  const createdAt = row.created_at ?? new Date().toISOString();
  return {
    id: row.id,
    liveStreamId: row.live_stream_id ?? null,
    capsuleId: row.capsule_id,
    muxAssetId: row.mux_asset_id,
    muxLiveStreamId: row.mux_live_stream_id ?? null,
    status: row.status ?? "created",
    playbackId: row.playback_id ?? null,
    playbackUrl: row.playback_url ?? null,
    playbackPolicy: row.playback_policy ?? null,
    durationSeconds: typeof row.duration_seconds === "number" ? row.duration_seconds : null,
    aspectRatio: row.aspect_ratio ?? null,
    maxFrameRate: typeof row.max_frame_rate === "number" ? row.max_frame_rate : null,
    resolution: row.resolution ?? null,
    previewImageUrl: row.preview_image_url ?? null,
    thumbnailUrl: row.thumbnail_url ?? null,
    storyboardUrl: row.storyboard_url ?? null,
    mediaJson: row.media_json ?? null,
    createdAt,
    updatedAt: row.updated_at ?? createdAt,
    readyAt: row.ready_at ?? null,
    erroredAt: row.errored_at ?? null,
  };
}

function mapWebhook(row: WebhookRow | null): MuxWebhookEventRecord | null {
  if (!row?.id || !row.event_type || !row.received_at) {
    return null;
  }
  return {
    id: row.id,
    eventId: row.event_id ?? null,
    eventType: row.event_type,
    muxObjectType: row.mux_object_type ?? null,
    muxObjectId: row.mux_object_id ?? null,
    attempt: typeof row.attempt === "number" ? row.attempt : null,
    status: row.status ?? null,
    receivedAt: row.received_at,
    processedAt: row.processed_at ?? null,
    data: row.data ?? null,
    createdAt: row.created_at ?? row.received_at,
  };
}

function mapAiJob(row: AiJobRow | null): MuxAiJobRecord | null {
  if (!row?.id || !row.capsule_id || !row.job_type || !row.status) {
    return null;
  }
  const createdAt = row.created_at ?? new Date().toISOString();
  return {
    id: row.id,
    capsuleId: row.capsule_id,
    liveStreamId: row.live_stream_id ?? null,
    assetId: row.asset_id ?? null,
    jobType: row.job_type,
    status: row.status,
    priority: typeof row.priority === "number" ? row.priority : 0,
    payload: row.payload ?? null,
    result: row.result ?? null,
    errorMessage: row.error_message ?? null,
    startedAt: row.started_at ?? null,
    completedAt: row.completed_at ?? null,
    createdAt,
    updatedAt: row.updated_at ?? createdAt,
  };
}

function ensureLiveStream(row: LiveStreamRow | null, context: string): MuxLiveStreamRecord {
  const mapped = mapLiveStream(row);
  if (!mapped) {
    throw new Error(`${context}: invalid mux live stream record`);
  }
  return mapped;
}

function ensureSession(row: SessionRow | null, context: string): MuxLiveStreamSessionRecord {
  const mapped = mapSession(row);
  if (!mapped) {
    throw new Error(`${context}: invalid mux live stream session`);
  }
  return mapped;
}

function ensureAsset(row: AssetRow | null, context: string): MuxAssetRecord {
  const mapped = mapAsset(row);
  if (!mapped) {
    throw new Error(`${context}: invalid mux asset record`);
  }
  return mapped;
}

function ensureWebhook(row: WebhookRow | null, context: string): MuxWebhookEventRecord {
  const mapped = mapWebhook(row);
  if (!mapped) {
    throw new Error(`${context}: invalid mux webhook record`);
  }
  return mapped;
}

function ensureAiJob(row: AiJobRow | null, context: string): MuxAiJobRecord {
  const mapped = mapAiJob(row);
  if (!mapped) {
    throw new Error(`${context}: invalid mux ai job record`);
  }
  return mapped;
}

function mapStreamSettings(row: StreamSettingsRow | null): CapsuleStreamSettingsRecord | null {
  if (!row?.capsule_id || !row.owner_user_id) {
    return null;
  }
  const createdAt = row.created_at ?? new Date().toISOString();
  return {
    capsuleId: row.capsule_id,
    ownerUserId: row.owner_user_id,
    latencyMode: row.latency_mode ?? null,
    disconnectProtection: row.disconnect_protection ?? true,
    audioWarnings: row.audio_warnings ?? true,
    storePastBroadcasts: row.store_past_broadcasts ?? true,
    alwaysPublishVods: row.always_publish_vods ?? true,
    autoClips: row.auto_clips ?? false,
    metadata: row.metadata ?? null,
    createdAt,
    updatedAt: row.updated_at ?? createdAt,
  };
}

function ensureStreamSettings(
  row: StreamSettingsRow | null,
  context: string,
): CapsuleStreamSettingsRecord {
  const mapped = mapStreamSettings(row);
  if (!mapped) {
    throw new Error(`${context}: invalid capsule stream settings record`);
  }
  return mapped;
}

type StreamSettingsUpdate = Partial<{
  latencyMode: string | null;
  disconnectProtection: boolean | null;
  audioWarnings: boolean | null;
  storePastBroadcasts: boolean | null;
  alwaysPublishVods: boolean | null;
  autoClips: boolean | null;
  simulcastDestinations: unknown;
  webhookEndpoints: unknown;
  metadata: Record<string, unknown> | null;
}>;

export async function upsertCapsuleStreamSettings(params: {
  capsuleId: string;
  ownerUserId: string;
  updates: StreamSettingsUpdate;
}): Promise<CapsuleStreamSettingsRecord> {
  const existing = await getCapsuleStreamSettings(params.capsuleId);
  const now = new Date().toISOString();

  const existingMetadata = (existing?.metadata ?? {}) as Record<string, unknown>;
  let nextMetadata: Record<string, unknown> = { ...existingMetadata };

  if (params.updates.metadata !== undefined) {
    const provided = params.updates.metadata ?? {};
    nextMetadata = {
      ...(typeof provided === "object" && provided ? (provided as Record<string, unknown>) : {}),
    };
  }

  if (params.updates.simulcastDestinations !== undefined) {
    nextMetadata = {
      ...nextMetadata,
      simulcastDestinations: params.updates.simulcastDestinations ?? [],
    };
  } else if (nextMetadata.simulcastDestinations === undefined && existingMetadata.simulcastDestinations !== undefined) {
    nextMetadata.simulcastDestinations = existingMetadata.simulcastDestinations;
  }

  if (params.updates.webhookEndpoints !== undefined) {
    nextMetadata = {
      ...nextMetadata,
      webhookEndpoints: params.updates.webhookEndpoints ?? [],
    };
  } else if (nextMetadata.webhookEndpoints === undefined && existingMetadata.webhookEndpoints !== undefined) {
    nextMetadata.webhookEndpoints = existingMetadata.webhookEndpoints;
  }

  const payload = {
    capsule_id: params.capsuleId,
    owner_user_id: params.ownerUserId,
    latency_mode: params.updates.latencyMode ?? existing?.latencyMode ?? null,
    disconnect_protection:
      params.updates.disconnectProtection ?? existing?.disconnectProtection ?? true,
    audio_warnings: params.updates.audioWarnings ?? existing?.audioWarnings ?? true,
    store_past_broadcasts:
      params.updates.storePastBroadcasts ?? existing?.storePastBroadcasts ?? true,
    always_publish_vods:
      params.updates.alwaysPublishVods ?? existing?.alwaysPublishVods ?? true,
    auto_clips: params.updates.autoClips ?? existing?.autoClips ?? false,
    metadata: Object.keys(nextMetadata).length ? nextMetadata : null,
    created_at: existing?.createdAt ?? now,
    updated_at: now,
  };

  const result = await db
    .from("capsule_stream_settings")
    .upsert(payload, { onConflict: "capsule_id" })
    .select<StreamSettingsRow>(STREAM_SETTINGS_COLUMNS)
    .maybeSingle();

  if (result.error) {
    throw decorateDatabaseError("mux.streamSettings.upsert", result.error);
  }

  return ensureStreamSettings(result.data ?? null, "mux.streamSettings.upsert");
}

export async function getLiveStreamByCapsuleId(
  capsuleId: string,
): Promise<MuxLiveStreamRecord | null> {
  const result = await db
    .from("mux_live_streams")
    .select<LiveStreamRow>(LIVE_STREAM_COLUMNS)
    .eq("capsule_id", capsuleId)
    .maybeSingle();

  if (result.error) {
    throw decorateDatabaseError("mux.liveStreams.fetchByCapsule", result.error);
  }

  return mapLiveStream(result.data ?? null);
}

export async function getCapsuleStreamSettings(
  capsuleId: string,
): Promise<CapsuleStreamSettingsRecord | null> {
  const result = await db
    .from("capsule_stream_settings")
    .select<StreamSettingsRow>(STREAM_SETTINGS_COLUMNS)
    .eq("capsule_id", capsuleId)
    .maybeSingle();

  if (result.error) {
    throw decorateDatabaseError("mux.streamSettings.fetch", result.error);
  }

  return mapStreamSettings(result.data ?? null);
}

export async function getLiveStreamByMuxId(
  muxLiveStreamId: string,
): Promise<MuxLiveStreamRecord | null> {
  const result = await db
    .from("mux_live_streams")
    .select<LiveStreamRow>(LIVE_STREAM_COLUMNS)
    .eq("mux_live_stream_id", muxLiveStreamId)
    .maybeSingle();

  if (result.error) {
    throw decorateDatabaseError("mux.liveStreams.fetchByMuxId", result.error);
  }

  return mapLiveStream(result.data ?? null);
}

export async function getLiveStreamById(id: string): Promise<MuxLiveStreamRecord | null> {
  const result = await db
    .from("mux_live_streams")
    .select<LiveStreamRow>(LIVE_STREAM_COLUMNS)
    .eq("id", id)
    .maybeSingle();

  if (result.error) {
    throw decorateDatabaseError("mux.liveStreams.fetchById", result.error);
  }

  return mapLiveStream(result.data ?? null);
}

export async function createLiveStreamRecord(params: {
  capsuleId: string;
  ownerUserId: string;
  muxLiveStreamId: string;
  streamKey: string;
  status?: string;
  latencyMode?: string | null;
  isLowLatency?: boolean;
  reconnectWindowSeconds?: number | null;
  streamKeyBackup?: string | null;
  ingestUrl?: string | null;
  ingestUrlBackup?: string | null;
  playbackId?: string | null;
  playbackUrl?: string | null;
  playbackPolicy?: string | null;
  metadata?: Record<string, unknown> | null;
  activeAssetId?: string | null;
}): Promise<MuxLiveStreamRecord> {
  const now = new Date().toISOString();
  const payload = {
    capsule_id: params.capsuleId,
    owner_user_id: params.ownerUserId,
    mux_live_stream_id: params.muxLiveStreamId,
    stream_key: params.streamKey,
    status: params.status ?? "idle",
    latency_mode: params.latencyMode ?? null,
    is_low_latency: params.isLowLatency ?? true,
    reconnect_window_seconds: params.reconnectWindowSeconds ?? null,
    stream_key_backup: params.streamKeyBackup ?? null,
    ingest_url: params.ingestUrl ?? null,
    ingest_url_backup: params.ingestUrlBackup ?? null,
    playback_id: params.playbackId ?? null,
    playback_url: params.playbackUrl ?? null,
    playback_policy: params.playbackPolicy ?? null,
    metadata: params.metadata ?? null,
    active_asset_id: params.activeAssetId ?? null,
    created_at: now,
    updated_at: now,
  };

  const result = await db
    .from("mux_live_streams")
    .insert(payload)
    .select<LiveStreamRow>(LIVE_STREAM_COLUMNS)
    .maybeSingle();

  if (result.error) {
    throw decorateDatabaseError("mux.liveStreams.create", result.error);
  }

  return ensureLiveStream(result.data ?? null, "mux.liveStreams.create");
}

type LiveStreamUpdate = Partial<{
  status: string | null;
  latencyMode: string | null;
  isLowLatency: boolean | null;
  reconnectWindowSeconds: number | null;
  streamKey: string | null;
  streamKeyBackup: string | null;
  ingestUrl: string | null;
  ingestUrlBackup: string | null;
  playbackId: string | null;
  playbackUrl: string | null;
  playbackPolicy: string | null;
  activeAssetId: string | null;
  recentError: string | null;
  metadata: Record<string, unknown> | null;
  lastSeenAt: string | null;
  lastActiveAt: string | null;
  lastIdleAt: string | null;
  lastErrorAt: string | null;
}>;

function buildLiveStreamUpdatePayload(updates: LiveStreamUpdate): Record<string, unknown> {
  const payload: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (updates.status !== undefined) payload.status = updates.status;
  if (updates.latencyMode !== undefined) payload.latency_mode = updates.latencyMode;
  if (updates.isLowLatency !== undefined) payload.is_low_latency = updates.isLowLatency;
  if (updates.reconnectWindowSeconds !== undefined) {
    payload.reconnect_window_seconds = updates.reconnectWindowSeconds;
  }
  if (updates.streamKey !== undefined) payload.stream_key = updates.streamKey;
  if (updates.streamKeyBackup !== undefined) payload.stream_key_backup = updates.streamKeyBackup;
  if (updates.ingestUrl !== undefined) payload.ingest_url = updates.ingestUrl;
  if (updates.ingestUrlBackup !== undefined) payload.ingest_url_backup = updates.ingestUrlBackup;
  if (updates.playbackId !== undefined) payload.playback_id = updates.playbackId;
  if (updates.playbackUrl !== undefined) payload.playback_url = updates.playbackUrl;
  if (updates.playbackPolicy !== undefined) payload.playback_policy = updates.playbackPolicy;
  if (updates.activeAssetId !== undefined) payload.active_asset_id = updates.activeAssetId;
  if (updates.recentError !== undefined) payload.recent_error = updates.recentError;
  if (updates.metadata !== undefined) payload.metadata = updates.metadata;
  if (updates.lastSeenAt !== undefined) payload.last_seen_at = updates.lastSeenAt;
  if (updates.lastActiveAt !== undefined) payload.last_active_at = updates.lastActiveAt;
  if (updates.lastIdleAt !== undefined) payload.last_idle_at = updates.lastIdleAt;
  if (updates.lastErrorAt !== undefined) payload.last_error_at = updates.lastErrorAt;
  return payload;
}

export async function updateLiveStreamRecord(
  id: string,
  updates: LiveStreamUpdate,
): Promise<MuxLiveStreamRecord | null> {
  if (!Object.keys(updates).length) {
    return getLiveStreamById(id);
  }

  const result = await db
    .from("mux_live_streams")
    .update(buildLiveStreamUpdatePayload(updates))
    .eq("id", id)
    .select<LiveStreamRow>(LIVE_STREAM_COLUMNS)
    .maybeSingle();

  if (result.error) {
    throw decorateDatabaseError("mux.liveStreams.update", result.error);
  }

  return mapLiveStream(result.data ?? null);
}

export async function updateLiveStreamByMuxId(
  muxLiveStreamId: string,
  updates: LiveStreamUpdate,
): Promise<MuxLiveStreamRecord | null> {
  if (!Object.keys(updates).length) {
    return getLiveStreamByMuxId(muxLiveStreamId);
  }

  const result = await db
    .from("mux_live_streams")
    .update(buildLiveStreamUpdatePayload(updates))
    .eq("mux_live_stream_id", muxLiveStreamId)
    .select<LiveStreamRow>(LIVE_STREAM_COLUMNS)
    .maybeSingle();

  if (result.error) {
    throw decorateDatabaseError("mux.liveStreams.updateByMuxId", result.error);
  }

  return mapLiveStream(result.data ?? null);
}

export async function listLiveStreamSessions(
  liveStreamId: string,
  options: { limit?: number } = {},
): Promise<MuxLiveStreamSessionRecord[]> {
  const result = await db
    .from("mux_live_stream_sessions")
    .select<SessionRow>(SESSION_COLUMNS)
    .eq("live_stream_id", liveStreamId)
    .order("created_at", { ascending: false })
    .limit(options.limit ?? 100)
    .fetch();

  if (result.error) {
    throw decorateDatabaseError("mux.sessions.list", result.error);
  }

  return (result.data ?? []).map(mapSession).filter(filterNull);
}

export async function findSessionByMuxSessionId(
  muxSessionId: string,
): Promise<MuxLiveStreamSessionRecord | null> {
  const result = await db
    .from("mux_live_stream_sessions")
    .select<SessionRow>(SESSION_COLUMNS)
    .eq("mux_session_id", muxSessionId)
    .maybeSingle();

  if (result.error) {
    throw decorateDatabaseError("mux.sessions.fetchByMuxSessionId", result.error);
  }

  return mapSession(result.data ?? null);
}

export async function findActiveSessionForStream(
  liveStreamId: string,
): Promise<MuxLiveStreamSessionRecord | null> {
  const result = await db
    .from("mux_live_stream_sessions")
    .select<SessionRow>(SESSION_COLUMNS)
    .eq("live_stream_id", liveStreamId)
    .in("status", ["active", "connected", "broadcasting"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (result.error) {
    throw decorateDatabaseError("mux.sessions.findActive", result.error);
  }

  return mapSession(result.data ?? null);
}

export async function createLiveStreamSession(params: {
  liveStreamId: string;
  capsuleId: string;
  muxLiveStreamId: string;
  muxSessionId?: string | null;
  muxAssetId?: string | null;
  status?: string;
  startedAt?: string | null;
  metadata?: Record<string, unknown> | null;
}): Promise<MuxLiveStreamSessionRecord> {
  const now = new Date().toISOString();
  const payload = {
    live_stream_id: params.liveStreamId,
    capsule_id: params.capsuleId,
    mux_live_stream_id: params.muxLiveStreamId,
    mux_session_id: params.muxSessionId ?? null,
    mux_asset_id: params.muxAssetId ?? null,
    status: params.status ?? "active",
    started_at: params.startedAt ?? now,
    metadata: params.metadata ?? null,
    created_at: now,
    updated_at: now,
  };

  const result = await db
    .from("mux_live_stream_sessions")
    .insert(payload)
    .select<SessionRow>(SESSION_COLUMNS)
    .maybeSingle();

  if (result.error) {
    throw decorateDatabaseError("mux.sessions.create", result.error);
  }

  return ensureSession(result.data ?? null, "mux.sessions.create");
}

export async function updateLiveStreamSession(
  id: string,
  updates: Partial<{
    status: string | null;
    muxAssetId: string | null;
    muxSessionId: string | null;
    startedAt: string | null;
    endedAt: string | null;
    durationSeconds: number | null;
    errorCode: string | null;
    errorMessage: string | null;
    metadata: Record<string, unknown> | null;
  }>,
): Promise<MuxLiveStreamSessionRecord | null> {
  if (!Object.keys(updates).length) {
    const result = await db
      .from("mux_live_stream_sessions")
      .select<SessionRow>(SESSION_COLUMNS)
      .eq("id", id)
      .maybeSingle();

    if (result.error) {
      throw decorateDatabaseError("mux.sessions.fetchById", result.error);
    }

    return mapSession(result.data ?? null);
  }

  const payload: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (updates.status !== undefined) payload.status = updates.status;
  if (updates.muxAssetId !== undefined) payload.mux_asset_id = updates.muxAssetId;
  if (updates.muxSessionId !== undefined) payload.mux_session_id = updates.muxSessionId;
  if (updates.startedAt !== undefined) payload.started_at = updates.startedAt;
  if (updates.endedAt !== undefined) payload.ended_at = updates.endedAt;
  if (updates.durationSeconds !== undefined) payload.duration_seconds = updates.durationSeconds;
  if (updates.errorCode !== undefined) payload.error_code = updates.errorCode;
  if (updates.errorMessage !== undefined) payload.error_message = updates.errorMessage;
  if (updates.metadata !== undefined) payload.metadata = updates.metadata;

  const result = await db
    .from("mux_live_stream_sessions")
    .update(payload)
    .eq("id", id)
    .select<SessionRow>(SESSION_COLUMNS)
    .maybeSingle();

  if (result.error) {
    throw decorateDatabaseError("mux.sessions.update", result.error);
  }

  return mapSession(result.data ?? null);
}

export async function createMuxAssetRecord(params: {
  capsuleId: string;
  muxAssetId: string;
  liveStreamId?: string | null;
  muxLiveStreamId?: string | null;
  status?: string;
  playbackId?: string | null;
  playbackUrl?: string | null;
  playbackPolicy?: string | null;
  durationSeconds?: number | null;
  aspectRatio?: string | null;
  maxFrameRate?: number | null;
  resolution?: string | null;
  previewImageUrl?: string | null;
  thumbnailUrl?: string | null;
  storyboardUrl?: string | null;
  mediaJson?: Record<string, unknown> | null;
  readyAt?: string | null;
}): Promise<MuxAssetRecord> {
  const now = new Date().toISOString();
  const payload = {
    capsule_id: params.capsuleId,
    mux_asset_id: params.muxAssetId,
    live_stream_id: params.liveStreamId ?? null,
    mux_live_stream_id: params.muxLiveStreamId ?? null,
    status: params.status ?? "created",
    playback_id: params.playbackId ?? null,
    playback_url: params.playbackUrl ?? null,
    playback_policy: params.playbackPolicy ?? null,
    duration_seconds: params.durationSeconds ?? null,
    aspect_ratio: params.aspectRatio ?? null,
    max_frame_rate: params.maxFrameRate ?? null,
    resolution: params.resolution ?? null,
    preview_image_url: params.previewImageUrl ?? null,
    thumbnail_url: params.thumbnailUrl ?? null,
    storyboard_url: params.storyboardUrl ?? null,
    media_json: params.mediaJson ?? null,
    ready_at: params.readyAt ?? null,
    created_at: now,
    updated_at: now,
  };

  const result = await db
    .from("mux_assets")
    .insert(payload)
    .select<AssetRow>(ASSET_COLUMNS)
    .maybeSingle();

  if (result.error) {
    throw decorateDatabaseError("mux.assets.create", result.error);
  }

  return ensureAsset(result.data ?? null, "mux.assets.create");
}

export async function updateMuxAssetRecord(
  id: string,
  updates: Partial<{
    liveStreamId: string | null;
    muxLiveStreamId: string | null;
    status: string | null;
    playbackId: string | null;
    playbackUrl: string | null;
    playbackPolicy: string | null;
    durationSeconds: number | null;
    aspectRatio: string | null;
    maxFrameRate: number | null;
    resolution: string | null;
    previewImageUrl: string | null;
    thumbnailUrl: string | null;
    storyboardUrl: string | null;
    mediaJson: Record<string, unknown> | null;
    readyAt: string | null;
    erroredAt: string | null;
  }>,
): Promise<MuxAssetRecord | null> {
  if (!Object.keys(updates).length) {
    const result = await db
      .from("mux_assets")
      .select<AssetRow>(ASSET_COLUMNS)
      .eq("id", id)
      .maybeSingle();

    if (result.error) {
      throw decorateDatabaseError("mux.assets.fetchById", result.error);
    }

    return mapAsset(result.data ?? null);
  }

  const payload: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (updates.liveStreamId !== undefined) payload.live_stream_id = updates.liveStreamId;
  if (updates.muxLiveStreamId !== undefined) payload.mux_live_stream_id = updates.muxLiveStreamId;
  if (updates.status !== undefined) payload.status = updates.status;
  if (updates.playbackId !== undefined) payload.playback_id = updates.playbackId;
  if (updates.playbackUrl !== undefined) payload.playback_url = updates.playbackUrl;
  if (updates.playbackPolicy !== undefined) payload.playback_policy = updates.playbackPolicy;
  if (updates.durationSeconds !== undefined) payload.duration_seconds = updates.durationSeconds;
  if (updates.aspectRatio !== undefined) payload.aspect_ratio = updates.aspectRatio;
  if (updates.maxFrameRate !== undefined) payload.max_frame_rate = updates.maxFrameRate;
  if (updates.resolution !== undefined) payload.resolution = updates.resolution;
  if (updates.previewImageUrl !== undefined) payload.preview_image_url = updates.previewImageUrl;
  if (updates.thumbnailUrl !== undefined) payload.thumbnail_url = updates.thumbnailUrl;
  if (updates.storyboardUrl !== undefined) payload.storyboard_url = updates.storyboardUrl;
  if (updates.mediaJson !== undefined) payload.media_json = updates.mediaJson;
  if (updates.readyAt !== undefined) payload.ready_at = updates.readyAt;
  if (updates.erroredAt !== undefined) payload.errored_at = updates.erroredAt;

  const result = await db
    .from("mux_assets")
    .update(payload)
    .eq("id", id)
    .select<AssetRow>(ASSET_COLUMNS)
    .maybeSingle();

  if (result.error) {
    throw decorateDatabaseError("mux.assets.update", result.error);
  }

  return mapAsset(result.data ?? null);
}

export async function getAssetByMuxAssetId(
  muxAssetId: string,
): Promise<MuxAssetRecord | null> {
  const result = await db
    .from("mux_assets")
    .select<AssetRow>(ASSET_COLUMNS)
    .eq("mux_asset_id", muxAssetId)
    .maybeSingle();

  if (result.error) {
    throw decorateDatabaseError("mux.assets.fetchByMuxId", result.error);
  }

  return mapAsset(result.data ?? null);
}

export async function listAssetsForCapsule(
  capsuleId: string,
  options: { limit?: number } = {},
): Promise<MuxAssetRecord[]> {
  const result = await db
    .from("mux_assets")
    .select<AssetRow>(ASSET_COLUMNS)
    .eq("capsule_id", capsuleId)
    .order("created_at", { ascending: false })
    .limit(options.limit ?? 50)
    .fetch();

  if (result.error) {
    throw decorateDatabaseError("mux.assets.list", result.error);
  }

  return (result.data ?? []).map(mapAsset).filter(filterNull);
}

export async function attachAssetToLiveStream(
  liveStreamId: string,
  muxAssetId: string,
): Promise<void> {
  const result = await db
    .from("mux_assets")
    .update({ live_stream_id: liveStreamId, updated_at: new Date().toISOString() })
    .eq("mux_asset_id", muxAssetId)
    .select("id")
    .maybeSingle();

  if (result.error) {
    throw decorateDatabaseError("mux.assets.attachToStream", result.error);
  }
}

export async function insertWebhookEvent(params: {
  eventId?: string | null;
  eventType: string;
  muxObjectType?: string | null;
  muxObjectId?: string | null;
  attempt?: number | null;
  status?: string | null;
  receivedAt?: string | null;
  data: Record<string, unknown>;
}): Promise<MuxWebhookEventRecord> {
  const now = new Date().toISOString();
  const payload = {
    event_id: params.eventId ?? null,
    event_type: params.eventType,
    mux_object_type: params.muxObjectType ?? null,
    mux_object_id: params.muxObjectId ?? null,
    attempt: params.attempt ?? null,
    status: params.status ?? null,
    received_at: params.receivedAt ?? now,
    processed_at: null,
    data: params.data,
    created_at: now,
  };

  const result = await db
    .from("mux_webhook_events")
    .insert(payload)
    .select<WebhookRow>(WEBHOOK_COLUMNS)
    .maybeSingle();

  if (result.error) {
    throw decorateDatabaseError("mux.webhooks.insert", result.error);
  }

  return ensureWebhook(result.data ?? null, "mux.webhooks.insert");
}

export async function markWebhookEventProcessed(
  id: string,
  status: string,
): Promise<MuxWebhookEventRecord | null> {
  const result = await db
    .from("mux_webhook_events")
    .update({ status, processed_at: new Date().toISOString() })
    .eq("id", id)
    .select<WebhookRow>(WEBHOOK_COLUMNS)
    .maybeSingle();

  if (result.error) {
    throw decorateDatabaseError("mux.webhooks.updateStatus", result.error);
  }

  return mapWebhook(result.data ?? null);
}

export async function createAiJob(params: {
  capsuleId: string;
  jobType: string;
  status?: string;
  priority?: number;
  liveStreamId?: string | null;
  assetId?: string | null;
  payload?: Record<string, unknown> | null;
}): Promise<MuxAiJobRecord> {
  const now = new Date().toISOString();
  const payload = {
    capsule_id: params.capsuleId,
    job_type: params.jobType,
    status: params.status ?? "pending",
    priority: params.priority ?? 0,
    live_stream_id: params.liveStreamId ?? null,
    asset_id: params.assetId ?? null,
    payload: params.payload ?? null,
    result: null,
    error_message: null,
    started_at: null,
    completed_at: null,
    created_at: now,
    updated_at: now,
  };

  const result = await db
    .from("mux_ai_jobs")
    .insert(payload)
    .select<AiJobRow>(AI_JOB_COLUMNS)
    .maybeSingle();

  if (result.error) {
    throw decorateDatabaseError("mux.aiJobs.create", result.error);
  }

  return ensureAiJob(result.data ?? null, "mux.aiJobs.create");
}

export async function updateAiJob(
  id: string,
  updates: Partial<{
    status: string | null;
    priority: number | null;
    result: Record<string, unknown> | null;
    errorMessage: string | null;
    startedAt: string | null;
    completedAt: string | null;
  }>,
): Promise<MuxAiJobRecord | null> {
  if (!Object.keys(updates).length) {
    const result = await db
      .from("mux_ai_jobs")
      .select<AiJobRow>(AI_JOB_COLUMNS)
      .eq("id", id)
      .maybeSingle();

    if (result.error) {
      throw decorateDatabaseError("mux.aiJobs.fetchById", result.error);
    }

    return mapAiJob(result.data ?? null);
  }

  const payload: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (updates.status !== undefined) payload.status = updates.status;
  if (updates.priority !== undefined) payload.priority = updates.priority;
  if (updates.result !== undefined) payload.result = updates.result;
  if (updates.errorMessage !== undefined) payload.error_message = updates.errorMessage;
  if (updates.startedAt !== undefined) payload.started_at = updates.startedAt;
  if (updates.completedAt !== undefined) payload.completed_at = updates.completedAt;

  const result = await db
    .from("mux_ai_jobs")
    .update(payload)
    .eq("id", id)
    .select<AiJobRow>(AI_JOB_COLUMNS)
    .maybeSingle();

  if (result.error) {
    throw decorateDatabaseError("mux.aiJobs.update", result.error);
  }

  return mapAiJob(result.data ?? null);
}

export async function listPendingAiJobs(
  capsuleId: string,
  options: { status?: string[]; limit?: number } = {},
): Promise<MuxAiJobRecord[]> {
  const statuses = options.status ?? ["pending", "queued", "running"];

  let query = db
    .from("mux_ai_jobs")
    .select<AiJobRow>(AI_JOB_COLUMNS)
    .eq("capsule_id", capsuleId)
    .in("status", statuses)
    .order("priority", { ascending: false })
    .order("created_at", { ascending: true });

  if (options.limit) {
    query = query.limit(options.limit);
  }

  const result = await query.fetch();

  if (result.error) {
    throw decorateDatabaseError("mux.aiJobs.listPending", result.error);
  }

  return (result.data ?? []).map(mapAiJob).filter(filterNull);
}
