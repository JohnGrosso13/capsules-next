"use client";

import * as React from "react";

import {
  ensureLiveStream,
  fetchLiveStreamOverview,
  normalizeMuxError,
  rotateLiveStreamKey,
  updateStreamPreferences as persistLiveStreamPreferences,
} from "@/lib/mux/liveClient";
import { getBrowserSupabaseClient } from "@/lib/supabase/browser";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { StreamOverview, StreamPreferences } from "@/types/ai-stream";

export type {
  StreamAiJob,
  StreamAsset,
  StreamOverview,
  StreamOverviewResponse,
  StreamPreferences,
  StreamSession,
  StreamSimulcastDestination,
  StreamWebhookEndpoint,
} from "@/types/ai-stream";

type MuxRealtimeTable =
  | "mux_live_streams"
  | "mux_live_stream_sessions"
  | "mux_assets"
  | "mux_ai_jobs";

const DEFAULT_STREAM_PREFERENCES: StreamPreferences = {
  latencyMode: "low",
  disconnectProtection: true,
  audioWarnings: true,
  storePastBroadcasts: true,
  alwaysPublishVods: true,
  autoClips: false,
  simulcastDestinations: [],
  webhookEndpoints: [],
};

type AiStreamStudioStoreState = {
  selectedCapsuleId: string | null;
  streamOverview: StreamOverview | null;
  streamPreferences: StreamPreferences;
  overviewLoading: boolean;
  overviewError: string | null;
  actionBusy: "ensure" | "rotate" | null;
};

type AiStreamStudioStoreActions = {
  setSelectedCapsuleId: (capsuleId: string | null) => void;
  setOverviewError: (value: string | null) => void;
  updateStreamPreferences: (updates: Partial<StreamPreferences>) => void;
  refreshOverview: (options?: { silent?: boolean }) => Promise<void>;
  ensureStream: () => Promise<void>;
  rotateStreamKey: () => Promise<void>;
};

type AiStreamStudioStoreValue = {
  state: AiStreamStudioStoreState;
  actions: AiStreamStudioStoreActions;
};

const AiStreamStudioStoreContext =
  React.createContext<AiStreamStudioStoreValue | undefined>(undefined);

type AiStreamStudioStoreProviderProps = {
  children: React.ReactNode;
};

export function AiStreamStudioStoreProvider({
  children,
}: AiStreamStudioStoreProviderProps) {
  const [selectedCapsuleId, setSelectedCapsuleId] = React.useState<string | null>(null);
  const [streamOverview, setStreamOverview] = React.useState<StreamOverview | null>(null);
  const [streamPreferences, setStreamPreferences] = React.useState<StreamPreferences>(
    DEFAULT_STREAM_PREFERENCES,
  );
  const [overviewLoading, setOverviewLoading] = React.useState(false);
  const [overviewError, setOverviewError] = React.useState<string | null>(null);
  const [actionBusy, setActionBusy] = React.useState<"ensure" | "rotate" | null>(null);

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
        const payload = await fetchLiveStreamOverview<StreamOverview, StreamPreferences>({
          capsuleId,
          signal: controller.signal,
        });
        setStreamOverview(payload.overview ?? null);
        streamOverviewRef.current = payload.overview ?? null;
        applyServerPreferences(payload.preferences);
        setOverviewError(null);
      } catch (error) {
        if (controller.signal.aborted) return;
        const normalizedError = normalizeMuxError(error, "Failed to load stream overview.");
        console.warn("mux.live.overview", normalizedError);

        if (normalizedError.status === 404) {
          setStreamOverview(null);
          streamOverviewRef.current = null;
          applyServerPreferences(null);
          if (!silent) {
            setOverviewError(null);
          }
        } else if (!silent) {
          setOverviewError(normalizedError.message);
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
        void fetchOverview(selectedCapsuleId, { silent: !shouldShowSpinner });
      }, delay);
    },
    [fetchOverview, selectedCapsuleId],
  );

  React.useEffect(() => {
    streamOverviewRef.current = streamOverview;
  }, [streamOverview]);

  React.useEffect(() => {
    if (!preferenceHydrationPendingRef.current) return;
    preferenceHydrationPendingRef.current = false;
    skipPreferencePersistRef.current = false;
  }, [streamPreferences]);

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

    void fetchOverview(selectedCapsuleId);

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
        const payload = await persistLiveStreamPreferences<StreamOverview, StreamPreferences>({
          capsuleId: selectedCapsuleId,
          preferences: streamPreferences,
          signal: controller.signal,
        });
        applyServerPreferences(payload.preferences);
        setStreamOverview(payload.overview ?? null);
        streamOverviewRef.current = payload.overview ?? null;
        lastPersistedPreferencesRef.current = JSON.stringify(payload.preferences);
      } catch (error) {
        if (!controller.signal.aborted) {
          const normalizedError = normalizeMuxError(error, "Failed to save stream settings.");
          console.warn("mux.preferences.persist.error", normalizedError);
        }
      }
    };

    void persist();

    return () => {
      controller.abort();
    };
  }, [applyServerPreferences, preferenceSignature, selectedCapsuleId, streamPreferences]);

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

  const ensureStream = React.useCallback(async () => {
    if (!selectedCapsuleId) return;
    setActionBusy("ensure");
    setOverviewLoading(true);
    try {
      const payload = await ensureLiveStream<StreamOverview, StreamPreferences>({
        capsuleId: selectedCapsuleId,
        latencyMode: streamPreferences.latencyMode,
      });
      setStreamOverview(payload.overview ?? null);
      streamOverviewRef.current = payload.overview ?? null;
      applyServerPreferences(payload.preferences);
      setOverviewError(null);
    } catch (error) {
      const normalizedError = normalizeMuxError(error, "Failed to prepare streaming.");
      console.warn("mux.ensure", normalizedError);
      setOverviewError(normalizedError.message);
    } finally {
      setActionBusy(null);
      setOverviewLoading(false);
    }
  }, [applyServerPreferences, selectedCapsuleId, streamPreferences.latencyMode]);

  const rotateStreamKey = React.useCallback(async () => {
    if (!selectedCapsuleId) return;
    setActionBusy("rotate");
    setOverviewLoading(true);
    try {
      const payload = await rotateLiveStreamKey<StreamOverview, StreamPreferences>({
        capsuleId: selectedCapsuleId,
      });
      setStreamOverview(payload.overview ?? null);
      streamOverviewRef.current = payload.overview ?? null;
      applyServerPreferences(payload.preferences);
      setOverviewError(null);
    } catch (error) {
      const normalizedError = normalizeMuxError(error, "Failed to rotate stream key.");
      console.warn("mux.rotateKey", normalizedError);
      setOverviewError(normalizedError.message);
    } finally {
      setActionBusy(null);
      setOverviewLoading(false);
    }
  }, [applyServerPreferences, selectedCapsuleId]);

  const refreshOverview = React.useCallback(
    async (options?: { silent?: boolean }) => {
      if (!selectedCapsuleId) return;
      await fetchOverview(selectedCapsuleId, options);
    },
    [fetchOverview, selectedCapsuleId],
  );

  const contextValue = React.useMemo<AiStreamStudioStoreValue>(
    () => ({
      state: {
        selectedCapsuleId,
        streamOverview,
        streamPreferences,
        overviewLoading,
        overviewError,
        actionBusy,
      },
      actions: {
        setSelectedCapsuleId,
        setOverviewError,
        updateStreamPreferences,
        refreshOverview,
        ensureStream,
        rotateStreamKey,
      },
    }),
    [
      selectedCapsuleId,
      streamOverview,
      streamPreferences,
      overviewLoading,
      overviewError,
      actionBusy,
      updateStreamPreferences,
      ensureStream,
      rotateStreamKey,
      refreshOverview,
    ],
  );

  return (
    <AiStreamStudioStoreContext.Provider value={contextValue}>
      {children}
    </AiStreamStudioStoreContext.Provider>
  );
}

export function useAiStreamStudioStore(): AiStreamStudioStoreValue {
  const context = React.useContext(AiStreamStudioStoreContext);
  if (!context) {
    throw new Error("useAiStreamStudioStore must be used within AiStreamStudioStoreProvider");
  }
  return context;
}

export { DEFAULT_STREAM_PREFERENCES };
