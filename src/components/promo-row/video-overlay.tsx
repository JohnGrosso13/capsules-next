"use client";

import React from "react";
import { CaretLeft, CaretRight, Pause, Play, SpeakerHigh, SpeakerSlash, X } from "@phosphor-icons/react/dist/ssr";

import {
  composeVideoClasses,
  formatTimestamp,
  useHlsVideo,
  useVideoPresentation,
} from "./media-transport";
import type { PromoLightboxMediaItem } from "./media-transport";
import styles from "../promo-row.module.css";

export type PromoVideoOverlayProps = {
  items: PromoLightboxMediaItem[];
  activeIndex: number | null;
  onClose: () => void;
  onNavigate: (direction: number) => void;
};

export function PromoVideoOverlay({ items, activeIndex, onClose, onNavigate }: PromoVideoOverlayProps) {
  const videoViewerRef = React.useRef<HTMLVideoElement | null>(null);
  const [isOverlayPlaying, setIsOverlayPlaying] = React.useState(false);
  const [isOverlayMuted, setIsOverlayMuted] = React.useState(false);
  const [overlayProgress, setOverlayProgress] = React.useState({ current: 0, duration: 0 });
  const [hasOverlayEnded, setHasOverlayEnded] = React.useState(false);

  const activeVideoItem = activeIndex === null ? null : (items[activeIndex] ?? null);
  const videoCount = items.length;
  const { isHlsSource } = useHlsVideo(
    videoViewerRef,
    activeVideoItem?.mediaSrc ?? null,
    activeVideoItem?.mimeType ?? null,
  );
  const overlayPreset =
    typeof activeVideoItem?.letterbox === "boolean" ? activeVideoItem.letterbox : undefined;
  const overlayPresentation = useVideoPresentation(
    videoViewerRef,
    activeVideoItem?.mediaSrc ?? null,
    activeVideoItem?.mimeType ?? null,
    overlayPreset === undefined ? undefined : { presetLetterbox: overlayPreset },
  );

  React.useEffect(() => {
    if (activeVideoItem) return;
    setIsOverlayPlaying(false);
    setHasOverlayEnded(false);
    setOverlayProgress({ current: 0, duration: 0 });
    setIsOverlayMuted(false);
  }, [activeVideoItem]);

  React.useEffect(() => {
    const node = videoViewerRef.current;
    if (!node || !activeVideoItem) return;
    setHasOverlayEnded(false);
    setOverlayProgress({
      current: node.currentTime,
      duration: Number.isFinite(node.duration) ? node.duration : 0,
    });
    const attemptPlay = async () => {
      try {
        const playPromise = node.play();
        if (playPromise && typeof playPromise.then === "function") {
          await playPromise;
        }
        setIsOverlayPlaying(!node.paused);
      } catch {
        setIsOverlayPlaying(false);
      }
    };
    void attemptPlay();
    return () => {
      node.pause();
    };
  }, [activeVideoItem]);

  React.useEffect(() => {
    const node = videoViewerRef.current;
    if (!node) return;
    node.muted = isOverlayMuted;
  }, [isOverlayMuted]);

  const handleOverlayLoadedMetadata = React.useCallback(
    (event: React.SyntheticEvent<HTMLVideoElement>) => {
      overlayPresentation.handleLoadedMetadata(event);
      const target = event.currentTarget;
      setOverlayProgress({
        current: target.currentTime,
        duration: Number.isFinite(target.duration) ? target.duration : 0,
      });
    },
    [overlayPresentation],
  );

  const handleOverlayTimeUpdate = React.useCallback((event: React.SyntheticEvent<HTMLVideoElement>) => {
    const target = event.currentTarget;
    setOverlayProgress({
      current: target.currentTime,
      duration: Number.isFinite(target.duration) ? target.duration : 0,
    });
  }, []);

  const handleOverlayPlay = React.useCallback(() => {
    setHasOverlayEnded(false);
    setIsOverlayPlaying(true);
  }, []);

  const handleOverlayPause = React.useCallback(() => {
    setIsOverlayPlaying(false);
  }, []);

  const handleOverlayEnded = React.useCallback(() => {
    setHasOverlayEnded(true);
    setIsOverlayPlaying(false);
    if (videoCount > 1) {
      onNavigate(1);
    }
  }, [onNavigate, videoCount]);

  const handleOverlayVolumeChange = React.useCallback((event: React.SyntheticEvent<HTMLVideoElement>) => {
    setIsOverlayMuted(event.currentTarget.muted);
  }, []);

  const handleOverlayTogglePlay = React.useCallback(() => {
    const node = videoViewerRef.current;
    if (!node) return;
    if (node.paused || node.ended) {
      if (node.ended) {
        node.currentTime = 0;
      }
      const playPromise = node.play();
      if (playPromise && typeof playPromise.catch === "function") {
        playPromise.catch(() => {
          setIsOverlayPlaying(false);
        });
      }
    } else {
      node.pause();
    }
  }, []);

  const handleOverlayToggleMute = React.useCallback(() => {
    const node = videoViewerRef.current;
    if (!node) return;
    const nextMuted = !node.muted;
    node.muted = nextMuted;
    setIsOverlayMuted(nextMuted);
  }, []);

  const handleOverlayScrub = React.useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const node = videoViewerRef.current;
    if (!node) return;
    const value = Number(event.currentTarget.value);
    if (!Number.isFinite(value)) return;
    const duration = Number.isFinite(node.duration) ? node.duration : 0;
    if (duration <= 0) return;
    const nextTime = (value / 100) * duration;
    if (!Number.isFinite(nextTime)) return;
    try {
      node.currentTime = nextTime;
      setOverlayProgress({ current: nextTime, duration });
    } catch {
      /* ignore seek errors */
    }
  }, []);

  const overlayProgressPercent = React.useMemo(() => {
    const { current, duration } = overlayProgress;
    if (!Number.isFinite(duration) || duration <= 0) return 0;
    const ratio = Number.isFinite(current) && duration > 0 ? current / duration : 0;
    return Math.min(100, Math.max(0, ratio * 100));
  }, [overlayProgress]);

  const formattedCurrentTime = formatTimestamp(overlayProgress.current);
  const formattedDuration = formatTimestamp(overlayProgress.duration);

  if (!activeVideoItem) return null;

  return (
    <div
      className={styles.videoViewerOverlay}
      role="dialog"
      aria-modal="true"
      aria-label={activeVideoItem.caption ?? "Promo video viewer"}
      onClick={onClose}
    >
      <div className={styles.videoViewerContainer} onClick={(event) => event.stopPropagation()}>
        <button
          type="button"
          className={styles.videoViewerClose}
          onClick={onClose}
          aria-label="Close promo video"
        >
          <X weight="bold" size={22} />
        </button>
        {videoCount > 0 ? (
          <div className={styles.videoViewerProgressGroup} aria-hidden="true">
            {items.map((item, index) => {
              const width =
                activeIndex === null
                  ? 0
                  : index < activeIndex
                  ? 100
                  : index === activeIndex
                  ? overlayProgressPercent
                  : 0;
              return (
                <div key={item.id} className={styles.videoViewerProgressBar}>
                  <div
                    className={styles.videoViewerProgressFill}
                    style={{ width: `${Math.max(0, Math.min(100, width))}%` }}
                  />
                </div>
              );
            })}
          </div>
        ) : null}
        <div
          className={styles.videoViewerStage}
          data-playing={isOverlayPlaying ? "true" : undefined}
          data-ended={hasOverlayEnded ? "true" : undefined}
          data-has-nav={videoCount > 1 ? "true" : undefined}
        >
          {videoCount > 1 ? (
            <>
              <button
                type="button"
                className={styles.videoViewerNav}
                data-direction="prev"
                onClick={(event) => {
                  event.stopPropagation();
                  onNavigate(-1);
                }}
                aria-label="Previous promo video"
              >
                <CaretLeft size={28} weight="bold" />
              </button>
              <button
                type="button"
                className={styles.videoViewerNav}
                data-direction="next"
                onClick={(event) => {
                  event.stopPropagation();
                  onNavigate(1);
                }}
                aria-label="Next promo video"
              >
                <CaretRight size={28} weight="bold" />
              </button>
            </>
          ) : null}
          {activeVideoItem.mediaSrc ? (
            <video
              key={activeVideoItem.mediaSrc}
              ref={videoViewerRef}
              className={composeVideoClasses(styles.videoViewerPlayer, overlayPresentation, {
                letterbox: styles.videoLetterbox,
                rotateClockwise: styles.videoRotateFullscreenClockwise,
                rotateCounterclockwise: styles.videoRotateFullscreenCounterclockwise,
              })}
              data-letterbox={overlayPresentation.letterbox ? "true" : undefined}
              data-hls={isHlsSource ? "true" : undefined}
              src={!isHlsSource ? activeVideoItem.mediaSrc ?? undefined : undefined}
              playsInline
              preload="auto"
              poster={activeVideoItem.posterSrc ?? undefined}
              onLoadedMetadata={handleOverlayLoadedMetadata}
              onTimeUpdate={handleOverlayTimeUpdate}
              onEnded={handleOverlayEnded}
              onPlay={handleOverlayPlay}
              onPause={handleOverlayPause}
              onVolumeChange={handleOverlayVolumeChange}
              onClick={handleOverlayTogglePlay}
              muted={isOverlayMuted}
              disablePictureInPicture
              controlsList="nodownload nofullscreen noplaybackrate"
            >
              {!isHlsSource ? (
                <source src={activeVideoItem.mediaSrc ?? undefined} type={activeVideoItem.mimeType ?? undefined} />
              ) : null}
              Your browser does not support embedded video.
            </video>
          ) : (
            <div className={styles.videoViewerFallback} aria-hidden="true">
              <Play className={styles.videoViewerFallbackIcon} weight="fill" />
            </div>
          )}
          {activeVideoItem.mediaSrc && !isOverlayPlaying ? (
            <button
              type="button"
              className={styles.videoViewerPlayHint}
              onClick={handleOverlayTogglePlay}
              aria-label={hasOverlayEnded ? "Replay video" : "Play video"}
            >
              <Play weight="fill" size={26} />
            </button>
          ) : null}
        </div>
        {activeVideoItem.mediaSrc ? (
          <div className={styles.videoViewerControls}>
            <button
              type="button"
              className={styles.videoViewerControlButton}
              onClick={handleOverlayTogglePlay}
              aria-label={isOverlayPlaying ? "Pause video" : hasOverlayEnded ? "Replay video" : "Play video"}
            >
              {isOverlayPlaying ? <Pause size={20} weight="bold" /> : <Play size={20} weight="bold" />}
            </button>
            <div className={styles.videoViewerTimeline}>
              <div className={styles.videoViewerTimelineBar} aria-hidden="true">
                <div
                  className={styles.videoViewerTimelineProgress}
                  style={{ width: `${overlayProgressPercent}%` }}
                />
              </div>
              <input
                type="range"
                min={0}
                max={100}
                step={0.1}
                value={overlayProgressPercent}
                onChange={handleOverlayScrub}
                className={styles.videoViewerTimelineInput}
                aria-label="Scrub promo video"
              />
            </div>
            <div className={styles.videoViewerTimecode} aria-live="off">
              {formattedCurrentTime} / {formattedDuration}
            </div>
            <button
              type="button"
              className={styles.videoViewerControlButton}
              onClick={handleOverlayToggleMute}
              aria-label={isOverlayMuted ? "Unmute video" : "Mute video"}
            >
              {isOverlayMuted ? <SpeakerSlash size={20} weight="bold" /> : <SpeakerHigh size={20} weight="bold" />}
            </button>
            {videoCount > 1 && activeIndex !== null ? (
              <div className={styles.videoViewerStepper} aria-live="polite">
                {activeIndex + 1} / {videoCount}
              </div>
            ) : null}
          </div>
        ) : null}
        {activeVideoItem.caption ? <div className={styles.videoViewerCaption}>{activeVideoItem.caption}</div> : null}
      </div>
    </div>
  );
}
