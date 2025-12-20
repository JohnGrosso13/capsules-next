"use client";

import * as React from "react";
import { ShareFat, Sparkle, UsersThree } from "@phosphor-icons/react/dist/ssr";

import styles from "./CapsuleCustomizer.module.css";
import {
  useCapsuleCustomizerMeta,
  useCapsuleCustomizerPreview,
} from "./hooks/capsuleCustomizerContext";

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

export function CapsuleBannerPreview() {
  const meta = useCapsuleCustomizerMeta();
  const preview = useCapsuleCustomizerPreview();
  const { selected: selectedBanner, previewOffset, previewScale } = preview;
  const mode = meta.mode;
  const stageRef = preview.stageRef;
  const imageRef = preview.imageRef;
  const normalizedName = meta.normalizedName;
  const previewAlt = meta.previewAlt;
  const isDragging = preview.isDragging;
  const previewPannable = preview.previewPannable;
  const stageAriaLabel = meta.stageAriaLabel;
  const onPointerDown = preview.onPointerDown;
  const onImageLoad = preview.onImageLoad;
  const transformStyle = {
    transform: `translate3d(-50%, -50%, 0) translate3d(${previewOffset.x}px, ${previewOffset.y}px, 0) scale(${previewScale})`,
  };

  const logoInitial = normalizedName.trim().charAt(0).toUpperCase() || "C";
  const avatarInitial = buildInitials(normalizedName);
  let content: React.ReactNode;

  if (!selectedBanner) {
    content = (
      <div className={styles.previewPlaceholder}>
        <Sparkle size={32} weight="duotone" />
        <p>Start by chatting with your assistant or choosing an image.</p>
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
          style={transformStyle}
          draggable={false}
          onDragStart={(event) => event.preventDefault()}
          onLoad={onImageLoad}
          onError={(event) => {
            (event.currentTarget as HTMLImageElement).style.visibility = "hidden";
          }}
        />
        {mode === "storeBanner" ? (
          <div className={styles.storeOverlay} aria-hidden="true">
            <div className={styles.storeOverlayButtonGroup}>
              <div className={styles.storeOverlayButton}>
                <ShareFat size={16} weight="bold" />
                Share preview
              </div>
              <div className={styles.storeOverlayButton}>
                <UsersThree size={16} weight="bold" />
                Invite collaborators
              </div>
            </div>
          </div>
        ) : null}
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
