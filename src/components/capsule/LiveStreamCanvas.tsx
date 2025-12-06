"use client";

import * as React from "react";
import MuxPlayer from "@mux/mux-player-react";

import capTheme from "@/app/(authenticated)/capsule/capsule.module.css";
import { fetchViewerLiveStream } from "@/lib/mux/liveClient";

type LiveStreamCanvasProps = {
  capsuleId: string | null;
  capsuleName: string | null;
};

export function LiveStreamCanvas({ capsuleId, capsuleName }: LiveStreamCanvasProps) {
  const [status, setStatus] = React.useState<string>("loading");
  const [playbackId, setPlaybackId] = React.useState<string | null>(null);
  const [latency, setLatency] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const refreshRef = React.useRef<AbortController | null>(null);

  const dispatchChatStatus = React.useCallback(
    (nextStatus: string) => {
      if (typeof window === "undefined") return;
      const detail = {
        capsuleId,
        capsuleName,
        status: nextStatus.toLowerCase() === "active" ? ("live" as const) : ("waiting" as const),
      };
      window.dispatchEvent(new CustomEvent("capsule:live-chat", { detail }));
    },
    [capsuleId, capsuleName],
  );

  const loadStream = React.useCallback(async () => {
    if (!capsuleId) {
      setStatus("idle");
      setPlaybackId(null);
      setError("Select a capsule to view its live stream.");
      return;
    }
    const controller = new AbortController();
    if (refreshRef.current) {
      refreshRef.current.abort();
    }
    refreshRef.current = controller;
    setError(null);
    try {
      const payload = await fetchViewerLiveStream({ capsuleId, signal: controller.signal });
      setPlaybackId(payload.playback.playbackId);
      setLatency(payload.liveStream.latencyMode);
      setStatus(payload.status ?? "idle");
      dispatchChatStatus(payload.status ?? "idle");
    } catch (err) {
      if (controller.signal.aborted) return;
      const message =
        err instanceof Error ? err.message : "Unable to load the live stream right now.";
      setError(message);
      setStatus("errored");
      dispatchChatStatus("waiting");
    } finally {
      if (refreshRef.current === controller) {
        refreshRef.current = null;
      }
    }
  }, [capsuleId, dispatchChatStatus]);

  React.useEffect(() => {
    void loadStream();
    const timer = window.setInterval(() => {
      void loadStream();
    }, 15000);
    return () => {
      window.clearInterval(timer);
      if (refreshRef.current) {
        refreshRef.current.abort();
      }
    };
  }, [loadStream]);

  const resolvedStatus = (() => {
    if (status === "active") return "live";
    if (status === "idle" || status === "waiting") return "idle";
    if (status === "errored") return "error";
    return "loading";
  })();

  const showPlayer = Boolean(playbackId);

  return (
    <div className={capTheme.streamStage}>
      <div className={capTheme.streamSurface} role="img" aria-label="Live stream player">
        <div className={capTheme.streamOverlay}>
          <span className={capTheme.streamBadge} aria-hidden data-status={resolvedStatus}>
            LIVE
          </span>
          <span className={capTheme.streamStatus}>
            {resolvedStatus === "live"
              ? "Streaming now"
              : resolvedStatus === "idle"
                ? "Standby"
                : resolvedStatus === "error"
                  ? "Stream unavailable"
                  : "Connecting..."}
          </span>
        </div>
        <div className={capTheme.streamMessage}>
          {showPlayer ? (
            <MuxPlayer
              playbackId={playbackId!}
              streamType="live"
              metadata={{
                video_title: capsuleName ? `${capsuleName} live stream` : "Live stream",
              }}
              style={{ width: "100%", height: "100%", borderRadius: "18px" }}
            />
          ) : (
            <>
              <p className={capTheme.streamMessageTitle}>
                {error ?? "Waiting for the broadcast"}
              </p>
              <p className={capTheme.streamMessageSubtitle}>
                {error
                  ? "We couldn't load the stream. Try again soon."
                  : "Start streaming from your encoder or studio. Once the signal arrives, it will appear here."}
              </p>
            </>
          )}
        </div>
        <div className={capTheme.streamMeta}>
          <span>Latency: {latency ?? "unknown"}</span>
          <span>Status: {status}</span>
        </div>
      </div>
    </div>
  );
}
