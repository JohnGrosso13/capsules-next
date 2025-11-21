"use client";

import * as React from "react";
import {
  CloudArrowUp,
  SquaresFour,
  X,
} from "@phosphor-icons/react/dist/ssr";

import styles from "../styles";
import type { DisplayMemoryUpload } from "@/components/memory/uploads-types";
import {
  detectAssetVariant,
  getAssetVariantLabel,
} from "@/components/memory/asset-carousel";

export type MemoryPickerTab = "uploads" | "assets";

type ComposerMemoryPickerProps = {
  open: boolean;
  activeTab: MemoryPickerTab;
  onTabChange(tab: MemoryPickerTab): void;
  uploads: DisplayMemoryUpload[];
  uploadsLoading: boolean;
  uploadsError: string | null;
  assets: DisplayMemoryUpload[];
  assetsLoading: boolean;
  assetsError: string | null;
  onSelect(memory: DisplayMemoryUpload): void;
  onClose(): void;
};

function describeUpload(item: DisplayMemoryUpload): { title: string; subtitle: string | null } {
  const title =
    item.title?.trim() ||
    item.description?.trim() ||
    "Untitled upload";
  const subtitle = item.description?.trim() || null;
  return { title, subtitle };
}

function describeAsset(item: DisplayMemoryUpload): { title: string; subtitle: string | null } {
  const variant = detectAssetVariant(item);
  const title =
    item.title?.trim() ||
    item.description?.trim() ||
    getAssetVariantLabel(variant);
  const subtitle = getAssetVariantLabel(variant);
  return { title, subtitle };
}

export function ComposerMemoryPicker({
  open,
  activeTab,
  onTabChange,
  uploads,
  uploadsLoading,
  uploadsError,
  assets,
  assetsLoading,
  assetsError,
  onSelect,
  onClose,
}: ComposerMemoryPickerProps) {
  React.useEffect(() => {
    if (!open || typeof window === "undefined") return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [open, onClose]);

  if (!open) return null;

  const showingUploads = activeTab === "uploads";
  const items = showingUploads ? uploads : assets;
  const loading = showingUploads ? uploadsLoading : assetsLoading;
  const error = showingUploads ? uploadsError : assetsError;
  const emptyMessage = showingUploads
    ? "No uploads yet. Drop something into Memory to see it here."
    : "No capsule assets yet. Generate art in the customizer to save new memories.";
  const loadingMessage = showingUploads
    ? "Loading your uploads..."
    : "Loading your capsule assets...";

  const renderCard = (item: DisplayMemoryUpload) => {
    const { title, subtitle } = showingUploads ? describeUpload(item) : describeAsset(item);
    const label = showingUploads ? "Upload" : "Capsule asset";
    const mediaUrl = item.displayUrl || item.fullUrl || item.media_url || "";

    return (
      <button
        key={item.id}
        type="button"
        className={styles.memoryPickerCard}
        onClick={() => onSelect(item)}
        aria-label={`Use memory ${title}`}
      >
        <div className={styles.memoryPickerThumb}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={mediaUrl} alt={title} loading="lazy" />
        </div>
        <div className={styles.memoryPickerMeta}>
          <span className={styles.memoryPickerBadge}>{label}</span>
          <span className={styles.memoryPickerTitle}>{title}</span>
          {subtitle ? <span className={styles.memoryPickerSubtitle}>{subtitle}</span> : null}
        </div>
      </button>
    );
  };

  return (
    <div className={styles.memoryPickerOverlay} role="presentation" onClick={onClose}>
      <div
        className={styles.memoryPickerPanel}
        role="dialog"
        aria-modal="true"
        aria-labelledby="composer-memory-heading"
        onClick={(event) => event.stopPropagation()}
      >
        <header className={styles.memoryPickerHeader}>
          <div>
            <h3 id="composer-memory-heading">Browse memories</h3>
            <p>Bring an existing upload or capsule asset straight into your composition.</p>
          </div>
          <button
            type="button"
            className={styles.memoryPickerClose}
            aria-label="Close memory picker"
            onClick={onClose}
          >
            <X size={16} weight="bold" />
          </button>
        </header>

        <div className={styles.memoryPickerTabs} role="tablist" aria-label="Memory sources">
          <button
            type="button"
            role="tab"
            aria-selected={showingUploads}
            className={`${styles.memoryPickerTab} ${
              showingUploads ? styles.memoryPickerTabActive : ""
            }`}
            data-selected={showingUploads ? "true" : undefined}
            onClick={() => onTabChange("uploads")}
          >
            <CloudArrowUp size={18} weight={showingUploads ? "fill" : "duotone"} />
            <span>Uploads</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={!showingUploads}
            className={`${styles.memoryPickerTab} ${
              !showingUploads ? styles.memoryPickerTabActive : ""
            }`}
            data-selected={!showingUploads ? "true" : undefined}
            onClick={() => onTabChange("assets")}
          >
            <SquaresFour size={18} weight={!showingUploads ? "fill" : "duotone"} />
            <span>Capsule assets</span>
          </button>
        </div>

        <div className={styles.memoryPickerContent}>
          {loading ? (
            <div className={styles.memoryPickerStatus}>{loadingMessage}</div>
          ) : error ? (
            <div className={`${styles.memoryPickerStatus} ${styles.memoryPickerStatusError}`}>
              {error}
            </div>
          ) : !items.length ? (
            <div className={styles.memoryPickerStatus}>{emptyMessage}</div>
          ) : (
            <div className={styles.memoryPickerGrid}>{items.map((item) => renderCard(item))}</div>
          )}
        </div>
      </div>
    </div>
  );
}
