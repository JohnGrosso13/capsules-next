// @vitest-environment jsdom

import * as React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

import { ExternalEncoderTab, type DestinationDraft, type WebhookDraft } from "../tabs/ExternalEncoderTab";
import type { StreamOverview, StreamPreferences } from "@/types/ai-stream";

const baseOverview: StreamOverview = {
  liveStream: {
    id: "ls-1",
    capsuleId: "capsule-1",
    ownerUserId: "owner-1",
    muxLiveStreamId: "mux-live-1",
    status: "idle",
    latencyMode: "low",
    isLowLatency: true,
    streamKey: "sk_primary",
    streamKeyBackup: "sk_backup",
    ingestUrl: "rtmps://global-live.mux.com:443/app",
    ingestUrlBackup: "rtmps://global-live-backup.mux.com:443/app",
    playbackId: "pb-1",
    playbackUrl: "https://stream.mux.com/pb-1.m3u8",
    playbackPolicy: "public",
    activeAssetId: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    lastSeenAt: null,
    lastActiveAt: null,
    lastIdleAt: null,
  },
  playback: {
    playbackId: "pb-1",
    playbackUrl: "https://stream.mux.com/pb-1.m3u8",
    playbackPolicy: "public",
  },
  ingest: {
    primary: "rtmps://global-live.mux.com:443/app",
    backup: "rtmps://global-live-backup.mux.com:443/app",
    streamKey: "sk_primary",
    backupStreamKey: "sk_backup",
  },
  health: {
    status: "idle",
    latencyMode: "low",
    reconnectWindowSeconds: null,
    lastSeenAt: null,
    lastActiveAt: null,
    lastIdleAt: null,
    lastErrorAt: null,
    recentError: null,
  },
  sessions: [],
  assets: [],
  aiJobs: [],
};

const basePreferences: StreamPreferences = {
  latencyMode: "low",
  disconnectProtection: true,
  audioWarnings: true,
  storePastBroadcasts: true,
  alwaysPublishVods: true,
  autoClips: false,
  simulcastDestinations: [
    {
      id: "dest-1",
      label: "Twitch Prime",
      provider: "twitch",
      url: "rtmps://ingest.twitch.tv/app",
      streamKey: "tw_primary",
      enabled: true,
      status: "idle",
      lastSyncedAt: null,
    },
  ],
  webhookEndpoints: [],
};

const simulcastOptions = [
  { value: "twitch", label: "Twitch" },
  { value: "youtube", label: "YouTube" },
  { value: "custom", label: "Custom RTMP" },
];

const webhookOptions = [
  { value: "stream.started", label: "Stream started" },
  { value: "stream.ended", label: "Stream ended" },
];

describe("ExternalEncoderTab", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    container.remove();
    delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT;
  });

  function renderEncoderTab(
    overrides: Partial<React.ComponentProps<typeof ExternalEncoderTab>> = {},
  ) {
    const defaultProps: React.ComponentProps<typeof ExternalEncoderTab> = {
      capsuleName: "Launch Capsule",
      activeSession: null,
      streamOverview: baseOverview,
      streamPreferences: basePreferences,
      overviewLoading: false,
    overviewError: null,
    actionBusy: null,
    onEnsureStream: vi.fn(),
    onLatencyChange: vi.fn(),
    onRotateStreamKey: vi.fn(),
    onDownloadObsProfile: vi.fn(),
    onCopy: vi.fn(),
    copiedField: null,
    maskSecret: (value) => value ?? "--",
    showPrimaryKey: false,
    onTogglePrimaryKey: vi.fn(),
    showBackupKey: false,
    onToggleBackupKey: vi.fn(),
    downloadBusy: false,
    qrGenerating: false,
    qrError: null,
    qrImageDataUrl: null,
    mobileIngestPayload: JSON.stringify({ capsuleId: "capsule-1", streamKey: "sk_primary" }),
    simulcastDraft: { label: "", provider: "twitch", url: "", streamKey: "" } as DestinationDraft,
    onSimulcastDraftChange: vi.fn(),
    simulcastOptions,
    addingDestination: false,
    onStartAddDestination: vi.fn(),
    onAddSimulcastDestination: vi.fn(),
    onCancelAddDestination: vi.fn(),
    destinationError: null,
    onToggleDestination: vi.fn(),
    onRemoveDestination: vi.fn(),
    resolveProviderLabel: (value) => value,
    webhookDraft: { label: "", url: "", secret: "", events: [] } as WebhookDraft,
    onWebhookFieldChange: vi.fn(),
    onWebhookEventToggle: vi.fn(),
    webhookOptions,
    addingWebhook: false,
    onStartAddWebhook: vi.fn(),
    onAddWebhookEndpoint: vi.fn(),
    onCancelAddWebhook: vi.fn(),
    webhookError: null,
    onToggleWebhook: vi.fn(),
    onRemoveWebhook: vi.fn(),
    playbackUrl: baseOverview.playback.playbackUrl,
    embedCodeSnippet: "<mux-player stream-type=\"live\"></mux-player>",
    onUpdatePreferences: vi.fn(),
    defaultPrimaryIngestUrl: "rtmps://global-live.mux.com:443/app",
    webhookTestStatus: {},
    onSendWebhookTest: vi.fn(),
  };

    act(() => {
      root.render(<ExternalEncoderTab {...defaultProps} {...overrides} />);
    });
  }

  const queryByText = (text: string): HTMLElement | null =>
    Array.from(container.querySelectorAll<HTMLElement>("*")).find((element) =>
      element.textContent?.includes(text),
    ) ?? null;

  it("renders checklist status for provisioned streams", () => {
    renderEncoderTab();

    expect(queryByText("Mux live stream ready")).not.toBeNull();
    expect(queryByText("Provisioned")).not.toBeNull();
    expect(queryByText("Simulcast destinations configured")).not.toBeNull();
  });

  it("shows setup prompts when no stream overview is available", () => {
    renderEncoderTab({ streamOverview: null });

    expect(queryByText("Create a live stream to unlock credentials")).not.toBeNull();
  });

  it("invokes onCopy when copying the primary ingest url", async () => {
    const onCopy = vi.fn();
    renderEncoderTab({ onCopy });

    const primaryRow = Array.from(container.querySelectorAll("li")).find((li) =>
      li.textContent?.includes("Primary ingest URL"),
    );
    expect(primaryRow).toBeDefined();
    const copyButton = primaryRow?.querySelector<HTMLButtonElement>("button");
    expect(copyButton).toBeDefined();

    await act(async () => {
      copyButton?.click();
    });

    expect(onCopy).toHaveBeenCalledWith("Primary ingest URL", baseOverview.ingest.primary);
  });
});
