"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { downloadObsProfile, normalizeMuxError } from "@/lib/mux/liveClient";
import type { CapsuleSummary } from "@/server/capsules/service";

import styles from "@/app/(authenticated)/create/ai-stream/ai-stream.page.module.css";
import capTheme from "@/app/(authenticated)/capsule/capsule.module.css";
import {
  AiStreamStudioStoreProvider,
  StreamSimulcastDestination,
  StreamWebhookEndpoint,
  useAiStreamStudioStore,
} from "./useAiStreamStudioStore";
import { useAiStreamStudioNavigation } from "./useAiStreamStudioNavigation";
import { useClipboardCopy } from "./useClipboardCopy";
import { useMobileIngestQr } from "./useMobileIngestQr";
import {
  formatJobDisplayName,
  formatJobStatusLabel,
  computeElapsedSeconds,
  formatTimestamp,
  formatDuration,
} from "./formatUtils";
import { LiveStudioTab } from "./tabs/LiveStudioTab";
import { ProducerConsoleTab } from "./tabs/ProducerConsoleTab";
import type { StudioTab } from "./types";
import {
  Broadcast,
  SquaresFour,
  Storefront,
  FilmSlate,
} from "@phosphor-icons/react/dist/ssr";

const TAB_ITEMS: Array<{ id: StudioTab; label: string; icon: React.ReactNode }> = [
  {
    id: "studio",
    label: "Live Studio",
    icon: <Broadcast size={18} weight="bold" className={capTheme.tabIcon} />,
  },
  {
    id: "producer",
    label: "Producer Console",
    icon: <SquaresFour size={18} weight="bold" className={capTheme.tabIcon} />,
  },
  {
    id: "encoder",
    label: "External Encoder",
    icon: <Storefront size={18} weight="bold" className={capTheme.tabIcon} />,
  },
  {
    id: "clips",
    label: "Clips & Highlights",
    icon: <FilmSlate size={18} weight="bold" className={capTheme.tabIcon} />,
  },
];

const TAB_SET = new Set<StudioTab>(TAB_ITEMS.map((item) => item.id));

type DestinationDraft = {
  label: string;
  provider: string;
  url: string;
  streamKey: string;
};

type WebhookDraft = {
  label: string;
  url: string;
  secret: string;
  events: string[];
};

const SIMULCAST_PROVIDER_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "twitch", label: "Twitch" },
  { value: "youtube", label: "YouTube" },
  { value: "kick", label: "Kick" },
  { value: "facebook", label: "Facebook Live" },
  { value: "custom", label: "Custom RTMP" },
];

const WEBHOOK_EVENT_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "stream.started", label: "Stream started" },
  { value: "stream.ended", label: "Stream ended" },
  { value: "asset.ready", label: "Recording ready" },
  { value: "asset.errored", label: "Recording error" },
];

const DEFAULT_PRIMARY_INGEST_URL = "rtmps://global-live.mux.com:443/app";

type AiStreamStudioLayoutProps = {
  capsules: CapsuleSummary[];
  initialView?: StudioTab;
  layoutOwnerId: string;
  layoutView?: string;
  initialPanelLayouts?: Record<string, unknown>;
};

function generatePreferenceId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `pref-${Math.random().toString(36).slice(2, 10)}`;
}

export function AiStreamStudioLayout(props: AiStreamStudioLayoutProps) {
  return (
    <AiStreamStudioStoreProvider>
      <AiStreamStudioLayoutInner {...props} />
    </AiStreamStudioStoreProvider>
  );
}

type PanelGroupStorageLike = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  flush?: () => void | Promise<void>;
  cancel?: () => void;
};

const DEFAULT_LAYOUT_VIEW = "ai-stream-studio";

const AUTO_SAVE_SEGMENTS = {
  main: "main",
  leftColumn: "left-column",
  rightColumn: "right-column",
} as const;

type AutoSaveSegment = (typeof AUTO_SAVE_SEGMENTS)[keyof typeof AUTO_SAVE_SEGMENTS];

function buildAutoSaveId(
  view: string,
  ownerId: string,
  segment: AutoSaveSegment,
  capsuleId?: string | null,
): string {
  const capsuleScope = capsuleId ? `capsule:${capsuleId}` : "capsule:global";
  return `${view}|${segment}|${capsuleScope}|${ownerId}`;
}

function usePanelLayoutStorage(
  view: string,
  initialLayouts?: Record<string, unknown>,
): PanelGroupStorageLike {
  const initialSignature = React.useMemo(
    () => JSON.stringify(initialLayouts ?? {}),
    [initialLayouts],
  );

  const storage = React.useMemo<PanelGroupStorageLike>(() => {
    let parsed: Record<string, unknown> = {};
    try {
      parsed = initialSignature ? (JSON.parse(initialSignature) as Record<string, unknown>) : {};
    } catch (error) {
      console.warn("Failed to parse initial panel layout state", error);
    }

    const cache = new Map<string, string>();
    Object.entries(parsed).forEach(([key, value]) => {
      if (value === undefined) return;
      try {
        cache.set(key, JSON.stringify(value));
      } catch (error) {
        console.warn("Failed to serialize cached panel layout state", error);
      }
    });

    let pending = new Map<string, string>();
    let timer: number | null = null;

    const flush = async () => {
      if (!pending.size) {
        timer = null;
        return;
      }
      const entries: Array<{ storageKey: string; state: unknown }> = [];
      pending.forEach((serialized, key) => {
        try {
          entries.push({ storageKey: key, state: JSON.parse(serialized) });
        } catch (error) {
          console.warn("Failed to parse panel layout payload", error);
        }
      });
      pending = new Map();
      timer = null;
      if (!entries.length) return;
      try {
        await fetch("/api/studio/layout", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ view, entries }),
        });
      } catch (error) {
        console.warn("Failed to persist studio layout state", error);
      }
    };

    const scheduleFlush = () => {
      if (typeof window === "undefined") return;
      if (timer !== null) {
        window.clearTimeout(timer);
      }
      timer = window.setTimeout(() => {
        void flush();
      }, 500);
    };

    const cancel = () => {
      if (typeof window === "undefined") return;
      if (timer !== null) {
        window.clearTimeout(timer);
      }
      timer = null;
      pending = new Map();
    };

    const storageImpl: PanelGroupStorageLike = {
      getItem(key) {
        return cache.get(key) ?? null;
      },
      setItem(key, value) {
        cache.set(key, value);
        pending.set(key, value);
        scheduleFlush();
      },
      flush,
      cancel,
    };

    return storageImpl;
  }, [initialSignature, view]);

  React.useEffect(() => {
    return () => {
      void storage.flush?.();
      storage.cancel?.();
    };
  }, [storage]);

  return storage;
}

function normalizeTab(value: string | null | undefined, fallback: StudioTab): StudioTab {
  if (!value) return fallback;
  const maybe = value.toLowerCase() as StudioTab;
  if (TAB_SET.has(maybe)) {
    return maybe;
  }
  return fallback;
}

function AiStreamStudioLayoutInner({
  capsules,
  initialView = "studio",
  layoutOwnerId,
  layoutView = DEFAULT_LAYOUT_VIEW,
  initialPanelLayouts,
}: AiStreamStudioLayoutProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const searchParamsString = React.useMemo(() => searchParams?.toString() ?? "", [searchParams]);
  const {
    state: {
      selectedCapsuleId,
      streamOverview,
      streamPreferences,
      overviewLoading,
      overviewError,
      actionBusy,
    },
    actions: {
      setOverviewError,
      updateStreamPreferences,
      ensureStream,
      rotateStreamKey,
    },
  } = useAiStreamStudioStore();

  const initialTab = React.useMemo(
    () => normalizeTab(initialView, "studio"),
    [initialView],
  );

  const {
    activeTab,
    handleTabChange,
    handleCapsuleChange,
    selectedCapsule,
    selectorOpen,
  } = useAiStreamStudioNavigation({
    capsules,
    initialTab,
    pathname,
    searchParams,
    searchParamsString,
    router,
  });

  const capsuleLayoutScope = selectedCapsule?.id ?? null;

  const autoSaveIds = React.useMemo(
    () => ({
      main: buildAutoSaveId(layoutView, layoutOwnerId, AUTO_SAVE_SEGMENTS.main, capsuleLayoutScope),
      leftColumn: buildAutoSaveId(
        layoutView,
        layoutOwnerId,
        AUTO_SAVE_SEGMENTS.leftColumn,
        capsuleLayoutScope,
      ),
      rightColumn: buildAutoSaveId(
        layoutView,
        layoutOwnerId,
        AUTO_SAVE_SEGMENTS.rightColumn,
        capsuleLayoutScope,
      ),
    }),
    [capsuleLayoutScope, layoutOwnerId, layoutView],
  );

  const panelStorage = usePanelLayoutStorage(layoutView, initialPanelLayouts);
  const { copiedField, copy } = useClipboardCopy();
  const [showPrimaryKey, setShowPrimaryKey] = React.useState(false);
  const [showBackupKey, setShowBackupKey] = React.useState(false);
  const [downloadBusy, setDownloadBusy] = React.useState(false);
  const [addingDestination, setAddingDestination] = React.useState(false);
  const [destinationDraft, setDestinationDraft] = React.useState<DestinationDraft>(() => ({
    label: "",
    provider: SIMULCAST_PROVIDER_OPTIONS[0]?.value ?? "custom",
    url: "",
    streamKey: "",
  }));
  const [destinationError, setDestinationError] = React.useState<string | null>(null);
  const [addingWebhook, setAddingWebhook] = React.useState(false);
  const [webhookDraft, setWebhookDraft] = React.useState<WebhookDraft>({
    label: "",
    url: "",
    secret: "",
    events: [],
  });
  const [webhookError, setWebhookError] = React.useState<string | null>(null);
  const [uptimeTick, setUptimeTick] = React.useState(() => Date.now());
  const providerLabelMap = React.useMemo(() => {
    return new Map(SIMULCAST_PROVIDER_OPTIONS.map((option) => [option.value, option.label]));
  }, []);

  const resolveProviderLabel = React.useCallback(
    (value: string) => providerLabelMap.get(value) ?? "Custom",
    [providerLabelMap],
  );

  const mobileIngestPayload = React.useMemo(() => {
    if (!streamOverview) return null;
    const ingestUrl = streamOverview.ingest.primary ?? DEFAULT_PRIMARY_INGEST_URL;
    const streamKey = streamOverview.ingest.streamKey;
    if (!ingestUrl || !streamKey) return null;
    return JSON.stringify({
      capsuleId: streamOverview.liveStream.capsuleId,
      capsuleName: selectedCapsule?.name ?? null,
      ingestUrl,
      streamKey,
    });
  }, [selectedCapsule?.name, streamOverview]);

  const { qrImageDataUrl, qrGenerating, qrError } = useMobileIngestQr(mobileIngestPayload);

  const activeSession = React.useMemo(() => {
    if (!streamOverview) return null;
    return (
      streamOverview.sessions.find(
        (session) =>
          !session.endedAt && (session.status === "active" || session.status === "connected"),
      ) ?? null
    );
  }, [streamOverview]);

  React.useEffect(() => {
    if (!activeSession?.startedAt) return;
    const timer = window.setInterval(() => {
      setUptimeTick(Date.now());
    }, 1000);
    return () => window.clearInterval(timer);
  }, [activeSession?.startedAt]);

  const uptimeSeconds = React.useMemo(() => {
    if (!activeSession?.startedAt) return null;
    const parsedStart = Date.parse(activeSession.startedAt);
    if (!Number.isFinite(parsedStart)) return null;
    return Math.max(0, Math.floor((uptimeTick - parsedStart) / 1000));
  }, [activeSession?.startedAt, uptimeTick]);

  const handleEnsureStream = React.useCallback(() => {
    void ensureStream();
  }, [ensureStream]);

  const handleRotateStreamKey = React.useCallback(() => {
    void rotateStreamKey();
  }, [rotateStreamKey]);

  const maskSecret = React.useCallback((value: string | null | undefined) => {
    if (!value) return "--";
    const visible = 4;
    const maskedLength = Math.max(0, value.length - visible);
    return "\u2022".repeat(maskedLength) + value.slice(-visible);
  }, []);

  const handleLatencyChange = React.useCallback(
    (event: React.ChangeEvent<HTMLSelectElement | HTMLInputElement>) => {
      updateStreamPreferences({ latencyMode: event.target.value as "low" | "reduced" | "standard" });
    },
    [updateStreamPreferences],
  );

  const handleDestinationDraftChange = React.useCallback(
    (field: keyof DestinationDraft, value: string) => {
      setDestinationDraft((prev) => ({ ...prev, [field]: value }));
    },
    [],
  );

  const handleAddSimulcastDestination = React.useCallback(
    (event?: React.FormEvent<HTMLFormElement>) => {
      event?.preventDefault();
      const trimmedUrl = destinationDraft.url.trim();
      if (!trimmedUrl.length) {
        setDestinationError("Destination ingest URL is required.");
        return;
      }
      const provider = destinationDraft.provider || "custom";
      const label = destinationDraft.label.trim() || `${resolveProviderLabel(provider)} destination`;
      const streamKeyValue = destinationDraft.streamKey.trim();
      const nextDestination: StreamSimulcastDestination = {
        id: generatePreferenceId(),
        label,
        provider,
        url: trimmedUrl,
        streamKey: streamKeyValue.length ? streamKeyValue : null,
        enabled: true,
        status: "idle",
        lastSyncedAt: null,
      };
      updateStreamPreferences({
        simulcastDestinations: [...streamPreferences.simulcastDestinations, nextDestination],
      });
      setDestinationDraft((prev) => ({ ...prev, label: "", url: "", streamKey: "" }));
      setDestinationError(null);
      setAddingDestination(false);
    },
    [destinationDraft, resolveProviderLabel, streamPreferences.simulcastDestinations, updateStreamPreferences],
  );

  const handleToggleSimulcastDestination = React.useCallback(
    (id: string) => {
      updateStreamPreferences({
        simulcastDestinations: streamPreferences.simulcastDestinations.map((destination) =>
          destination.id === id
            ? {
                ...destination,
                enabled: !destination.enabled,
                status: destination.enabled ? "idle" : destination.status,
              }
            : destination,
        ),
      });
    },
    [streamPreferences.simulcastDestinations, updateStreamPreferences],
  );

  const handleRemoveSimulcastDestination = React.useCallback(
    (id: string) => {
      updateStreamPreferences({
        simulcastDestinations: streamPreferences.simulcastDestinations.filter(
          (destination) => destination.id !== id,
        ),
      });
    },
    [streamPreferences.simulcastDestinations, updateStreamPreferences],
  );

  const handleCancelAddDestination = React.useCallback(() => {
    setAddingDestination(false);
    setDestinationError(null);
    setDestinationDraft((prev) => ({ ...prev, label: "", url: "", streamKey: "" }));
  }, []);

  const handleWebhookFieldChange = React.useCallback(
    (field: "label" | "url" | "secret", value: string) => {
      setWebhookDraft((prev) => ({ ...prev, [field]: value }));
    },
    [],
  );

  const handleWebhookEventToggle = React.useCallback((eventValue: string) => {
    setWebhookDraft((prev) => {
      const exists = prev.events.includes(eventValue);
      const nextEvents = exists
        ? prev.events.filter((value) => value !== eventValue)
        : [...prev.events, eventValue];
      return { ...prev, events: nextEvents };
    });
  }, []);

  const handleAddWebhookEndpoint = React.useCallback(
    (event?: React.FormEvent<HTMLFormElement>) => {
      event?.preventDefault();
      const trimmedUrl = webhookDraft.url.trim();
      if (!trimmedUrl.length) {
        setWebhookError("Webhook URL is required.");
        return;
      }
      const label = webhookDraft.label.trim() || "Streaming webhook";
      const secretValue = webhookDraft.secret.trim();
      const newEndpoint: StreamWebhookEndpoint = {
        id: generatePreferenceId(),
        label,
        url: trimmedUrl,
        secret: secretValue.length ? secretValue : null,
        events: Array.from(new Set(webhookDraft.events)).sort(),
        enabled: true,
        lastDeliveredAt: null,
      };
      updateStreamPreferences({
        webhookEndpoints: [...streamPreferences.webhookEndpoints, newEndpoint],
      });
      setWebhookDraft({ label: "", url: "", secret: "", events: [] });
      setWebhookError(null);
      setAddingWebhook(false);
    },
    [streamPreferences.webhookEndpoints, updateStreamPreferences, webhookDraft],
  );

  const handleToggleWebhookEndpoint = React.useCallback(
    (id: string) => {
      updateStreamPreferences({
        webhookEndpoints: streamPreferences.webhookEndpoints.map((endpoint) =>
          endpoint.id === id ? { ...endpoint, enabled: !endpoint.enabled } : endpoint,
        ),
      });
    },
    [streamPreferences.webhookEndpoints, updateStreamPreferences],
  );

  const handleRemoveWebhookEndpoint = React.useCallback(
    (id: string) => {
      updateStreamPreferences({
        webhookEndpoints: streamPreferences.webhookEndpoints.filter((endpoint) => endpoint.id !== id),
      });
    },
    [streamPreferences.webhookEndpoints, updateStreamPreferences],
  );

  const handleCancelAddWebhook = React.useCallback(() => {
    setAddingWebhook(false);
    setWebhookError(null);
    setWebhookDraft({ label: "", url: "", secret: "", events: [] });
  }, []);

  const handleDownloadObsProfile = React.useCallback(async () => {
    if (!selectedCapsuleId) return;
    setDownloadBusy(true);
    try {
      const { blob, filename } = await downloadObsProfile({ capsuleId: selectedCapsuleId });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = filename;
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      URL.revokeObjectURL(url);
    } catch (error) {
      const normalizedError = normalizeMuxError(error, "Failed to download OBS profile.");
      console.warn("mux.obsProfile.download", normalizedError);
      setOverviewError(normalizedError.message);
    } finally {
      setDownloadBusy(false);
    }
  }, [selectedCapsuleId, setOverviewError]);

  const playbackUrl = React.useMemo(() => {
    if (streamOverview?.playback.playbackUrl) {
      return streamOverview.playback.playbackUrl;
    }
    if (streamOverview?.playback.playbackId) {
      return `https://stream.mux.com/${streamOverview.playback.playbackId}.m3u8`;
    }
    return null;
  }, [streamOverview]);

  const embedCodeSnippet = React.useMemo(() => {
    if (!streamOverview?.playback.playbackId) return null;
    return `<mux-player stream-type="live" playback-id="${streamOverview.playback.playbackId}"></mux-player>`;
  }, [streamOverview]);

  const renderStudioContent = () => (
    <LiveStudioTab
      selectorOpen={selectorOpen}
      selectedCapsule={selectedCapsule}
      capsules={capsules}
      onCapsuleChange={handleCapsuleChange}
      autoSaveIds={autoSaveIds}
      panelStorage={panelStorage}
      streamOverview={streamOverview}
      overviewLoading={overviewLoading}
      overviewError={overviewError}
      actionBusy={actionBusy}
      uptimeSeconds={uptimeSeconds}
      onEnsureStream={handleEnsureStream}
      onNavigateToEncoder={() => handleTabChange("encoder")}
    />
  );
  const renderProducerContent = () => (
    <ProducerConsoleTab selectedCapsule={selectedCapsule} />
  );

  const renderEncoderContent = () => {
    if (!selectedCapsule) {
      return (
        <div className={styles.noticeCard}>
          <h3>Choose a Capsule to set up external encoders</h3>
          <p>
            We&apos;ll generate RTMP credentials, latency profiles, and simulcast targets specific to
            your selected Capsule once it&apos;s chosen.
          </p>
        </div>
      );
    }

    if (overviewLoading && !streamOverview) {
      return (
        <div className={styles.noticeCard}>
          <h3>Loading streaming configuration...</h3>
          <p>Retrieving the latest credentials from Mux.</p>
        </div>
      );
    }

    if (!streamOverview) {
      return (
        <div className={styles.noticeCard}>
          <h3>Generate Mux streaming credentials</h3>
          <p>
            Pick the desired latency profile and create a dedicated live stream for {selectedCapsule.name}
            . We&apos;ll provision RTMP ingest URLs and stream keys instantly.
          </p>
          <div className={styles.encoderSetupControls}>
            <label className={styles.encoderLatencySelect}>
              <span>Latency profile</span>
              <select value={streamPreferences.latencyMode} onChange={handleLatencyChange}>
                <option value="low">Low latency</option>
                <option value="reduced">Reduced latency</option>
                <option value="standard">Standard latency</option>
              </select>
            </label>
            <Button
              variant="gradient"
              size="sm"
              onClick={handleEnsureStream}
              disabled={actionBusy === "ensure" || overviewLoading}
            >
              {actionBusy === "ensure" ? "Preparing..." : "Create live stream"}
            </Button>
          </div>
        </div>
      );
    }

    return (
      <div className={styles.encoderLayout}>
        <div className={styles.encoderGrid}>
          <section className={styles.encoderSection}>
            <div className={styles.encoderSectionTitle}>RTMP ingest endpoints</div>
            <div className={styles.encoderSectionSubtitle}>
              Configure OBS, Streamlabs, or any RTMP-compatible encoder with these URLs.
            </div>
            <ul className={styles.encoderList}>
              <li className={styles.encoderRow}>
                <div>
                  <div className={styles.encoderLabel}>Primary ingest</div>
                  <div className={styles.encoderValue}>
                    {streamOverview.ingest.primary ?? "rtmps://global-live.mux.com:443/app"}
                  </div>
                </div>
                <button
                  type="button"
                  className={styles.encoderActionButton}
                  onClick={() =>
                    copy(
                      "primary-ingest",
                      streamOverview.ingest.primary ?? "rtmps://global-live.mux.com:443/app",
                    )
                  }
                >
                  {copiedField === "primary-ingest" ? "Copied" : "Copy"}
                </button>
              </li>
              <li className={styles.encoderRow}>
                <div>
                  <div className={styles.encoderLabel}>Backup ingest</div>
                  <div className={styles.encoderValue}>
                    {streamOverview.ingest.backup ?? "rtmps://global-live-backup.mux.com:443/app"}
                  </div>
                </div>
                <button
                  type="button"
                  className={styles.encoderActionButton}
                  onClick={() =>
                    copy(
                      "backup-ingest",
                      streamOverview.ingest.backup ?? "rtmps://global-live-backup.mux.com:443/app",
                    )
                  }
                >
                  {copiedField === "backup-ingest" ? "Copied" : "Copy"}
                </button>
              </li>
            </ul>
          </section>
          <section className={styles.encoderSection}>
            <div className={styles.encoderSectionTitle}>Stream preferences</div>
            <div className={styles.encoderSectionSubtitle}>
              Choose latency and reliability options. Changes to latency apply to newly prepared streams.
            </div>
            <div className={styles.prefsGrid}>
              <div className={styles.radioGroup} role="radiogroup" aria-label="Latency mode">
                <div className={styles.encoderLabel}>Latency mode</div>
                <label className={styles.radioOption}>
                  <input
                    type="radio"
                    name="latency"
                    value="low"
                    checked={streamPreferences.latencyMode === "low"}
                    onChange={handleLatencyChange}
                  />
                  Low latency
                </label>
                <label className={styles.radioOption}>
                  <input
                    type="radio"
                    name="latency"
                    value="standard"
                    checked={streamPreferences.latencyMode === "standard"}
                    onChange={handleLatencyChange}
                  />
                  Normal latency
                </label>
                <span className={styles.encoderHint}>Used when preparing/refreshing the live stream.</span>
              </div>
              <div className={styles.fieldGroup}>
                <label className={styles.switchRow}>
                  <input
                    type="checkbox"
                    className={styles.switch}
                    checked={streamPreferences.disconnectProtection}
                    onChange={(event) =>
                      updateStreamPreferences({ disconnectProtection: event.target.checked })
                    }
                  />
                  <div>
                    <div className={styles.encoderLabel}>Disconnect protection</div>
                    <div className={styles.encoderHint}>Display a slate if the encoder drops briefly.</div>
                  </div>
                </label>
                <label className={styles.switchRow}>
                  <input
                    type="checkbox"
                    className={styles.switch}
                    checked={streamPreferences.audioWarnings}
                    onChange={(event) =>
                      updateStreamPreferences({ audioWarnings: event.target.checked })
                    }
                  />
                  <div>
                    <div className={styles.encoderLabel}>Copyrighted audio warnings</div>
                    <div className={styles.encoderHint}>Flag repeated detections in your VODs.</div>
                  </div>
                </label>
              </div>
            </div>
          </section>
          <section className={styles.encoderSection}>
            <div className={styles.encoderSectionTitle}>VOD &amp; Clips</div>
            <div className={styles.encoderSectionSubtitle}>
              Control how we store and publish recordings and experimental auto clips.
            </div>
            <div className={styles.fieldGroup}>
              <label className={styles.switchRow}>
                <input
                  type="checkbox"
                  className={styles.switch}
                  checked={streamPreferences.storePastBroadcasts}
                  onChange={(event) =>
                    updateStreamPreferences({ storePastBroadcasts: event.target.checked })
                  }
                />
                <div>
                  <div className={styles.encoderLabel}>Store past broadcasts</div>
                  <div className={styles.encoderHint}>Keep recordings for up to 7 days (longer for partners).</div>
                </div>
              </label>
              <label className={styles.switchRow}>
                <input
                  type="checkbox"
                  className={styles.switch}
                  checked={streamPreferences.alwaysPublishVods}
                  onChange={(event) =>
                    updateStreamPreferences({ alwaysPublishVods: event.target.checked })
                  }
                />
                <div>
                  <div className={styles.encoderLabel}>Always publish VODs</div>
                  <div className={styles.encoderHint}>VODs will be set public by default.</div>
                </div>
              </label>
              <label className={styles.switchRow}>
                <input
                  type="checkbox"
                  className={styles.switch}
                  checked={streamPreferences.autoClips}
                  onChange={(event) =>
                    updateStreamPreferences({ autoClips: event.target.checked })
                  }
                />
                <div>
                  <div className={styles.encoderLabel}>Auto clips (alpha)</div>
                  <div className={styles.encoderHint}>Experimental: generate quick clips automatically.</div>
                </div>
              </label>
            </div>
          </section>
          <section className={styles.encoderSection}>
            <div className={styles.encoderSectionTitle}>Encoder toolset</div>
            <div className={styles.encoderSectionSubtitle}>
              Download an OBS profile or pair a mobile encoder with your ingest settings.
            </div>
            <div className={styles.encoderTools}>
              <div className={styles.encoderToolCard}>
                <div className={styles.encoderToolHeader}>
                  <div className={styles.encoderToolTitle}>OBS profile</div>
                  <span className={styles.encoderToolBadge}>JSON</span>
                </div>
                <p className={styles.encoderToolBody}>
                  Export ingest URLs, stream keys, and your current preferences for a one-click OBS import.
                </p>
                <div className={styles.encoderToolActions}>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleDownloadObsProfile}
                    disabled={downloadBusy || overviewLoading}
                  >
                    {downloadBusy ? "Preparing..." : "Download profile"}
                  </Button>
                </div>
              </div>
              <div className={styles.encoderToolCard}>
                <div className={styles.encoderToolHeader}>
                  <div className={styles.encoderToolTitle}>Mobile ingest QR</div>
                  <span className={styles.encoderToolBadge}>RTMP</span>
                </div>
                <p className={styles.encoderToolBody}>
                  Scan with a mobile encoder to prefill the ingest URL and stream key instantly.
                </p>
                <div className={styles.encoderQr}>
                  {qrGenerating ? (
                    <div className={styles.encoderQrPlaceholder}>Generating QR…</div>
                  ) : qrError ? (
                    <div className={styles.encoderQrError}>{qrError}</div>
                  ) : qrImageDataUrl ? (
                    <>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={qrImageDataUrl} alt="Mobile ingest QR code" />
                    </>
                  ) : (
                    <div className={styles.encoderQrPlaceholder}>Stream key required</div>
                  )}
                </div>
                <div className={styles.encoderToolActions}>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      mobileIngestPayload
                        ? copy("mobile-ingest", mobileIngestPayload)
                        : undefined
                    }
                    disabled={!mobileIngestPayload}
                  >
                    {copiedField === "mobile-ingest" ? "Copied" : "Copy setup code"}
                  </Button>
                </div>
              </div>
            </div>
          </section>
          <section className={styles.encoderSection}>
            <div className={styles.encoderSectionTitle}>Simulcast destinations</div>
            <div className={styles.encoderSectionSubtitle}>
              Push your broadcast to partner platforms while Capsules manages the master feed.
            </div>
            {streamPreferences.simulcastDestinations.length ? (
              <ul className={styles.encoderDestinationList}>
                {streamPreferences.simulcastDestinations.map((destination) => {
                  const statusLabel = !destination.enabled
                    ? "Disabled"
                    : destination.status === "live"
                      ? "Live"
                      : destination.status === "error"
                        ? "Error"
                        : "Idle";
                  const statusClass = !destination.enabled
                    ? `${styles.encoderDestinationStatus} ${styles.encoderDestinationStatusDisabled}`
                    : destination.status === "live"
                      ? `${styles.encoderDestinationStatus} ${styles.encoderDestinationStatusLive}`
                      : destination.status === "error"
                        ? `${styles.encoderDestinationStatus} ${styles.encoderDestinationStatusError}`
                        : styles.encoderDestinationStatus;
                  return (
                    <li key={destination.id} className={styles.encoderDestinationItem}>
                      <div className={styles.encoderDestinationHeader}>
                        <div className={styles.encoderDestinationHeading}>
                          <span className={styles.encoderDestinationLabel}>{destination.label}</span>
                          <span className={styles.encoderDestinationProvider}>
                            {resolveProviderLabel(destination.provider)}
                          </span>
                        </div>
                        <span className={statusClass}>{statusLabel}</span>
                      </div>
                      <div className={styles.encoderDestinationUrl}>{destination.url}</div>
                      <div className={styles.encoderDestinationMeta}>
                        <span>
                          Stream key: {" "}
                          {destination.streamKey ? maskSecret(destination.streamKey) : "Use account default"}
                        </span>
                        <span>
                          Last sync: {" "}
                          {destination.lastSyncedAt ? formatTimestamp(destination.lastSyncedAt) : "--"}
                        </span>
                      </div>
                      <div className={styles.encoderDestinationActions}>
                        <button
                          type="button"
                          className={styles.encoderActionButton}
                          onClick={() =>
                            copy(`simulcast-url-${destination.id}`, destination.url)
                          }
                        >
                          {copiedField === `simulcast-url-${destination.id}` ? "Copied" : "Copy URL"}
                        </button>
                        {destination.streamKey ? (
                          <button
                            type="button"
                            className={styles.encoderActionButton}
                            onClick={() =>
                              copy(`simulcast-key-${destination.id}`, destination.streamKey)
                            }
                          >
                            {copiedField === `simulcast-key-${destination.id}` ? "Copied" : "Copy key"}
                          </button>
                        ) : null}
                        <button
                          type="button"
                          className={styles.encoderActionButton}
                          onClick={() => handleToggleSimulcastDestination(destination.id)}
                        >
                          {destination.enabled ? "Disable" : "Enable"}
                        </button>
                        <Button
                          variant="ghost"
                          size="xs"
                          onClick={() => handleRemoveSimulcastDestination(destination.id)}
                        >
                          Remove
                        </Button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <div className={styles.encoderEmptyState}>No additional destinations configured yet.</div>
            )}
            {addingDestination ? (
              <form className={styles.encoderForm} onSubmit={handleAddSimulcastDestination}>
                <div className={styles.encoderFormRow}>
                  <div className={styles.encoderFormGroup}>
                    <label className={styles.encoderLabel} htmlFor="simulcast-label">
                      Label
                    </label>
                    <Input
                      id="simulcast-label"
                      value={destinationDraft.label}
                      onChange={(event) => handleDestinationDraftChange("label", event.target.value)}
                      placeholder="Acme Twitch channel"
                    />
                  </div>
                  <div className={styles.encoderFormGroup}>
                    <label className={styles.encoderLabel} htmlFor="simulcast-provider">
                      Platform
                    </label>
                    <select
                      id="simulcast-provider"
                      className={styles.encoderSelect}
                      value={destinationDraft.provider}
                      onChange={(event) => handleDestinationDraftChange("provider", event.target.value)}
                    >
                      {SIMULCAST_PROVIDER_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className={styles.encoderFormGroup}>
                  <label className={styles.encoderLabel} htmlFor="simulcast-url">
                    Ingest URL
                  </label>
                  <Input
                    id="simulcast-url"
                    value={destinationDraft.url}
                    onChange={(event) => handleDestinationDraftChange("url", event.target.value)}
                    placeholder="rtmps://live.twitch.tv/app"
                  />
                </div>
                <div className={styles.encoderFormGroup}>
                  <label className={styles.encoderLabel} htmlFor="simulcast-key">
                    Stream key (optional)
                  </label>
                  <Input
                    id="simulcast-key"
                    value={destinationDraft.streamKey}
                    onChange={(event) => handleDestinationDraftChange("streamKey", event.target.value)}
                    placeholder="sk_live_..."
                  />
                </div>
                {destinationError ? (
                  <div className={styles.encoderFormError}>{destinationError}</div>
                ) : null}
                <div className={styles.encoderFormActions}>
                  <Button variant="outline" size="sm" type="submit">
                    Save destination
                  </Button>
                  <Button variant="ghost" size="sm" type="button" onClick={handleCancelAddDestination}>
                    Cancel
                  </Button>
                </div>
              </form>
            ) : (
              <Button
                variant="ghost"
                size="xs"
                onClick={() => {
                  setDestinationError(null);
                  setAddingDestination(true);
                }}
              >
                Add destination
              </Button>
            )}
          </section>
          <section className={styles.encoderSection}>
            <div className={styles.encoderSectionTitle}>Webhook automation</div>
            <div className={styles.encoderSectionSubtitle}>
              Trigger downstream workflows when your stream starts, ends, or publishes new recordings.
            </div>
            {streamPreferences.webhookEndpoints.length ? (
              <ul className={styles.encoderWebhookList}>
                {streamPreferences.webhookEndpoints.map((endpoint) => (
                  <li key={endpoint.id} className={styles.encoderWebhookItem}>
                    <div className={styles.encoderWebhookHeader}>
                      <div className={styles.encoderWebhookHeading}>
                        <span className={styles.encoderWebhookLabel}>{endpoint.label}</span>
                      </div>
                      <span
                        className={
                          endpoint.enabled
                            ? `${styles.encoderWebhookStatus} ${styles.encoderWebhookStatusEnabled}`
                            : `${styles.encoderWebhookStatus} ${styles.encoderWebhookStatusDisabled}`
                        }
                      >
                        {endpoint.enabled ? "Enabled" : "Disabled"}
                      </span>
                    </div>
                    <div className={styles.encoderWebhookUrl}>{endpoint.url}</div>
                    <div className={styles.encoderWebhookMeta}>
                      <span>
                        Secret: {" "}
                        {endpoint.secret ? maskSecret(endpoint.secret) : "Not configured"}
                      </span>
                      <span>
                        Last delivery: {" "}
                        {endpoint.lastDeliveredAt ? formatTimestamp(endpoint.lastDeliveredAt) : "Never"}
                      </span>
                    </div>
                    {endpoint.events.length ? (
                      <div className={styles.encoderWebhookEvents}>
                        {endpoint.events.map((event) => (
                          <span key={event} className={styles.encoderWebhookEvent}>
                            {event}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <div className={styles.encoderWebhookEventsEmpty}>Listening to all events</div>
                    )}
                    <div className={styles.encoderWebhookActions}>
                      <button
                        type="button"
                        className={styles.encoderActionButton}
                        onClick={() =>
                          copy(`webhook-url-${endpoint.id}`, endpoint.url)
                        }
                      >
                        {copiedField === `webhook-url-${endpoint.id}` ? "Copied" : "Copy URL"}
                      </button>
                      {endpoint.secret ? (
                        <button
                          type="button"
                          className={styles.encoderActionButton}
                          onClick={() =>
                            copy(
                              `webhook-secret-${endpoint.id}`,
                              endpoint.secret ?? "",
                            )
                          }
                        >
                          {copiedField === `webhook-secret-${endpoint.id}` ? "Copied" : "Copy secret"}
                        </button>
                      ) : null}
                      <button
                        type="button"
                        className={styles.encoderActionButton}
                        onClick={() => handleToggleWebhookEndpoint(endpoint.id)}
                      >
                        {endpoint.enabled ? "Disable" : "Enable"}
                      </button>
                      <Button
                        variant="ghost"
                        size="xs"
                        onClick={() => handleRemoveWebhookEndpoint(endpoint.id)}
                      >
                        Remove
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <div className={styles.encoderEmptyState}>No webhooks configured yet.</div>
            )}
            {addingWebhook ? (
              <form className={styles.encoderForm} onSubmit={handleAddWebhookEndpoint}>
                <div className={styles.encoderFormRow}>
                  <div className={styles.encoderFormGroup}>
                    <label className={styles.encoderLabel} htmlFor="webhook-label">
                      Label
                    </label>
                    <Input
                      id="webhook-label"
                      value={webhookDraft.label}
                      onChange={(event) => handleWebhookFieldChange("label", event.target.value)}
                      placeholder="Discord automation"
                    />
                  </div>
                  <div className={styles.encoderFormGroup}>
                    <label className={styles.encoderLabel} htmlFor="webhook-url">
                      Webhook URL
                    </label>
                    <Input
                      id="webhook-url"
                      value={webhookDraft.url}
                      onChange={(event) => handleWebhookFieldChange("url", event.target.value)}
                      placeholder="https://example.com/hooks/capsules"
                    />
                  </div>
                </div>
                <div className={styles.encoderFormGroup}>
                  <label className={styles.encoderLabel} htmlFor="webhook-secret">
                    Signing secret (optional)
                  </label>
                  <Input
                    id="webhook-secret"
                    value={webhookDraft.secret}
                    onChange={(event) => handleWebhookFieldChange("secret", event.target.value)}
                    placeholder="whsec_..."
                  />
                </div>
                <div className={styles.encoderFormGroup}>
                  <div className={styles.encoderLabel}>Events</div>
                  <div className={styles.encoderEventGrid}>
                    {WEBHOOK_EVENT_OPTIONS.map((option) => (
                      <label key={option.value} className={styles.encoderEventOption}>
                        <input
                          type="checkbox"
                          checked={webhookDraft.events.includes(option.value)}
                          onChange={() => handleWebhookEventToggle(option.value)}
                        />
                        <span>{option.label}</span>
                      </label>
                    ))}
                  </div>
                  <span className={styles.encoderHint}>Leave unchecked to receive all stream events.</span>
                </div>
                {webhookError ? <div className={styles.encoderFormError}>{webhookError}</div> : null}
                <div className={styles.encoderFormActions}>
                  <Button variant="outline" size="sm" type="submit">
                    Save webhook
                  </Button>
                  <Button variant="ghost" size="sm" type="button" onClick={handleCancelAddWebhook}>
                    Cancel
                  </Button>
                </div>
              </form>
            ) : (
              <Button
                variant="ghost"
                size="xs"
                onClick={() => {
                  setWebhookError(null);
                  setAddingWebhook(true);
                }}
              >
                Add webhook
              </Button>
            )}
          </section>
          <section className={styles.encoderSection}>
            <div className={styles.encoderSectionTitle}>Stream keys</div>
            <div className={styles.encoderSectionSubtitle}>
              Share with trusted operators only. Rotating the key disconnects any active sessions.
            </div>
            <ul className={styles.encoderList}>
              <li className={styles.encoderRow}>
                <div>
                  <div className={styles.encoderLabel}>Primary stream key</div>
                  <div className={styles.encoderValue}>
                    {showPrimaryKey
                      ? streamOverview.ingest.streamKey
                      : maskSecret(streamOverview.ingest.streamKey)}
                  </div>
                </div>
                <div className={styles.encoderRowActions}>
                  <button
                    type="button"
                    className={styles.encoderActionButton}
                    onClick={() => setShowPrimaryKey((value) => !value)}
                  >
                    {showPrimaryKey ? "Hide" : "Show"}
                  </button>
                  <button
                    type="button"
                    className={styles.encoderActionButton}
                    onClick={() => copy("primary-key", streamOverview.ingest.streamKey)}
                  >
                    {copiedField === "primary-key" ? "Copied" : "Copy"}
                  </button>
                  <Button
                    variant="ghost"
                    size="xs"
                    onClick={handleRotateStreamKey}
                    disabled={actionBusy === "rotate" || overviewLoading}
                  >
                    {actionBusy === "rotate" ? "Rotating..." : "Rotate"}
                  </Button>
                </div>
              </li>
              <li className={styles.encoderRow}>
                <div>
                  <div className={styles.encoderLabel}>Backup stream key</div>
                  <div className={styles.encoderValue}>
                    {streamOverview.ingest.backupStreamKey
                      ? showBackupKey
                        ? streamOverview.ingest.backupStreamKey
                        : maskSecret(streamOverview.ingest.backupStreamKey)
                      : "Not provisioned"}
                  </div>
                </div>
                <div className={styles.encoderRowActions}>
                  <button
                    type="button"
                    className={styles.encoderActionButton}
                    onClick={() => setShowBackupKey((value) => !value)}
                    disabled={!streamOverview.ingest.backupStreamKey}
                  >
                    {showBackupKey ? "Hide" : "Show"}
                  </button>
                  <button
                    type="button"
                    className={styles.encoderActionButton}
                    onClick={() =>
                      copy("backup-key", streamOverview.ingest.backupStreamKey)
                    }
                    disabled={!streamOverview.ingest.backupStreamKey}
                  >
                    {copiedField === "backup-key" ? "Copied" : "Copy"}
                  </button>
                </div>
              </li>
            </ul>
          </section>
          <section className={styles.encoderSection}>
            <div className={styles.encoderSectionTitle}>Playback &amp; embeds</div>
            <div className={styles.encoderSectionSubtitle}>
              Use the Mux player embed or raw HLS URL to power your Capsule portal or landing pages.
            </div>
            <ul className={styles.encoderList}>
              <li className={styles.encoderRow}>
                <div>
                  <div className={styles.encoderLabel}>Playback URL</div>
                  <div className={styles.encoderValue}>{playbackUrl ?? "--"}</div>
                </div>
                <button
                  type="button"
                  className={styles.encoderActionButton}
                  onClick={() => copy("playback-url", playbackUrl)}
                >
                  {copiedField === "playback-url" ? "Copied" : "Copy"}
                </button>
              </li>
              <li className={styles.encoderRow}>
                <div>
                  <div className={styles.encoderLabel}>Mux player embed</div>
                  <div className={styles.encoderValue}>
                    {embedCodeSnippet ?? "<mux-player stream-type=\"live\" playback-id=\"...\" />"}
                  </div>
                </div>
                <button
                  type="button"
                  className={styles.encoderActionButton}
                  onClick={() => copy("embed-code", embedCodeSnippet)}
                  disabled={!embedCodeSnippet}
                >
                  {copiedField === "embed-code" ? "Copied" : "Copy"}
                </button>
              </li>
            </ul>
          </section>
        </div>
        <section className={styles.encoderSection}>
          <div className={styles.encoderSectionTitle}>Reliability &amp; recording plan</div>
          <div className={styles.encoderSectionSubtitle}>
            Mux automatically records each broadcast and we keep the resulting assets in your Capsule
            library. Pair this with local capture inside your studio for redundancy.
          </div>
          <div className={styles.encoderChecklist}>
            <div className={styles.encoderChecklistItem}>Cloud recording for every live session</div>
            <div className={styles.encoderChecklistItem}>
              Configure OBS backups with the provided ingest pair
            </div>
            <div className={styles.encoderChecklistItem}>
              Trigger Capsules automation via webhook on stream events
            </div>
          </div>
        </section>

      </div>
    );
  };

  const renderClipsContent = () => {
    if (!selectedCapsule) {
      return (
        <div className={styles.noticeCard}>
          <h3>Select a Capsule to review clips and highlights</h3>
          <p>The Clips view surfaces recent live recordings and AI-generated jobs for your Capsule.</p>
        </div>
      );
    }

    if (overviewLoading && !streamOverview) {
      return (
        <div className={styles.noticeCard}>
          <h3>Loading recordings...</h3>
          <p>Collecting the latest Mux assets for {selectedCapsule.name}.</p>
        </div>
      );
    }

    if (
      !streamOverview ||
      (streamOverview.assets.length === 0 && streamOverview.aiJobs.length === 0)
    ) {
      return (
        <div className={styles.noticeCard}>
          <h3>No recordings yet</h3>
          <p>
            Once you go live, your sessions will appear here automatically so you can publish clips and
            highlights.
          </p>
        </div>
      );
    }

    const assets = streamOverview.assets.slice(0, 8);
    const jobs = streamOverview.aiJobs.slice(0, 8);
    const statusClassFor = (status: string) => {
      const normalized = status.toLowerCase();
      if (["completed", "succeeded", "finished", "ready"].includes(normalized)) {
        return styles.clipStatusCompleted;
      }
      if (["running", "processing", "active", "in_progress", "started"].includes(normalized)) {
        return styles.clipStatusRunning;
      }
      if (["failed", "errored", "error", "cancelled", "canceled"].includes(normalized)) {
        return styles.clipStatusErrored;
      }
      return styles.clipStatusPending;
    };

    return (
      <div className={styles.encoderLayout}>
        <section className={styles.encoderSection}>
          <div className={styles.encoderSectionTitle}>Recent recordings</div>
          <div className={styles.encoderSectionSubtitle}>
            Mux automatically archived these sessions. Click to open the playback asset or copy the
            shareable link.
          </div>
          <ul className={styles.encoderList}>
            {assets.length ? (
              assets.map((asset) => {
                const durationValue =
                  typeof asset.durationSeconds === "number"
                    ? asset.durationSeconds
                    : asset.durationSeconds
                      ? Number(asset.durationSeconds)
                      : null;
                const durationLabel = formatDuration(durationValue);
                const metaParts = [
                  formatJobStatusLabel(asset.status),
                  durationLabel !== "--" ? durationLabel : null,
                  formatTimestamp(asset.readyAt ?? asset.createdAt),
                ].filter((part): part is string => Boolean(part && part !== "--"));

                return (
                  <li key={asset.id} className={styles.clipRow}>
                    <div className={styles.clipMeta}>
                      <div className={styles.clipTitle}>{asset.muxAssetId}</div>
                      <div className={styles.clipSubtitle}>
                        {metaParts.length ? metaParts.join(" | ") : "Awaiting asset details"}
                      </div>
                    </div>
                    <div className={styles.clipActions}>
                      <Button
                        variant="ghost"
                        size="xs"
                        onClick={() => copy(`asset-${asset.id}`, asset.playbackUrl)}
                        disabled={!asset.playbackUrl}
                      >
                        {copiedField === `asset-${asset.id}` ? "Copied" : "Copy URL"}
                      </Button>
                      {asset.playbackUrl ? (
                        <Button
                          variant="outline"
                          size="xs"
                          onClick={() => window.open(asset.playbackUrl ?? "", "_blank")}
                        >
                          Open
                        </Button>
                      ) : null}
                    </div>
                  </li>
                );
              })
            ) : (
              <li className={styles.clipRow}>
                <div className={styles.clipMeta}>
                  <div className={styles.clipSubtitle}>No recordings are available yet.</div>
                </div>
              </li>
            )}
          </ul>
        </section>
        <section className={styles.encoderSection}>
          <div className={styles.encoderSectionTitle}>AI pipeline jobs</div>
          <div className={styles.encoderSectionSubtitle}>
            Track Clips, highlight summaries, and other automation generated from your streams.
          </div>
          <ul className={styles.encoderList}>
            {jobs.length ? (
              jobs.map((job) => {
                const timelineParts: string[] = [];
                const queuedLabel = formatTimestamp(job.createdAt);
                if (queuedLabel !== "--") {
                  timelineParts.push(`Queued ${queuedLabel}`);
                }
                if (job.startedAt) {
                  const startedLabel = formatTimestamp(job.startedAt);
                  if (startedLabel !== "--") {
                    timelineParts.push(`Started ${startedLabel}`);
                  }
                }
                if (job.completedAt) {
                  const completedLabel = formatTimestamp(job.completedAt);
                  if (completedLabel !== "--") {
                    timelineParts.push(`Completed ${completedLabel}`);
                  }
                }
                const runtimeSeconds = computeElapsedSeconds(job.startedAt, job.completedAt);
                const runtimeLabel = formatDuration(runtimeSeconds);
                if (runtimeLabel !== "--") {
                  timelineParts.push(`Duration ${runtimeLabel}`);
                }
                if (job.priority) {
                  timelineParts.push(`Priority ${job.priority}`);
                }

                return (
                  <li key={job.id} className={styles.clipRow}>
                    <div className={styles.clipMeta}>
                      <div className={styles.clipTitle}>{formatJobDisplayName(job.jobType)}</div>
                      <div className={styles.clipSubtitle}>
                        {timelineParts.length ? timelineParts.join(" | ") : "Job queued"}
                      </div>
                    </div>
                    <div className={styles.clipActions}>
                      <span className={`${styles.clipStatus} ${statusClassFor(job.status)}`}>
                        {formatJobStatusLabel(job.status)}
                      </span>
                      {job.priority ? (
                        <span className={styles.clipStatusMeta}>Priority {job.priority}</span>
                      ) : null}
                    </div>
                  </li>
                );
              })
            ) : (
              <li className={styles.clipRow}>
                <div className={styles.clipMeta}>
                  <div className={styles.clipSubtitle}>No AI jobs have been queued yet.</div>
                </div>
              </li>
            )}
          </ul>
        </section>
      </div>
    );
  };

  return (
    <div className={`${capTheme.theme} ${styles.shellWrap}`}>
      <header className={styles.navBar}>
        <div className={styles.navTabs} role="tablist" aria-label="AI Stream Studio sections">
          {TAB_ITEMS.map((tab) => {
            const isActive = activeTab === tab.id;
            const baseClass = `${styles.navButton}`;
            const btnClass = isActive ? `${baseClass} ${styles.navButtonActive}` : baseClass;
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={isActive}
                className={btnClass}
                onClick={() => handleTabChange(tab.id)}
              >
                {tab.icon}
                {tab.label}
              </button>
            );
          })}
        </div>
      </header>

      <main className={styles.contentArea}>
        {activeTab === "studio"
          ? renderStudioContent()
          : activeTab === "producer"
            ? renderProducerContent()
            : activeTab === "encoder"
              ? renderEncoderContent()
              : renderClipsContent()}
      </main>
    </div>
  );
}
