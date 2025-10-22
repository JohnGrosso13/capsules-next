"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { downloadObsProfile, normalizeMuxError, triggerWebhookTest } from "@/lib/mux/liveClient";
import type { CapsuleSummary } from "@/server/capsules/service";

import styles from "@/app/(authenticated)/create/ai-stream/ai-stream.page.module.css";
import capTheme from "@/app/(authenticated)/capsule/capsule.module.css";
import encoderStyles from "./tabs/EncoderTab.module.css";
import {
  ExternalEncoderTab,
  type DestinationDraft,
  type WebhookDraft,
} from "./tabs/ExternalEncoderTab";
import {
  AiStreamStudioStoreProvider,
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
import {
  StudioNotificationBanner,
  type StudioNotification,
} from "./StudioNotificationBanner";
import type { StudioTab } from "./types";
import type { StreamSimulcastDestination, StreamWebhookEndpoint } from "@/types/ai-stream";
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
      refreshOverview,
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
  const [webhookTestStatus, setWebhookTestStatus] = React.useState<
    Record<string, "idle" | "pending" | "success" | "error">
  >({});
  const webhookTestTimersRef = React.useRef<Record<string, number>>({});
  const [uptimeTick, setUptimeTick] = React.useState(() => Date.now());

  React.useEffect(() => {
    return () => {
      Object.values(webhookTestTimersRef.current).forEach((timerId) =>
        window.clearTimeout(timerId),
      );
      webhookTestTimersRef.current = {};
    };
  }, []);
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

  const handleStartAddDestination = React.useCallback(() => {
    setDestinationError(null);
    setAddingDestination(true);
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

  const handleSendWebhookTest = React.useCallback(
    async (endpointId: string) => {
      if (!selectedCapsuleId) return;
      const currentStatus = webhookTestStatus[endpointId];
      if (currentStatus === "pending") {
        return;
      }
      setWebhookTestStatus((prev) => ({ ...prev, [endpointId]: "pending" }));
      if (webhookTestTimersRef.current[endpointId]) {
        window.clearTimeout(webhookTestTimersRef.current[endpointId]);
        delete webhookTestTimersRef.current[endpointId];
      }
      try {
        await triggerWebhookTest({ capsuleId: selectedCapsuleId, endpointId });
        setWebhookTestStatus((prev) => ({ ...prev, [endpointId]: "success" }));
        const timer = window.setTimeout(() => {
          setWebhookTestStatus((prev) => ({ ...prev, [endpointId]: "idle" }));
          delete webhookTestTimersRef.current[endpointId];
        }, 2500);
        webhookTestTimersRef.current[endpointId] = timer;
      } catch (error) {
        const normalizedError = normalizeMuxError(error, "Failed to send webhook test event.");
        setOverviewError(normalizedError.message);
        setWebhookTestStatus((prev) => ({ ...prev, [endpointId]: "error" }));
        const timer = window.setTimeout(() => {
          setWebhookTestStatus((prev) => ({ ...prev, [endpointId]: "idle" }));
          delete webhookTestTimersRef.current[endpointId];
        }, 2500);
        webhookTestTimersRef.current[endpointId] = timer;
      }
    },
    [selectedCapsuleId, webhookTestStatus, setOverviewError],
  );

  const handleStartAddWebhook = React.useCallback(() => {
    setWebhookError(null);
    setAddingWebhook(true);
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

  const simulcastErrorCount = React.useMemo(
    () =>
      streamPreferences.simulcastDestinations.filter(
        (destination) => destination.enabled && destination.status === "error",
      ).length,
    [streamPreferences.simulcastDestinations],
  );

  const recentHealthError = streamOverview?.health.recentError ?? "";
  const keyRotationSuggested = React.useMemo(() => {
    const combined = `${recentHealthError}\n${overviewError ?? ""}`.toLowerCase();
    return ["stream key", "invalid key", "unauthorized"].some((needle) =>
      combined.includes(needle),
    );
  }, [overviewError, recentHealthError]);

  const handleStatusRefresh = React.useCallback(() => {
    void refreshOverview({ silent: false });
  }, [refreshOverview]);

  const encoderNotification = React.useMemo<StudioNotification | null>(() => {
    const navigateToEncoder = () => handleTabChange("encoder");

    if (overviewLoading && !streamOverview) {
      return null;
    }

    if (overviewError) {
      return {
        tone: "danger",
        title: "Streaming requires attention",
        description: overviewError,
        actions: [
          { label: "Open Encoder", onClick: navigateToEncoder, variant: "ghost", size: "xs" },
          { label: "Refresh", onClick: handleStatusRefresh, variant: "outline", size: "xs" },
        ],
      };
    }

    if (!streamOverview) {
      return {
        tone: "warning",
        title: "Configure your external encoder",
        description:
          "Generate RTMP credentials and automation targets in the External Encoder tab before going live.",
        actions: [
          { label: "Set up streaming", onClick: navigateToEncoder, variant: "ghost", size: "xs" },
        ],
      };
    }

    if (simulcastErrorCount > 0) {
      const description =
        simulcastErrorCount === 1
          ? "One simulcast destination is failing to sync. Review the External Encoder tab."
          : `${simulcastErrorCount} simulcast destinations are failing to sync. Review the External Encoder tab.`;
      return {
        tone: "danger",
        title: "Simulcast destinations require attention",
        description,
        actions: [
          { label: "Review destinations", onClick: navigateToEncoder, variant: "ghost", size: "xs" },
          { label: "Refresh", onClick: handleStatusRefresh, variant: "outline", size: "xs" },
        ],
      };
    }

    if (keyRotationSuggested) {
      return {
        tone: "warning",
        title: "Rotate your stream key",
        description:
          "Mux rejected the incoming signal. Rotate the stream key before going live again.",
        actions: [
          { label: "Open Encoder", onClick: navigateToEncoder, variant: "ghost", size: "xs" },
        ],
      };
    }

    const health = streamOverview.health;
    const status = health.status.toLowerCase();

    if (health.recentError) {
      return {
        tone: "danger",
        title: "Mux reported an ingest error",
        description:
          health.recentError ??
          (health.lastSeenAt
            ? `Last successful heartbeat ${formatTimestamp(health.lastSeenAt)}`
            : "Mux stopped receiving a signal from this encoder."),
        actions: [
          { label: "Review encoder", onClick: navigateToEncoder, variant: "ghost", size: "xs" },
          { label: "Refresh", onClick: handleStatusRefresh, variant: "outline", size: "xs" },
        ],
      };
    }

    if (status !== "active" && status !== "connected") {
      return {
        tone: "info",
        title: "Awaiting encoder signal",
        description: health.lastSeenAt
          ? `Mux last saw this encoder ${formatTimestamp(
              health.lastSeenAt,
            )}. Start streaming from OBS or your encoder to preview the feed.`
          : "Start streaming from OBS or your encoder to preview the feed.",
        actions: [
          { label: "Check encoder", onClick: navigateToEncoder, variant: "ghost", size: "xs" },
        ],
      };
    }

    return null;
  }, [
    handleStatusRefresh,
    handleTabChange,
    keyRotationSuggested,
    overviewError,
    overviewLoading,
    simulcastErrorCount,
    streamOverview,
  ]);

  const navIndicators = React.useMemo(() => {
    const indicators: Partial<
      Record<
        StudioTab,
        { tone: "brand" | "neutral" | "success" | "warning" | "danger" | "info"; label: string }
      >
    > = {};

    if (activeSession) {
      indicators.studio = { tone: "success", label: "Live" };
    } else if (streamOverview) {
      indicators.studio = { tone: "info", label: streamOverview.health.status };
    }

    if (!streamOverview) {
      indicators.encoder = { tone: "warning", label: "Setup" };
      indicators.clips = { tone: "neutral", label: "Waiting setup" };
    } else {
      if (simulcastErrorCount > 0) {
        const label = simulcastErrorCount === 1 ? "Simulcast issue" : `${simulcastErrorCount} issues`;
        indicators.encoder = { tone: "danger", label };
        indicators.producer = { tone: "danger", label: "Simulcast issue" };
      }

      if (keyRotationSuggested) {
        indicators.encoder = { tone: "warning", label: "Rotate key" };
      }

      if (streamOverview.assets.length === 0 && streamOverview.aiJobs.length === 0) {
        indicators.clips = { tone: "neutral", label: "No recordings" };
      } else if (streamOverview.assets.length) {
        indicators.clips = {
          tone: "info",
          label:
            streamOverview.assets.length === 1
              ? "1 recording"
              : `${Math.min(streamOverview.assets.length, 9)} recordings`,
        };
      }
    }

    return indicators;
  }, [activeSession, keyRotationSuggested, simulcastErrorCount, streamOverview]);

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
      notification={encoderNotification}
      onEnsureStream={handleEnsureStream}
      onNavigateToEncoder={() => handleTabChange("encoder")}
    />
  );
  const renderProducerContent = () => (
    <ProducerConsoleTab
      selectedCapsule={selectedCapsule}
      notification={encoderNotification}
    />
  );

const renderEncoderContent = () => {
  if (!selectedCapsule) {
    return (
      <Card variant="outline" className={encoderStyles.emptyCard}>
        <CardHeader>
          <CardTitle>Choose a Capsule to set up external encoders</CardTitle>
          <CardDescription>
            We&apos;ll generate RTMP credentials, latency profiles, and simulcast targets specific
            to your selected Capsule once it&apos;s chosen.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  if (overviewLoading && !streamOverview) {
    return (
      <Card className={encoderStyles.emptyCard}>
        <CardHeader>
          <CardTitle>Loading streaming configuration...</CardTitle>
          <CardDescription>Retrieving the latest credentials from Mux.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  if (!streamOverview) {
    return (
      <Card className={encoderStyles.emptyCard}>
        <CardHeader>
          <CardTitle>Generate Mux streaming credentials</CardTitle>
          <CardDescription>
            Pick the desired latency profile and create a dedicated live stream for {selectedCapsule.name}.
            We&apos;ll provision RTMP ingest URLs and stream keys instantly.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className={encoderStyles.latencyInline}>
            <label className={encoderStyles.latencySelectWrapper}>
              <span>Latency profile</span>
              <select
                value={streamPreferences.latencyMode}
                onChange={handleLatencyChange}
                className={encoderStyles.latencySelect}
              >
                <option value="low">Low latency</option>
                <option value="reduced">Reduced latency</option>
                <option value="standard">Standard latency</option>
              </select>
            </label>
            <Button
              variant="gradient"
              size="sm"
              onClick={handleEnsureStream}
              loading={actionBusy === "ensure"}
              disabled={overviewLoading}
            >
              Create live stream
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <ExternalEncoderTab
      capsuleName={selectedCapsule.name}
      activeSession={activeSession}
      streamOverview={streamOverview}
      streamPreferences={streamPreferences}
      overviewLoading={overviewLoading}
      overviewError={overviewError}
      actionBusy={actionBusy}
      onEnsureStream={handleEnsureStream}
      onLatencyChange={handleLatencyChange}
      onRotateStreamKey={handleRotateStreamKey}
      onDownloadObsProfile={handleDownloadObsProfile}
      onCopy={copy}
      copiedField={copiedField}
      maskSecret={maskSecret}
      showPrimaryKey={showPrimaryKey}
      onTogglePrimaryKey={() => setShowPrimaryKey((value) => !value)}
      showBackupKey={showBackupKey}
      onToggleBackupKey={() => setShowBackupKey((value) => !value)}
      downloadBusy={downloadBusy}
      qrGenerating={qrGenerating}
      qrError={qrError}
      qrImageDataUrl={qrImageDataUrl}
      mobileIngestPayload={mobileIngestPayload}
      simulcastDraft={destinationDraft}
      onSimulcastDraftChange={handleDestinationDraftChange}
      simulcastOptions={SIMULCAST_PROVIDER_OPTIONS}
      addingDestination={addingDestination}
      onStartAddDestination={handleStartAddDestination}
      onAddSimulcastDestination={handleAddSimulcastDestination}
      onCancelAddDestination={handleCancelAddDestination}
      destinationError={destinationError}
      onToggleDestination={handleToggleSimulcastDestination}
      onRemoveDestination={handleRemoveSimulcastDestination}
      resolveProviderLabel={resolveProviderLabel}
      webhookDraft={webhookDraft}
      onWebhookFieldChange={handleWebhookFieldChange}
      onWebhookEventToggle={handleWebhookEventToggle}
      webhookOptions={WEBHOOK_EVENT_OPTIONS}
      addingWebhook={addingWebhook}
      onStartAddWebhook={handleStartAddWebhook}
      onAddWebhookEndpoint={handleAddWebhookEndpoint}
      onCancelAddWebhook={handleCancelAddWebhook}
      webhookError={webhookError}
      onToggleWebhook={handleToggleWebhookEndpoint}
      onRemoveWebhook={handleRemoveWebhookEndpoint}
      playbackUrl={playbackUrl}
      embedCodeSnippet={embedCodeSnippet}
      onUpdatePreferences={updateStreamPreferences}
      defaultPrimaryIngestUrl={DEFAULT_PRIMARY_INGEST_URL}
      webhookTestStatus={webhookTestStatus}
      onSendWebhookTest={handleSendWebhookTest}
    />
  );
};

  const renderClipsContent = () => {
    const encoderBannerClassName = styles.encoderBanner ?? "";
    const notificationBanner = encoderNotification ? (
      <StudioNotificationBanner
        notification={encoderNotification}
        className={encoderBannerClassName}
      />
    ) : null;

    if (!selectedCapsule) {
      return (
        <>
          {notificationBanner}
          <div className={styles.noticeCard}>
            <h3>Select a Capsule to review clips and highlights</h3>
            <p>The Clips view surfaces recent live recordings and AI-generated jobs for your Capsule.</p>
          </div>
        </>
      );
    }

    if (overviewLoading && !streamOverview) {
      return (
        <>
          {notificationBanner}
          <div className={styles.noticeCard}>
            <h3>Loading recordings...</h3>
            <p>Collecting the latest Mux assets for {selectedCapsule.name}.</p>
          </div>
        </>
      );
    }

    if (
      !streamOverview ||
      (streamOverview.assets.length === 0 && streamOverview.aiJobs.length === 0)
    ) {
      return (
        <>
          {notificationBanner}
          <div className={styles.noticeCard}>
            <h3>No recordings yet</h3>
            <p>
              Once you go live, your sessions will appear here automatically so you can publish clips and
              highlights.
            </p>
          </div>
        </>
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
      <div className={encoderStyles.encoderLayout}>
        {notificationBanner}
        <section className={encoderStyles.encoderSection}>
          <div className={encoderStyles.encoderSectionTitle}>Recent recordings</div>
          <div className={encoderStyles.encoderSectionSubtitle}>
            Mux automatically archived these sessions. Click to open the playback asset or copy the
            shareable link.
          </div>
          <ul className={encoderStyles.encoderList}>
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
        <section className={encoderStyles.encoderSection}>
          <div className={encoderStyles.encoderSectionTitle}>AI pipeline jobs</div>
          <div className={encoderStyles.encoderSectionSubtitle}>
            Track Clips, highlight summaries, and other automation generated from your streams.
          </div>
          <ul className={encoderStyles.encoderList}>
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
            const indicator = navIndicators[tab.id];
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
                <span className={styles.navButtonLabel}>{tab.label}</span>
                {indicator ? (
                  <span className={styles.navBadge}>
                    <Badge variant="soft" tone={indicator.tone} size="sm">
                      {indicator.label}
                    </Badge>
                  </span>
                ) : null}
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





