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
  uploadsHasMore?: boolean;
  onLoadMoreUploads?: () => void;
  assets: DisplayMemoryUpload[];
  assetsLoading: boolean;
  assetsError: string | null;
  assetsHasMore?: boolean;
  onLoadMoreAssets?: () => void;
  searchEnabled?: boolean;
  searchPageSize?: number;
  onSearch?: (params: {
    tab: MemoryPickerTab;
    query: string;
    page: number;
    pageSize: number;
  }) => Promise<{ items: DisplayMemoryUpload[]; hasMore: boolean; error?: string | null }>;
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
  uploadsHasMore,
  onLoadMoreUploads,
  assets,
  assetsLoading,
  assetsError,
  assetsHasMore,
  onLoadMoreAssets,
  searchEnabled,
  searchPageSize,
  onSearch,
  onSelect,
  onClose,
}: ComposerMemoryPickerProps) {
  const searchAllowed = Boolean(onSearch && searchEnabled);
  const searchPageSizeResolved = searchAllowed ? Math.max(searchPageSize ?? 24, 1) : 0;
  const [searchText, setSearchText] = React.useState("");
  const [searchPage, setSearchPage] = React.useState(0);
  const [searchItems, setSearchItems] = React.useState<DisplayMemoryUpload[]>([]);
  const [searchHasMore, setSearchHasMore] = React.useState(false);
  const [searchLoading, setSearchLoading] = React.useState(false);
  const [searchError, setSearchError] = React.useState<string | null>(null);

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

  React.useEffect(() => {
    setSearchPage(0);
    setSearchItems([]);
    setSearchHasMore(false);
    setSearchError(null);
  }, [activeTab, open]);

  React.useEffect(() => {
    if (open) return;
    setSearchText("");
    setSearchPage(0);
    setSearchItems([]);
    setSearchHasMore(false);
    setSearchError(null);
  }, [open]);

  React.useEffect(() => {
    if (!searchAllowed || !searchText.trim()) {
      setSearchItems([]);
      setSearchHasMore(false);
      setSearchError(null);
      setSearchLoading(false);
      setSearchPage(0);
      return;
    }
    let cancelled = false;
    const runSearch = async () => {
      setSearchLoading(true);
      setSearchError(null);
      try {
        const result = await onSearch?.({
          tab: activeTab,
          query: searchText,
          page: searchPage,
          pageSize: searchPageSizeResolved,
        });
        if (cancelled || !result) return;
        setSearchItems((previous) =>
          searchPage === 0 ? result.items : [...previous, ...result.items],
        );
        setSearchHasMore(Boolean(result.hasMore));
        setSearchError(result.error ?? null);
      } catch (error) {
        if (cancelled) return;
        setSearchError(
          error instanceof Error && error.message ? error.message : "Search failed. Try again.",
        );
        setSearchHasMore(false);
      } finally {
        if (!cancelled) setSearchLoading(false);
      }
    };
    void runSearch();
    return () => {
      cancelled = true;
    };
  }, [activeTab, onSearch, searchAllowed, searchPage, searchPageSizeResolved, searchText]);

  if (!open) return null;

  const showingUploads = activeTab === "uploads";
  const isSearching = searchAllowed && Boolean(searchText.trim());
  const items = isSearching ? searchItems : showingUploads ? uploads : assets;
  const loading = isSearching ? searchLoading : showingUploads ? uploadsLoading : assetsLoading;
  const error = isSearching ? searchError : showingUploads ? uploadsError : assetsError;
  const emptyMessage = showingUploads
    ? isSearching
      ? "No uploads match your search."
      : "No uploads yet. Drop something into Memory to see it here."
    : isSearching
      ? "No capsule assets match your search."
      : "No capsule assets yet. Generate art in the customizer to save new memories.";
  const loadingMessage = showingUploads
    ? "Loading your uploads..."
    : "Loading your capsule assets...";
  const hasMore = isSearching
    ? searchHasMore
    : showingUploads
      ? Boolean(uploadsHasMore)
      : Boolean(assetsHasMore);
  const handleLoadMore =
    isSearching && searchAllowed
      ? () => setSearchPage((prev) => prev + 1)
      : showingUploads
        ? onLoadMoreUploads
        : onLoadMoreAssets;

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

        {searchAllowed ? (
          <div className={styles.memoryPickerToolbar}>
            <label className={styles.memoryPickerSearch}>
              <span className={styles.srOnly}>Search memories</span>
              <input
                type="search"
                placeholder="Search memories..."
                value={searchText}
                onChange={(event) => {
                  setSearchText(event.target.value);
                  setSearchPage(0);
                }}
              />
            </label>
            {searchText ? (
              <button
                type="button"
                className={styles.memoryPickerClear}
                onClick={() => {
                  setSearchText("");
                  setSearchPage(0);
                  setSearchItems([]);
                  setSearchHasMore(false);
                  setSearchError(null);
                }}
                aria-label="Clear search"
              >
                Clear
              </button>
            ) : null}
          </div>
        ) : null}

        <div className={styles.memoryPickerContent}>
          {loading && items.length === 0 ? (
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

        {hasMore && handleLoadMore ? (
          <div className={styles.memoryPickerFooter}>
            <button
              type="button"
              className={styles.memoryPickerLoadMore}
              onClick={handleLoadMore}
              disabled={loading}
            >
              {loading ? "Loading..." : "Load more"}
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
