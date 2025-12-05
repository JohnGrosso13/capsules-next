"use client";

import React from "react";
import { CaretLeft, CaretRight, X } from "@phosphor-icons/react/dist/ssr";

import lightboxStyles from "@/components/home-feed.module.css";
import { canRenderInlineImage } from "@/lib/media";
import {
  composeVideoClasses,
  useHlsVideo,
  useVideoPresentation,
} from "./media-transport";
import type { PromoLightboxMediaItem } from "./media-transport";
import styles from "../promo-row.module.css";

export type PromoLightboxProps = {
  currentItem: PromoLightboxMediaItem | null;
  imageCount: number;
  onNavigate: (direction: number) => void;
  onClose: () => void;
  FallbackIcon: React.ComponentType<{ className?: string; weight?: "duotone" | "fill" | "regular" | "thin" | "light" | "bold" }>;
};

export function PromoLightbox({
  currentItem,
  imageCount,
  onNavigate,
  onClose,
  FallbackIcon,
}: PromoLightboxProps) {
  const lightboxVideoRef = React.useRef<HTMLVideoElement | null>(null);
  const isVideo = currentItem?.kind === "video";
  const letterboxPreset =
    isVideo && typeof currentItem?.letterbox === "boolean" ? currentItem.letterbox : undefined;
  const lightboxPresentation = useVideoPresentation(
    lightboxVideoRef,
    isVideo ? currentItem?.mediaSrc ?? null : null,
    isVideo ? currentItem?.mimeType ?? null : null,
    letterboxPreset === undefined ? undefined : { presetLetterbox: letterboxPreset },
  );
  const { isHlsSource } = useHlsVideo(
    lightboxVideoRef,
    isVideo ? currentItem?.mediaSrc ?? null : null,
    isVideo ? currentItem?.mimeType ?? null : null,
  );

  if (!currentItem) return null;

  const renderLightboxMedia = () => {
    if (!currentItem.mediaSrc) {
      return (
        <div className={styles.lightboxFallback} aria-hidden="true">
          <FallbackIcon
            className={`${styles.fallbackIcon} ${styles.lightboxFallbackIcon}`}
            weight="duotone"
          />
        </div>
      );
    }

    if (currentItem.kind === "video") {
      return (
        <video
          ref={lightboxVideoRef}
          className={composeVideoClasses(lightboxStyles.lightboxVideo, lightboxPresentation, {
            letterbox: styles.videoLetterbox,
            rotateClockwise: styles.videoRotateFullscreenClockwise,
            rotateCounterclockwise: styles.videoRotateFullscreenCounterclockwise,
          })}
          data-letterbox={lightboxPresentation.letterbox ? "true" : undefined}
          data-hls={isHlsSource ? "true" : undefined}
          src={!isHlsSource ? currentItem.mediaSrc ?? undefined : undefined}
          controls
          playsInline
          preload="auto"
          poster={currentItem.posterSrc ?? undefined}
          onLoadedMetadata={lightboxPresentation.handleLoadedMetadata}
        >
          {!isHlsSource ? (
            <source src={currentItem.mediaSrc ?? undefined} type={currentItem.mimeType ?? undefined} />
          ) : null}
          Your browser does not support embedded video.
        </video>
      );
    }

    const renderable = canRenderInlineImage(currentItem.mimeType, currentItem.mediaSrc);
    const fallbackSrc =
      currentItem.posterSrc && currentItem.posterSrc !== currentItem.mediaSrc
        ? currentItem.posterSrc
        : null;
    const imageSrc = renderable ? currentItem.mediaSrc : fallbackSrc;

    if (!imageSrc) {
      return (
        <div className={lightboxStyles.lightboxFallback} role="status">
          Preview unavailable for this file type.
        </div>
      );
    }

    return (
      // eslint-disable-next-line @next/next/no-img-element -- preserve lightbox loading behaviour
      <img
        className={lightboxStyles.lightboxImage}
        src={imageSrc}
        alt={currentItem.caption ?? "Promo media"}
        loading="eager"
        draggable={false}
      />
    );
  };

  return (
    <div
      className={lightboxStyles.lightboxOverlay}
      role="dialog"
      aria-modal="true"
      aria-label={currentItem.caption ?? "Promo media viewer"}
      onClick={onClose}
    >
      <div className={lightboxStyles.lightboxContent} onClick={(event) => event.stopPropagation()}>
        <button
          type="button"
          className={lightboxStyles.lightboxClose}
          onClick={onClose}
          aria-label="Close promo media viewer"
        >
          <X weight="bold" size={22} />
        </button>
        <div className={lightboxStyles.lightboxBody} data-has-nav={imageCount > 1 ? "true" : undefined}>
          {imageCount > 1 ? (
            <>
              <button
                type="button"
                className={lightboxStyles.lightboxNav}
                data-direction="prev"
                onClick={() => onNavigate(-1)}
                aria-label="Previous promo media"
              >
                <CaretLeft size={28} weight="bold" />
              </button>
              <button
                type="button"
                className={lightboxStyles.lightboxNav}
                data-direction="next"
                onClick={() => onNavigate(1)}
                aria-label="Next promo media"
              >
                <CaretRight size={28} weight="bold" />
              </button>
            </>
          ) : null}
          <div className={lightboxStyles.lightboxMedia}>{renderLightboxMedia()}</div>
        </div>
        {currentItem.caption ? <div className={lightboxStyles.lightboxCaption}>{currentItem.caption}</div> : null}
      </div>
    </div>
  );
}
