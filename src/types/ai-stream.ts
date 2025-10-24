"use client";

export type StreamSession = {
  id: string;
  status: string;
  startedAt: string | null;
  endedAt: string | null;
  durationSeconds: number | null;
  createdAt: string;
  updatedAt: string;
};

export type StreamAsset = {
  id: string;
  liveStreamId: string | null;
  muxAssetId: string;
  status: string;
  playbackId: string | null;
  playbackUrl: string | null;
  playbackPolicy: string | null;
  durationSeconds: number | null;
  readyAt: string | null;
  erroredAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type StreamAiJob = {
  id: string;
  jobType: string;
  status: string;
  priority: number;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type StreamOverview = {
  liveStream: {
    id: string;
    capsuleId: string;
    ownerUserId: string;
    muxLiveStreamId: string;
    status: string;
    latencyMode: string | null;
    isLowLatency: boolean;
    streamKey: string;
    streamKeyBackup: string | null;
    ingestUrl: string | null;
    ingestUrlBackup: string | null;
    playbackId: string | null;
    playbackUrl: string | null;
    playbackPolicy: string | null;
    activeAssetId: string | null;
    createdAt: string;
    updatedAt: string;
    lastSeenAt: string | null;
    lastActiveAt: string | null;
    lastIdleAt: string | null;
  };
  playback: {
    playbackId: string | null;
    playbackUrl: string | null;
    playbackPolicy: string | null;
  };
  ingest: {
    primary: string | null;
    backup: string | null;
    streamKey: string;
    backupStreamKey: string | null;
  };
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
  sessions: StreamSession[];
  assets: StreamAsset[];
  aiJobs: StreamAiJob[];
};

export type StreamSimulcastDestination = {
  id: string;
  label: string;
  provider: string;
  url: string;
  streamKey: string | null;
  enabled: boolean;
  status: "idle" | "live" | "error";
  lastSyncedAt: string | null;
};

export type StreamWebhookEndpoint = {
  id: string;
  label: string;
  url: string;
  secret: string | null;
  events: string[];
  enabled: boolean;
  lastDeliveredAt: string | null;
};

export type StreamPreferences = {
  latencyMode: "low" | "reduced" | "standard";
  disconnectProtection: boolean;
  audioWarnings: boolean;
  storePastBroadcasts: boolean;
  alwaysPublishVods: boolean;
  autoClips: boolean;
  simulcastDestinations: StreamSimulcastDestination[];
  webhookEndpoints: StreamWebhookEndpoint[];
};

export type StreamOverviewResponse = {
  overview: StreamOverview | null;
  preferences: StreamPreferences;
};
