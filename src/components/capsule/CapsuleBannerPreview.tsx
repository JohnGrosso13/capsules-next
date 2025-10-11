"use client";

import * as React from "react";
import { Sparkle } from "@phosphor-icons/react/dist/ssr";

import styles from "./CapsuleBannerCustomizer.module.css";
import type {
  CapsuleCustomizerMode,
  SelectedBanner,
} from "./hooks/useCapsuleCustomizerState";

type CapsuleBannerPreviewProps = {
  mode: CapsuleCustomizerMode;
  stageRef: React.RefObject<HTMLDivElement | null>;
  imageRef: React.RefObject<HTMLImageElement | null>;
  selectedBanner: SelectedBanner | null;
  previewOffset: { x: number; y: number };
  previewAlt: string;
  normalizedName: string;
  isDragging: boolean;
  previewPannable: boolean;
  stageAriaLabel: string;
  onPointerDown: (event: React.PointerEvent<HTMLDivElement>) => void;
  onImageLoad: () => void;
};

function buildInitials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (!words.length) return "U";
  if (words.length === 1) {
    const letter = words[0]?.charAt(0) ?? name.charAt(0);
    return letter ? letter.toUpperCase() : "U";
  }
  const first = words[0]?.charAt(0) ?? "";
  const last = words[words.length - 1]?.charAt(0) ?? "";
  const combined = `${first}${last}`.trim();
  if (combined.length) return combined.toUpperCase();
  const fallback = name.charAt(0);
  return fallback ? fallback.toUpperCase() : "U";
}

export function CapsuleBannerPreview({
  mode,
  stageRef,
  imageRef,
  selectedBanner,
  previewOffset,
  previewAlt,
  normalizedName,
  isDragging,
  previewPannable,
  stageAriaLabel,
  onPointerDown,
  onImageLoad,
}: CapsuleBannerPreviewProps) {
  const logoInitial = normalizedName.trim().charAt(0).toUpperCase() || "C";
  const avatarInitial = buildInitials(normalizedName);
  let content: React.ReactNode;

  if (!selectedBanner) {
    content = (
      <div className={styles.previewPlaceholder}>
        <Sparkle size={32} weight="duotone" />
        <p>Start by chatting with Capsule AI or choosing an image.</p>
      </div>
    );
  } else if (selectedBanner.kind === "ai") {
    content = (
      <div className={styles.previewAi}>
        <span className={styles.previewAiLabel}>AI concept</span>
        <p>{selectedBanner.prompt}</p>
      </div>
    );
  } else {
    content = (
      <>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          ref={imageRef}
          src={selectedBanner.url}
          alt={previewAlt}
          className={styles.previewImage}
          style={{
            transform: `translate3d(-50%, -50%, 0) translate3d(${previewOffset.x}px, ${previewOffset.y}px, 0)`,
          }}
          draggable={false}
          onDragStart={(event) => event.preventDefault()}
          onLoad={onImageLoad}
          onError={(event) => {
            (event.currentTarget as HTMLImageElement).style.visibility = "hidden";
          }}
        />
        {mode === "tile" ? (
          <div className={styles.tileOverlay} aria-hidden="true">
            <div className={styles.tileOverlayInner}>
              <span className={styles.tileName}>{normalizedName}</span>
              <span className={styles.tileLogoPlaceholder} />
            </div>
          </div>
        ) : null}
        {mode === "logo" ? (
          <div className={styles.logoOverlay} aria-hidden="true">
            <div className={styles.logoOverlayCard}>
              <span className={styles.logoOverlayBadge}>Logo preview</span>
              <div className={styles.logoOverlayPlate}>
                <span className={styles.logoOverlayInitial}>{logoInitial}</span>
              </div>
              <div className={styles.logoOverlayText}>
                <span className={styles.logoOverlayName}>{normalizedName}</span>
                <span className={styles.logoOverlayMeta}>Right rail example</span>
              </div>
            </div>
          </div>
        ) : null}
        {mode === "avatar" ? (
          <div className={styles.avatarOverlay} aria-hidden="true">
            <div className={styles.avatarOverlayCard}>
              <div className={styles.avatarOverlayPlate}>
                <span className={styles.avatarOverlayInitial}>{avatarInitial}</span>
              </div>
              <div className={styles.avatarOverlayText}>
                <span className={styles.avatarOverlayName}>{normalizedName}</span>
                <span className={styles.avatarOverlayMeta}>Circular avatar preview</span>
              </div>
            </div>
          </div>
        ) : null}
      </>
    );
  }

  return (
    <div
      ref={stageRef}
      className={styles.previewStage}
      aria-label={stageAriaLabel}
      data-mode={mode}
      data-draggable={previewPannable ? "true" : undefined}
      data-dragging={isDragging ? "true" : undefined}
      onPointerDown={onPointerDown}
    >
      {content}
    </div>
  );
}
