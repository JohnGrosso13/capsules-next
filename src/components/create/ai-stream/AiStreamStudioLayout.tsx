"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { Button } from "@/components/ui/button";
import type { CapsuleSummary } from "@/server/capsules/service";
import { PanelGroup, Panel, PanelResizeHandle } from "react-resizable-panels";
import { LiveChatRail } from "@/components/live/LiveChatRail";

import { AiStreamCapsuleGate } from "./AiStreamCapsuleGate";
import styles from "@/app/(authenticated)/create/ai-stream/ai-stream.page.module.css";
import capTheme from "@/app/(authenticated)/capsule/capsule.module.css";
import { getBrowserSupabaseClient } from "@/lib/supabase/browser";
import {
  Broadcast,
  SquaresFour,
  Storefront,
  Paperclip,
  Microphone,
  CaretDown,
  FilmSlate,
} from "@phosphor-icons/react/dist/ssr";
import MuxPlayer from "@mux/mux-player-react";
import type { SupabaseClient } from "@supabase/supabase-js";

type StudioTab = "studio" | "producer" | "encoder" | "clips";

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

type StreamSession = {
  id: string;
  status: string;
  startedAt: string | null;
  endedAt: string | null;
  durationSeconds: number | null;
  createdAt: string;
  updatedAt: string;
};

type StreamAsset = {
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

type StreamAiJob = {
  id: string;
  jobType: string;
  status: string;
  priority: number;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

type StreamOverview = {
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
  sessions: StreamSession[];
  assets: StreamAsset[];
  aiJobs: StreamAiJob[];
};

type MuxRealtimeTable = "mux_live_streams" | "mux_live_stream_sessions" | "mux_assets" | "mux_ai_jobs";

type StreamPreferences = {
  latencyMode: "low" | "reduced" | "standard";
  disconnectProtection: boolean;
  audioWarnings: boolean;
  storePastBroadcasts: boolean;
  alwaysPublishVods: boolean;
  autoClips: boolean;
};

const DEFAULT_STREAM_PREFERENCES: StreamPreferences = {
  latencyMode: "low",
  disconnectProtection: true,
  audioWarnings: true,
  storePastBroadcasts: true,
  alwaysPublishVods: true,
  autoClips: false,
};

type StreamOverviewResponse = {
  overview: StreamOverview | null;
  preferences: StreamPreferences;
};

function formatJobDisplayName(value: string): string {
  if (!value) return "Automation job";
  return value
    .replace(/[_-]+/g, " ")
    .split(" ")
    .map((part) => {
      const lower = part.toLowerCase();
      if (!part) return part;
      if (lower === "ai") return "AI";
      return part.charAt(0).toUpperCase() + part.slice(1);
    })
    .join(" ");
}

function formatJobStatusLabel(value: string): string {
  if (!value) return "Pending";
  return value
    .replace(/[_-]+/g, " ")
    .split(" ")
    .map((part) => {
      const lower = part.toLowerCase();
      if (!part) return part;
      if (lower === "ai") return "AI";
      return part.charAt(0).toUpperCase() + part.slice(1);
    })
    .join(" ");
}

function computeElapsedSeconds(
  start: string | null | undefined,
  end: string | null | undefined,
): number | null {
  if (!start || !end) return null;
  const startMs = Date.parse(start);
  const endMs = Date.parse(end);
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) return null;
  return Math.round((endMs - startMs) / 1000);
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

type AiStreamStudioLayoutProps = {
  capsules: CapsuleSummary[];
  initialView?: StudioTab;
  layoutOwnerId: string;
  layoutView?: string;
  initialPanelLayouts?: Record<string, unknown>;
};

function normalizeTab(value: string | null | undefined, fallback: StudioTab): StudioTab {
  if (!value) return fallback;
  const maybe = value.toLowerCase() as StudioTab;
  if (TAB_SET.has(maybe)) {
    return maybe;
  }
  return fallback;
}

export function AiStreamStudioLayout({
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

  const initialTab = React.useMemo(
    () => normalizeTab(initialView, "studio"),
    [initialView],
  );
  const [activeTab, setActiveTab] = React.useState<StudioTab>(initialTab);

  const [selectedCapsuleId, setSelectedCapsuleId] = React.useState<string | null>(null);

  const selectedCapsule = React.useMemo(() => {
    if (!selectedCapsuleId) return null;
    return capsules.find((capsule) => capsule.id === selectedCapsuleId) ?? null;
  }, [capsules, selectedCapsuleId]);

  const [selectorOpen, setSelectorOpen] = React.useState(true);

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

  const [streamOverview, setStreamOverview] = React.useState<StreamOverview | null>(null);
  const [overviewLoading, setOverviewLoading] = React.useState(false);
  const [overviewError, setOverviewError] = React.useState<string | null>(null);
  const [actionBusy, setActionBusy] = React.useState<"ensure" | "rotate" | null>(null);
  const [streamPreferences, setStreamPreferences] = React.useState<StreamPreferences>(
    DEFAULT_STREAM_PREFERENCES,
  );
  const [copiedField, setCopiedField] = React.useState<string | null>(null);
  const [showPrimaryKey, setShowPrimaryKey] = React.useState(false);
  const [showBackupKey, setShowBackupKey] = React.useState(false);
  const [uptimeTick, setUptimeTick] = React.useState(() => Date.now());
  const supabaseRef = React.useRef<SupabaseClient | null>(null);
  const streamOverviewRef = React.useRef<StreamOverview | null>(null);
  const fetchControllerRef = React.useRef<AbortController | null>(null);
  const refreshTimerRef = React.useRef<number | null>(null);
  const preferenceSaveControllerRef = React.useRef<AbortController | null>(null);
  const skipPreferencePersistRef = React.useRef(true);
  const preferenceHydrationPendingRef = React.useRef(false);
  const lastPersistedPreferencesRef = React.useRef<string>(
    JSON.stringify(DEFAULT_STREAM_PREFERENCES),
  );

  const applyServerPreferences = React.useCallback((incoming?: StreamPreferences | null) => {
    const normalized = incoming
      ? { ...DEFAULT_STREAM_PREFERENCES, ...incoming }
      : { ...DEFAULT_STREAM_PREFERENCES };
    skipPreferencePersistRef.current = true;
    preferenceHydrationPendingRef.current = true;
    setStreamPreferences(normalized);
    lastPersistedPreferencesRef.current = JSON.stringify(normalized);
  }, []);

  const updateStreamPreferences = React.useCallback((updates: Partial<StreamPreferences>) => {
    setStreamPreferences((prev) => ({ ...prev, ...updates }));
  }, []);

  const preferenceSignature = React.useMemo(
    () => JSON.stringify(streamPreferences),
    [streamPreferences],
  );

  const dateFormatter = React.useMemo(
    () => new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }),
    [],
  );

  const formatTimestamp = React.useCallback(
    (value: string | null | undefined) => {
      if (!value) return "--";
      const parsed = Date.parse(value);
      if (!Number.isFinite(parsed)) return "--";
      return dateFormatter.format(new Date(parsed));
    },
    [dateFormatter],
  );

  const formatDuration = React.useCallback((input: number | null | undefined) => {
    if (!input || input <= 0) return "--";
    const totalSeconds = Math.floor(input);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    return [hours, minutes, seconds]
      .map((value) => value.toString().padStart(2, "0"))
      .join(":");
  }, []);

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

  React.useEffect(() => {
    streamOverviewRef.current = streamOverview;
  }, [streamOverview]);

  React.useEffect(() => {
    if (!preferenceHydrationPendingRef.current) return;
    preferenceHydrationPendingRef.current = false;
    skipPreferencePersistRef.current = false;
  }, [streamPreferences]);

  const fetchOverview = React.useCallback(
    async (capsuleId: string, options?: { silent?: boolean }) => {
      const silent = options?.silent ?? false;
      const controller = new AbortController();
      if (fetchControllerRef.current) {
        fetchControllerRef.current.abort();
      }
      fetchControllerRef.current = controller;

      if (!silent || !streamOverviewRef.current) {
        setOverviewLoading(true);
      }
      if (!silent) {
        setOverviewError(null);
      }

      try {
        const response = await fetch(`/api/mux/live?capsuleId=${encodeURIComponent(capsuleId)}`, {
          method: "GET",
          cache: "no-store",
          signal: controller.signal,
        });

        if (response.ok) {
          const payload = (await response.json()) as StreamOverviewResponse;
          setStreamOverview(payload.overview ?? null);
          streamOverviewRef.current = payload.overview ?? null;
          applyServerPreferences(payload.preferences);
          setOverviewError(null);
        } else if (response.status === 404) {
          setStreamOverview(null);
          streamOverviewRef.current = null;
          applyServerPreferences(null);
          if (!silent) {
            setOverviewError(null);
          }
        } else if (!silent) {
          let message = "Failed to load stream overview.";
          try {
            const body = await response.json();
            if (body && typeof body.message === "string") {
              message = body.message;
            }
          } catch {
            // ignore parse errors
          }
          setOverviewError(message);
        }
      } catch (error) {
        if (controller.signal.aborted) return;
        console.warn("mux.live.overview", error);
        if (!silent) {
          setOverviewError("Failed to load stream overview.");
        }
      } finally {
        if (fetchControllerRef.current === controller) {
          fetchControllerRef.current = null;
        }
        if (!silent || !streamOverviewRef.current) {
          setOverviewLoading(false);
        }
      }
    },
    [applyServerPreferences],
  );

  React.useEffect(() => {
    if (!selectedCapsuleId) {
      if (fetchControllerRef.current) {
        fetchControllerRef.current.abort();
        fetchControllerRef.current = null;
      }
      if (preferenceSaveControllerRef.current) {
        preferenceSaveControllerRef.current.abort();
        preferenceSaveControllerRef.current = null;
      }
      skipPreferencePersistRef.current = true;
      preferenceHydrationPendingRef.current = false;
      setStreamPreferences(DEFAULT_STREAM_PREFERENCES);
      lastPersistedPreferencesRef.current = JSON.stringify(DEFAULT_STREAM_PREFERENCES);
      setStreamOverview(null);
      setOverviewError(null);
      setOverviewLoading(false);
      return;
    }

    fetchOverview(selectedCapsuleId);

    return () => {
      if (fetchControllerRef.current) {
        fetchControllerRef.current.abort();
        fetchControllerRef.current = null;
      }
    };
  }, [fetchOverview, selectedCapsuleId]);

  React.useEffect(() => {
    if (!selectedCapsuleId) {
      return;
    }
    if (skipPreferencePersistRef.current) {
      return;
    }
    if (preferenceSignature === lastPersistedPreferencesRef.current) {
      return;
    }

    const controller = new AbortController();
    if (preferenceSaveControllerRef.current) {
      preferenceSaveControllerRef.current.abort();
    }
    preferenceSaveControllerRef.current = controller;

    const persist = async () => {
      try {
        const response = await fetch("/api/mux/live", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            capsuleId: selectedCapsuleId,
            preferences: streamPreferences,
          }),
          signal: controller.signal,
        });

        if (response.ok) {
          const payload = (await response.json()) as StreamOverviewResponse;
          applyServerPreferences(payload.preferences);
          setStreamOverview(payload.overview ?? null);
          streamOverviewRef.current = payload.overview ?? null;
          lastPersistedPreferencesRef.current = JSON.stringify(payload.preferences);
        } else if (!controller.signal.aborted) {
          console.warn("mux.preferences.persist.failed", response.status);
        }
      } catch (error) {
        if (!controller.signal.aborted) {
          console.warn("mux.preferences.persist.error", error);
        }
      }
    };

    void persist();

    return () => {
      controller.abort();
    };
  }, [applyServerPreferences, preferenceSignature, selectedCapsuleId, streamPreferences]);

  const scheduleOverviewRefresh = React.useCallback(
    (reason: MuxRealtimeTable) => {
      if (!selectedCapsuleId) return;
      if (refreshTimerRef.current) {
        window.clearTimeout(refreshTimerRef.current);
        refreshTimerRef.current = null;
      }
      const shouldShowSpinner = !streamOverviewRef.current;
      const delay = reason === "mux_live_streams" ? 120 : 220;
      refreshTimerRef.current = window.setTimeout(() => {
        refreshTimerRef.current = null;
        fetchOverview(selectedCapsuleId, { silent: !shouldShowSpinner });
      }, delay);
    },
    [fetchOverview, selectedCapsuleId],
  );

  React.useEffect(() => {
    if (typeof window === "undefined") return;
    if (!selectedCapsuleId) return;

    if (!supabaseRef.current) {
      try {
        supabaseRef.current = getBrowserSupabaseClient();
      } catch (error) {
        console.warn("supabase.mux.refresh unavailable", error);
        return;
      }
    }

    const supabase = supabaseRef.current;
    if (!supabase) return;

    const channelName = `mux:studio:${selectedCapsuleId}`;
    const channel = supabase.channel(channelName);
    const tables: MuxRealtimeTable[] = [
      "mux_live_streams",
      "mux_live_stream_sessions",
      "mux_assets",
      "mux_ai_jobs",
    ];

    tables.forEach((table) => {
      channel.on(
        "postgres_changes",
        { event: "*", schema: "public", table, filter: `capsule_id=eq.${selectedCapsuleId}` },
        () => {
          scheduleOverviewRefresh(table);
        },
      );
    });

    channel.subscribe();

    return () => {
      if (refreshTimerRef.current) {
        window.clearTimeout(refreshTimerRef.current);
        refreshTimerRef.current = null;
      }
      supabase.removeChannel(channel);
    };
  }, [scheduleOverviewRefresh, selectedCapsuleId]);

  React.useEffect(() => {
    if (typeof document === "undefined" || typeof window === "undefined") return;
    if (!selectedCapsuleId) return;

    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        scheduleOverviewRefresh("mux_live_streams");
      }
    };

    const handleFocus = () => {
      scheduleOverviewRefresh("mux_live_streams");
    };

    document.addEventListener("visibilitychange", handleVisibility);
    window.addEventListener("focus", handleFocus);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("focus", handleFocus);
    };
  }, [scheduleOverviewRefresh, selectedCapsuleId]);

  const handleEnsureStream = React.useCallback(async () => {
    if (!selectedCapsuleId) return;
    setActionBusy("ensure");
    setOverviewLoading(true);
    try {
      const response = await fetch("/api/mux/live", {
        method: "POST",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          capsuleId: selectedCapsuleId,
          action: "ensure",
          latencyMode: streamPreferences.latencyMode,
        }),
      });

      if (response.ok) {
        const payload = (await response.json()) as StreamOverviewResponse;
        setStreamOverview(payload.overview ?? null);
        streamOverviewRef.current = payload.overview ?? null;
        applyServerPreferences(payload.preferences);
        setOverviewError(null);
      } else {
        let message = "Failed to prepare streaming.";
        try {
          const body = await response.json();
          if (body && typeof body.message === "string") {
            message =
              typeof body.code === "string" && body.code.length
                ? `${body.message} (${body.code})`
                : body.message;
          } else if (body && typeof body.error === "string") {
            message = body.error;
          }
        } catch {
          // ignore
        }
        setOverviewError(message);
      }
    } catch (error) {
      console.warn("mux.ensure", error);
      setOverviewError("Failed to prepare streaming.");
    } finally {
      setActionBusy(null);
      setOverviewLoading(false);
    }
  }, [applyServerPreferences, selectedCapsuleId, streamPreferences.latencyMode]);

  const handleRotateStreamKey = React.useCallback(async () => {
    if (!selectedCapsuleId) return;
    setActionBusy("rotate");
    setOverviewLoading(true);
    try {
      const response = await fetch("/api/mux/live", {
        method: "POST",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ capsuleId: selectedCapsuleId, action: "rotate-key" }),
      });

      if (response.ok) {
        const payload = (await response.json()) as StreamOverviewResponse;
        setStreamOverview(payload.overview ?? null);
        streamOverviewRef.current = payload.overview ?? null;
        applyServerPreferences(payload.preferences);
        setOverviewError(null);
      } else {
        let message = "Failed to rotate stream key.";
        try {
          const body = await response.json();
          if (body && typeof body.message === "string") {
            message =
              typeof body.code === "string" && body.code.length
                ? `${body.message} (${body.code})`
                : body.message;
          } else if (body && typeof body.error === "string") {
            message = body.error;
          }
        } catch {
          // ignore
        }
        setOverviewError(message);
      }
    } catch (error) {
      console.warn("mux.rotateKey", error);
      setOverviewError("Failed to rotate stream key.");
    } finally {
      setActionBusy(null);
      setOverviewLoading(false);
    }
  }, [applyServerPreferences, selectedCapsuleId]);

  const handleCopyToClipboard = React.useCallback(
    (label: string, value: string | null | undefined) => {
      if (!value) return;
      if (typeof navigator === "undefined" || !navigator.clipboard) {
        console.warn("Clipboard API not available");
        return;
      }
      navigator.clipboard
        .writeText(value)
        .then(() => {
          setCopiedField(label);
          window.setTimeout(() => setCopiedField(null), 2000);
        })
      .catch((error) => {
        console.warn("Failed to copy", error);
      });
    },
    [],
  );

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

  const queryView = React.useMemo(() => {
    const param = searchParams?.get("view") ?? null;
    return normalizeTab(param, "studio");
  }, [searchParams]);

  const queryCapsuleId = React.useMemo(() => {
    const param = searchParams?.get("capsuleId") ?? null;
    if (!param) return null;
    return capsules.some((capsule) => capsule.id === param) ? param : null;
  }, [capsules, searchParams]);

  React.useEffect(() => {
    const normalized = normalizeTab(queryView, initialTab);
    setActiveTab(normalized);
  }, [initialTab, queryView]);

  React.useEffect(() => {
    if (queryCapsuleId === null) {
      setSelectedCapsuleId(null);
      setSelectorOpen(true);
      return;
    }
    setSelectedCapsuleId(queryCapsuleId);
    setSelectorOpen(false);
  }, [queryCapsuleId]);

  const hasSwitchParam = React.useMemo(() => {
    return searchParams?.has("switch") ?? false;
  }, [searchParams]);

  React.useEffect(() => {
    if (!hasSwitchParam) return;
    setSelectedCapsuleId(null);
    setSelectorOpen(true);
  }, [hasSwitchParam]);

  const updateUrl = React.useCallback(
    (nextTab: StudioTab) => {
      if (!pathname) return;
      const params = new URLSearchParams(searchParamsString);
      if (nextTab === "studio") {
        params.delete("view");
      } else {
        params.set("view", nextTab);
      }

      params.delete("switch");

      const nextSearch = params.toString();
      if (nextSearch === searchParamsString) return;
      const nextHref = nextSearch.length ? `${pathname}?${nextSearch}` : pathname;
      router.replace(nextHref, { scroll: false });
    },
    [pathname, router, searchParamsString],
  );

  const handleTabChange = React.useCallback(
    (nextValue: string) => {
      const normalized = normalizeTab(nextValue, activeTab);
      if (normalized === activeTab) return;
      setActiveTab(normalized);
      updateUrl(normalized);
    },
    [activeTab, updateUrl],
  );

  const syncSelectorSearchParams = React.useCallback(
    (capsuleId: string | null, reopenSelector: boolean) => {
      if (!pathname) return;
      const params = new URLSearchParams(searchParamsString);
      if (capsuleId) {
        params.set("capsuleId", capsuleId);
        params.delete("switch");
      } else {
        params.delete("capsuleId");
        if (reopenSelector) {
          params.set("switch", "1");
        } else {
          params.delete("switch");
        }
      }
      const nextSearch = params.toString();
      if (nextSearch === searchParamsString) return;
      const nextHref = nextSearch.length ? `${pathname}?${nextSearch}` : pathname;
      router.replace(nextHref, { scroll: false });
    },
    [pathname, router, searchParamsString],
  );

  React.useEffect(() => {
    if (typeof window === "undefined") return;
    const handleCapsuleSwitch = () => {
      setSelectedCapsuleId(null);
      setSelectorOpen(true);
      syncSelectorSearchParams(null, true);
    };
    window.addEventListener("capsule:switch", handleCapsuleSwitch);
    return () => {
      window.removeEventListener("capsule:switch", handleCapsuleSwitch);
    };
  }, [syncSelectorSearchParams]);

  const handleCapsuleChange = React.useCallback(
    (capsule: CapsuleSummary | null) => {
      const capsuleId = capsule?.id ?? null;
      setSelectedCapsuleId(capsuleId);
      const shouldReopenSelector = !capsuleId;
      setSelectorOpen(shouldReopenSelector);
      syncSelectorSearchParams(capsuleId, shouldReopenSelector);
    },
    [syncSelectorSearchParams],
  );

  const renderStudioContent = () => {
    if (selectorOpen || !selectedCapsule) {
      return (
        <>
          <AiStreamCapsuleGate
            capsules={capsules}
            selectedCapsule={selectedCapsule}
            onSelectionChange={handleCapsuleChange}
          />
        </>
      );
    }

    return (
      <PanelGroup
        key={autoSaveIds.main}
        direction="horizontal"
        className={styles.studioLayout ?? ""}
        autoSaveId={autoSaveIds.main}
        storage={panelStorage}
        style={{ height: "auto", minHeight: "var(--studio-track-height)", overflow: "visible" }}
      >
        <Panel defaultSize={50} minSize={44} collapsible={false}>
          <PanelGroup
            key={autoSaveIds.leftColumn}
            direction="vertical"
            className={styles.panelColumn ?? ""}
            autoSaveId={autoSaveIds.leftColumn}
            storage={panelStorage}
          >
            <Panel defaultSize={58} minSize={46} collapsible={false}>
              <div className={styles.panelSection}>
                <div className={`${styles.previewPanel} ${styles.panelCard}`}>
                  <div className={styles.previewHeader}>
                    <div>
                      <div className={styles.previewTitle}>{selectedCapsule.name}</div>
                      <div className={styles.previewSubtitle}>
                        {streamOverview
                          ? `Status: ${streamOverview.liveStream.status}`
                          : overviewLoading
                            ? "Checking Mux live stream..."
                            : "Mux live stream not yet configured."}
                      </div>
                      {overviewError ? (
                        <div className={styles.previewError}>{overviewError}</div>
                      ) : null}
                    </div>
                    <div className={styles.previewActions}>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleTabChange("encoder")}
                      >
                        Encoder settings
                      </Button>
                      <Button variant="gradient" size="sm" disabled>
                        Go live
                      </Button>
                    </div>
                  </div>
                  <div className={styles.previewFrame}>
                    {overviewLoading ? (
                      <div className={styles.previewPlaceholder}>Loading stream preview...</div>
                    ) : streamOverview?.playback.playbackId ? (
                      <MuxPlayer
                        playbackId={streamOverview.playback.playbackId ?? undefined}
                        streamType="live"
                        metadata={{
                          video_title: `${selectedCapsule.name} live preview`,
                        }}
                        style={{ width: "100%", height: "100%", borderRadius: "18px" }}
                      />
                    ) : (
                      <div className={styles.previewEmpty}>
                        <p>Set up your stream in the Encoder tab to preview playback here.</p>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={handleEnsureStream}
                          disabled={actionBusy === "ensure" || overviewLoading}
                        >
                          {actionBusy === "ensure" ? "Preparing..." : "Set up streaming"}
                        </Button>
                      </div>
                    )}
                  </div>
                  <div className={styles.previewFooter}>
                    <div className={styles.previewStats}>
                      <div className={styles.previewStat}>
                        <span className={styles.previewStatLabel}>Uptime</span>
                        <span className={styles.previewStatValue}>{formatDuration(uptimeSeconds)}</span>
                      </div>
                      <div className={styles.previewStat}>
                        <span className={styles.previewStatLabel}>Latency</span>
                        <span className={styles.previewStatValue}>
                          {streamOverview
                            ? streamOverview.liveStream.latencyMode ??
                              (streamOverview.liveStream.isLowLatency ? "low" : "standard")
                            : "--"}
                        </span>
                      </div>
                      <div className={styles.previewStat}>
                        <span className={styles.previewStatLabel}>Last active</span>
                        <span className={styles.previewStatValue}>
                          {streamOverview
                            ? formatTimestamp(
                                streamOverview.liveStream.lastActiveAt ??
                                  streamOverview.liveStream.lastSeenAt,
                              )
                            : "--"}
                        </span>
                      </div>
                    </div>
                    <div className={styles.controlToolbar}>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleEnsureStream}
                        disabled={actionBusy === "ensure" || overviewLoading}
                      >
                        {actionBusy === "ensure" ? "Preparing..." : "Refresh stream"}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleRotateStreamKey}
                        disabled={!streamOverview || actionBusy === "rotate" || overviewLoading}
                      >
                        {actionBusy === "rotate" ? "Rotating..." : "Rotate key"}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleTabChange("encoder")}
                      >
                        Encoder tab
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            </Panel>
            <PanelResizeHandle className={`${styles.resizeHandle} ${styles.resizeHandleHorizontal}`} />
            <Panel defaultSize={24} minSize={16} collapsible={false}>
              <div className={styles.panelSection}>
                <div className={`${styles.quickActionsCard} ${styles.panelCard}`}>
                  <div className={styles.quickActionsHeader}>
                    <div>
                      <div className={styles.quickActionsTitle}>Quick controls</div>
                      <div className={styles.quickActionsSubtitle}>
                        On-the-fly adjustments for your Capsule audience.
                      </div>
                    </div>
                    <Button variant="ghost" size="xs" disabled>
                      Customize
                    </Button>
                  </div>
                  <div className={styles.quickActionsGrid}>
                    {["Edit stream info", "Launch raid", "Run promo", "Drop poll"].map((action) => (
                      <button key={action} type="button" className={styles.quickActionButton} disabled>
                        {action}
                      </button>
                    ))}
                    <button type="button" className={styles.quickActionButton} disabled>
                      Add action
                    </button>
                  </div>
                </div>
              </div>
            </Panel>
            <PanelResizeHandle className={`${styles.resizeHandle} ${styles.resizeHandleHorizontal}`} />
            <Panel defaultSize={18} minSize={12} collapsible={false}>
              <div className={styles.panelSection}>
                <div className={`${styles.signalCard} ${styles.panelCard}`}>
                  <div className={styles.signalHeader}>
                    <div className={styles.signalTitle}>Live telemetry</div>
                    <span className={styles.signalPill}>AI monitor</span>
                  </div>
                  <ul className={styles.signalList}>
                    <li>
                      <span>Bitrate &amp; dropped frames</span>
                      <strong>Stable</strong>
                    </li>
                    <li>
                      <span>Audience sentiment</span>
                      <strong>Calm</strong>
                    </li>
                    <li>
                      <span>Highlights queued</span>
                      <strong>3 clips</strong>
                    </li>
                  </ul>
                </div>
              </div>
            </Panel>
          </PanelGroup>
        </Panel>

        <PanelResizeHandle className={`${styles.resizeHandle} ${styles.resizeHandleVertical}`} />

        <Panel defaultSize={18} minSize={15} collapsible={false}>
          <div className={`${styles.panelColumn} ${styles.stageManagerColumn}`}>
            <div className={`${styles.stageManagerCard} ${styles.panelCard}`}>
              <header className={styles.stageManagerHeader}>
                <div>
                  <div className={styles.stageManagerTitle}>AI stage manager</div>
                  <div className={styles.stageManagerSubtitle}>
                    Guides show pacing, sponsor beats, and guest handoffs.
                  </div>
                </div>
                <Button variant="ghost" size="xs" disabled>
                  View run of show
                </Button>
              </header>
              <div className={styles.stageManagerTimeline}>
                <div className={styles.stageManagerEvent}>
                  <span className={styles.stageManagerEventTime}>Now</span>
                  <div className={styles.stageManagerEventBody}>
                    <strong>Open with origin story</strong>
                    <p>
                      60-second intro with host on camera. Slide deck is primed and overlays are synced.
                    </p>
                  </div>
                </div>
                <div className={styles.stageManagerEvent}>
                  <span className={styles.stageManagerEventTime}>+05</span>
                  <div className={styles.stageManagerEventBody}>
                    <strong>Invite guest speaker</strong>
                    <p>
                      Queue split-screen layout and drop guest bio lower-third.
                    </p>
                  </div>
                </div>
                <div className={styles.stageManagerEvent}>
                  <span className={styles.stageManagerEventTime}>+12</span>
                  <div className={styles.stageManagerEventBody}>
                    <strong>Community prompt</strong>
                    <p>
                      Run poll about feature wishlist. AI will surface top responses for wrap-up.
                    </p>
                  </div>
                </div>
              </div>
              <div className={styles.stageManagerThread}>
                <div className={styles.stageManagerMessage}>
                  <span className={styles.stageManagerAuthor}>Stage manager</span>
                  <p>
                    Want me to prep a sponsor segment once the demo wraps? I can ready the CTA overlay
                    and chat reminder.
                  </p>
                </div>
                <div className={styles.stageManagerMessageSelf}>
                  <span className={styles.stageManagerAuthor}>You</span>
                  <p>
                    Yes - schedule it for the 18 minute mark if engagement is high.
                  </p>
                </div>
              </div>
              <footer className={styles.stageManagerFooter}>
                <div className={styles.stageManagerSuggestions}>
                  {["Draft outro talking points", "Prep Q&A handoff", "Summarize chat sentiment"].map(
                    (item) => (
                      <button
                        key={item}
                        type="button"
                        className={styles.stageManagerSuggestion}
                        disabled
                      >
                        {item}
                      </button>
                    ),
                  )}
                </div>
                <div className={styles.stageManagerComposer}>
                  <div className={styles.stageManagerPrompter} aria-hidden>
                    <button className={styles.stageManagerPrompterIcon} type="button" disabled>
                      <Paperclip size={18} weight="duotone" />
                    </button>
                    <span className={styles.stageManagerPrompterPlaceholder}>
                      Ask your Capsule AI to create anything...
                    </span>
                    <div className={styles.stageManagerPrompterActions}>
                      <button className={styles.stageManagerPrompterIcon} type="button" disabled>
                        <Microphone size={18} weight="duotone" />
                      </button>
                      <button className={styles.stageManagerPrompterPrimary} type="button" disabled>
                        Generate
                      </button>
                      <button className={styles.stageManagerPrompterCaret} type="button" disabled>
                        <CaretDown size={14} weight="bold" />
                      </button>
                    </div>
                  </div>
                </div>
              </footer>
            </div>
          </div>
        </Panel>

        <PanelResizeHandle className={`${styles.resizeHandle} ${styles.resizeHandleVertical}`} />

        <Panel defaultSize={12} minSize={11} collapsible={false}>
          <PanelGroup
            key={autoSaveIds.rightColumn}
            direction="vertical"
            className={styles.panelColumn ?? ""}
            autoSaveId={autoSaveIds.rightColumn}
            storage={panelStorage}
          >
            <Panel defaultSize={60} minSize={18} collapsible={false}>
              <div className={styles.panelSection}>
                <div className={`${styles.resourceCard} ${styles.panelCard}`}>
                  <header className={styles.resourceHeader}>
                    <div className={styles.resourceTitle}>Activity feed</div>
                    <Button variant="ghost" size="xs" disabled>
                      Filter
                    </Button>
                  </header>
                  <ul className={styles.resourceList}>
                    <li>
                      <span className={styles.resourceTime}>00:15</span>
                      <div>
                        <strong>luna_dev followed</strong>
                        <p>Auto thank-you message queued in chat.</p>
                      </div>
                    </li>
                    <li>
                      <span className={styles.resourceTime}>00:09</span>
                      <div>
                        <strong>crowdsource tipped $15</strong>
                        <p>Overlay shout-out scheduled after current segment.</p>
                      </div>
                    </li>
                    <li>
                      <span className={styles.resourceTime}>00:03</span>
                      <div>
                        <strong>Clip ready</strong>
                        <p>AI clipped &quot;Live coding reveal&quot; for instant share.</p>
                      </div>
                    </li>
                  </ul>
                </div>
              </div>
            </Panel>
            <PanelResizeHandle className={`${styles.resizeHandle} ${styles.resizeHandleHorizontal}`} />
            <Panel defaultSize={40} minSize={14} collapsible={false}>
              <div className={styles.panelSection}>
                <div className={`${styles.resourceCard} ${styles.panelCard}`}>
                  <header className={styles.resourceHeader}>
                    <div className={styles.resourceTitle}>Collaborators</div>
                    <Button variant="ghost" size="xs" disabled>
                      Invite
                    </Button>
                  </header>
                  <ul className={styles.collaboratorList}>
                    <li className={styles.collaboratorItem}>
                      <div className={styles.collaboratorMeta}>
                        <span className={styles.collaboratorName}>Sam Reynolds</span>
                        <span className={styles.collaboratorRole}>Producer</span>
                      </div>
                      <span
                        className={`${styles.collaboratorStatus} ${styles.collaboratorStatusOnline}`}
                      >
                        On comms
                      </span>
                    </li>
                    <li className={styles.collaboratorItem}>
                      <div className={styles.collaboratorMeta}>
                        <span className={styles.collaboratorName}>Jess Patel</span>
                        <span className={styles.collaboratorRole}>Moderator</span>
                      </div>
                      <span className={`${styles.collaboratorStatus} ${styles.collaboratorStatusIdle}`}>
                        Reviewing queue
                      </span>
                    </li>
                    <li className={styles.collaboratorItem}>
                      <div className={styles.collaboratorMeta}>
                        <span className={styles.collaboratorName}>Aria</span>
                        <span className={styles.collaboratorRole}>AI writer</span>
                      </div>
                      <span className={`${styles.collaboratorStatus} ${styles.collaboratorStatusAway}`}>
                        Updating recap
                      </span>
                    </li>
                  </ul>
                  <footer className={styles.collaboratorFooter}>
                    <Button variant="ghost" size="xs" disabled>
                      Manage collaborators
                    </Button>
                  </footer>
                </div>
              </div>
            </Panel>
          </PanelGroup>
        </Panel>

        <PanelResizeHandle className={`${styles.resizeHandle} ${styles.resizeHandleVertical}`} />

        <Panel defaultSize={20} minSize={14} collapsible={false}>
          <div className={styles.panelSection}>
            <div className={styles.chatRailShell}>
              <LiveChatRail
                capsuleId={selectedCapsule.id}
                capsuleName={selectedCapsule.name}
                status="waiting"
              />
            </div>
          </div>
        </Panel>
      </PanelGroup>
    );
  };

  const renderProducerContent = () => {
    if (!selectedCapsule) {
      return (
        <div className={styles.noticeCard}>
          <h3>Pick a Capsule to unlock Producer tools</h3>
          <p>
            Once you choose a destination, we&apos;ll populate AI scene controls, cue playlists, and
            automation templates tailored to that Capsule.
          </p>
        </div>
      );
    }

    return (
      <div className={styles.producerLayout}>
        <div className={styles.producerColumn}>
          <div className={styles.shellCard}>
            <div className={styles.sectionHeader}>
              <div className={styles.shellCardTitle}>Scene stack</div>
              <Button variant="outline" size="sm" disabled>
                + New Scene
              </Button>
            </div>
            <ul className={styles.sceneList}>
              <li className={styles.sceneItem}>
                <div className={styles.sceneItemTitle}>Main stage</div>
                <div className={styles.sceneItemMeta}>AI camera framing | host + guest</div>
              </li>
              <li className={styles.sceneItem}>
                <div className={styles.sceneItemTitle}>Clips &amp; react</div>
                <div className={styles.sceneItemMeta}>Picture-in-picture | sponsor lower-third</div>
              </li>
              <li className={styles.sceneItem}>
                <div className={styles.sceneItemTitle}>Q&amp;A wrap</div>
                <div className={styles.sceneItemMeta}>Chat overlay | poll recap</div>
              </li>
            </ul>
          </div>
        </div>
        <div className={styles.timelineCard}>
          <div className={styles.sectionHeader}>
            <div className={styles.shellCardTitle}>Run of show timeline</div>
            <Button variant="outline" size="sm" disabled>
              Add cue
            </Button>
          </div>
          <div className={styles.shellCardSubtitle}>
            Arrange segments, sponsor reads, and automation triggers. AI producer can auto-fire cues.
          </div>
          <div className={styles.timelineRail}>
            <div className={styles.timelineRow} />
            <div className={styles.timelineRow} />
            <div className={styles.timelineRow} />
          </div>
        </div>
        <div className={styles.assistantCard}>
          <div className={styles.sectionHeader}>
            <div className={styles.shellCardTitle}>AI copilot</div>
            <Button variant="outline" size="sm" disabled>
              Open chat
            </Button>
          </div>
          <ul className={styles.assistantList}>
            <li>Summaries live chat into beat-by-beat show notes.</li>
            <li>Suggests follow-up questions and polls in real time.</li>
            <li>Flags moments for instant clips &amp; VOD chapters.</li>
          </ul>
          <div className={styles.assistantPrompt}>
            &quot;Queue the sponsor slate in 2 minutes and remind me to plug the merch drop.&quot;
          </div>
        </div>
      </div>
    );
  };

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
                    handleCopyToClipboard(
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
                    handleCopyToClipboard(
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
                    onChange={(e) =>
                      updateStreamPreferences({ disconnectProtection: e.target.checked })
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
                    onChange={(e) =>
                      updateStreamPreferences({ audioWarnings: e.target.checked })
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
                  onChange={(e) =>
                    updateStreamPreferences({ storePastBroadcasts: e.target.checked })
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
                  onChange={(e) =>
                    updateStreamPreferences({ alwaysPublishVods: e.target.checked })
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
                  onChange={(e) =>
                    updateStreamPreferences({ autoClips: e.target.checked })
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
                    onClick={() => setShowPrimaryKey((v) => !v)}
                  >
                    {showPrimaryKey ? "Hide" : "Show"}
                  </button>
                  <button
                    type="button"
                    className={styles.encoderActionButton}
                    onClick={() => handleCopyToClipboard("primary-key", streamOverview.ingest.streamKey)}
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
                    onClick={() => setShowBackupKey((v) => !v)}
                    disabled={!streamOverview.ingest.backupStreamKey}
                  >
                    {showBackupKey ? "Hide" : "Show"}
                  </button>
                  <button
                    type="button"
                    className={styles.encoderActionButton}
                    onClick={() =>
                      handleCopyToClipboard("backup-key", streamOverview.ingest.backupStreamKey)
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
                  onClick={() => handleCopyToClipboard("playback-url", playbackUrl)}
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
                  onClick={() => handleCopyToClipboard("embed-code", embedCodeSnippet)}
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
            <div className={styles.encoderChecklistItem}>
              Cloud recording for every live session
            </div>
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
                        onClick={() => handleCopyToClipboard(`asset-${asset.id}`, asset.playbackUrl)}
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
