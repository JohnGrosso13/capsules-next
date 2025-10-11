"use client";

import * as React from "react";
import Link from "next/link";
import useEmblaCarousel from "embla-carousel-react";
import { CaretLeft, CaretRight } from "@phosphor-icons/react/dist/ssr";

import { Button } from "@/components/ui/button";
import { shouldBypassCloudflareImages } from "@/lib/cloudflare/runtime";

import { computeDisplayUploads } from "./process-uploads";
import { useMemoryUploads } from "./use-memory-uploads";
import type { DisplayMemoryUpload } from "./uploads-types";
import styles from "./uploads-carousel.module.css";
import { MemoryUploadDetailDialog } from "./upload-detail-dialog";

function joinClassNames(...values: Array<string | undefined>): string {
  return values.filter(Boolean).join(" ");
}

const MAX_VISIBLE = 6;

export type MemoryAssetVariant = "banner" | "store_banner" | "promo_tile" | "logo" | "avatar" | "unknown";

const VARIANT_LABELS: Record<MemoryAssetVariant, string> = {
  banner: "Capsule Banner",
  store_banner: "Store Banner",
  promo_tile: "Promo Tile",
  logo: "Capsule Logo",
  avatar: "User Logo",
  unknown: "Asset",
};

function normalizeString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed.toLowerCase() : null;
}

function toMetaObject(meta: unknown): Record<string, unknown> | null {
  if (!meta || typeof meta === "undefined") return null;
  if (typeof meta === "string") {
    try {
      const parsed = JSON.parse(meta);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      return null;
    }
  }
  if (typeof meta === "object" && !Array.isArray(meta)) {
    return meta as Record<string, unknown>;
  }
  return null;
}

function extractMetaValue(meta: Record<string, unknown> | null | undefined, keys: string[]): string | null {
  if (!meta || typeof meta !== "object") return null;
  for (const key of keys) {
    const value = normalizeString((meta as Record<string, unknown>)[key]);
    if (value) return value;
  }
  return null;
}

export function detectAssetVariant(item: DisplayMemoryUpload): MemoryAssetVariant {
  const meta = toMetaObject(item.meta ?? null);

  const candidates: Array<string | null> = [
    extractMetaValue(meta, ["asset_variant", "assetVariant"]),
    extractMetaValue(meta, ["source", "source_kind", "sourceKind"]),
    extractMetaValue(meta, ["variant"]),
    normalizeString(item.kind),
    normalizeString(item.title),
    normalizeString(item.description),
  ];

  const summaryTagsValue = meta?.summary_tags ?? null;
  if (Array.isArray(summaryTagsValue)) {
    candidates.push(...summaryTagsValue.map((value) => normalizeString(value)));
  } else if (typeof summaryTagsValue === "string") {
    candidates.push(...summaryTagsValue.split(",").map((value) => normalizeString(value)));
  }

  if (meta) {
    for (const value of Object.values(meta)) {
      if (typeof value === "string") {
        candidates.push(normalizeString(value));
      } else if (Array.isArray(value)) {
        for (const entry of value) {
          if (typeof entry === "string") {
            candidates.push(normalizeString(entry));
          }
        }
      }
    }
  }

  for (const candidate of candidates) {
    if (!candidate) continue;
    if (candidate.includes("avatar") || candidate.includes("profile")) {
      return "avatar";
    }
    if (candidate.includes("logo")) {
      return "logo";
    }
    if (candidate.includes("store") && candidate.includes("banner")) {
      return "store_banner";
    }
    if (candidate.includes("banner")) {
      return "banner";
    }
    if (candidate.includes("promo") || candidate.includes("tile")) {
      return "promo_tile";
    }
  }

  return "unknown";
}

export function getAssetVariantLabel(variant: MemoryAssetVariant): string {
  return VARIANT_LABELS[variant] ?? VARIANT_LABELS.unknown;
}

export function formatAssetTimestamp(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  try {
    return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(date);
  } catch {
    return date.toLocaleString();
  }
}

function getMediaClassName(variant: MemoryAssetVariant): string {
  if (variant === "banner" || variant === "store_banner") {
    return joinClassNames(styles.media, styles.bannerMedia);
  }
  if (variant === "logo" || variant === "avatar") {
    return joinClassNames(styles.media, styles.squareMedia);
  }
  if (variant === "promo_tile") {
    return joinClassNames(styles.media, styles.tileMedia);
  }
  return styles.media ?? "";
}

type MemoryAssetCardProps = {
  item: DisplayMemoryUpload;
  onSelect: (item: DisplayMemoryUpload) => void;
};

function MemoryAssetCard({ item, onSelect }: MemoryAssetCardProps) {
  const variant = detectAssetVariant(item);
  const variantLabel = getAssetVariantLabel(variant);
  const createdAt = formatAssetTimestamp(item.created_at ?? null);
  const url = item.displayUrl || item.media_url || "";
  const title = item.title?.trim() || item.description?.trim() || "Asset";
  const desc = item.description?.trim() || null;

  return (
    <button
      type="button"
      className={styles.cardButton}
      onClick={() => onSelect(item)}
      aria-label={`View details for ${title}`}
    >
      <article className={styles.card} data-variant={variant}>
        <div className={getMediaClassName(variant)}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className={styles.img} src={url} alt={title} loading="lazy" />
        </div>
        <div className={styles.meta}>
          <div className={styles.metaHeader}>
            <span className={styles.metaBadge}>{variantLabel}</span>
            {createdAt ? <span className={styles.metaTimestamp}>{createdAt}</span> : null}
          </div>
          <h4 className={styles.metaTitle}>{title}</h4>
          {desc ? <p className={styles.metaDesc}>{desc}</p> : null}
        </div>
      </article>
    </button>
  );
}

function getSlidesPerView() {
  if (typeof window === "undefined") return 2;
  const width = window.innerWidth;
  if (width >= 960) return 4;
  if (width >= 640) return 3;
  return 2;
}

export type MemoryAssetCarouselProps = {
  title: string;
  variants: MemoryAssetVariant[];
  viewAllHref?: string;
  viewAllLabel?: string;
  emptySignedOut: string;
  emptyLoading: string;
  emptyNone: string;
};

export function MemoryAssetCarousel({
  title,
  variants,
  viewAllHref,
  viewAllLabel = "View all",
  emptySignedOut,
  emptyLoading,
  emptyNone,
}: MemoryAssetCarouselProps) {
  const { user, items, loading, error, refresh } = useMemoryUploads(null);
  const cloudflareEnabled = React.useMemo(() => !shouldBypassCloudflareImages(), []);
  const currentOrigin = React.useMemo(
    () => (typeof window !== "undefined" ? window.location.origin : null),
    [],
  );
  const [emblaRef, emblaApi] = useEmblaCarousel({ align: "start", dragFree: true, loop: false });
  const [slidesPerView, setSlidesPerView] = React.useState<number>(() => getSlidesPerView());
  const [offset, setOffset] = React.useState(0);
  const [activeItem, setActiveItem] = React.useState<DisplayMemoryUpload | null>(null);

  const processedItems = React.useMemo(
    () => computeDisplayUploads(items, { origin: currentOrigin, cloudflareEnabled }),
    [cloudflareEnabled, currentOrigin, items],
  );

  const filteredItems = React.useMemo(
    () =>
      processedItems.filter((item) => {
        const variant = detectAssetVariant(item);
        return variants.includes(variant);
      }),
    [processedItems, variants],
  );

  React.useEffect(() => {
    if (typeof window === "undefined") return;
    const updateSlidesPerView = () => setSlidesPerView(getSlidesPerView());
    updateSlidesPerView();
    window.addEventListener("resize", updateSlidesPerView);
    return () => {
      window.removeEventListener("resize", updateSlidesPerView);
    };
  }, []);

  const totalItems = filteredItems.length;
  const pageSize = React.useMemo(() => {
    if (totalItems === 0) return 0;
    return Math.max(1, Math.min(MAX_VISIBLE, slidesPerView, totalItems));
  }, [slidesPerView, totalItems]);

  React.useEffect(() => {
    if (totalItems === 0) {
      setOffset(0);
      return;
    }
    if (pageSize === 0 || totalItems <= pageSize) {
      setOffset(0);
      return;
    }
    setOffset((previous) => previous % totalItems);
  }, [pageSize, totalItems]);

  const visibleItems = React.useMemo(() => {
    if (pageSize === 0) return [];
    const result: DisplayMemoryUpload[] = [];
    for (let index = 0; index < pageSize; index += 1) {
      const item = filteredItems[(offset + index) % totalItems];
      if (item) result.push(item);
    }
    return result;
  }, [filteredItems, offset, pageSize, totalItems]);

  React.useEffect(() => {
    queueMicrotask(() => emblaApi?.reInit());
  }, [emblaApi, visibleItems]);

  const hasRotation = pageSize > 0 && totalItems > pageSize;

  const handleShowPrev = React.useCallback(() => {
    if (!hasRotation || totalItems === 0 || pageSize === 0) return;
    setOffset((previous) => {
      const next = (previous - pageSize) % totalItems;
      return next < 0 ? next + totalItems : next;
    });
  }, [hasRotation, pageSize, totalItems]);

  const handleShowNext = React.useCallback(() => {
    if (!hasRotation || totalItems === 0 || pageSize === 0) return;
    setOffset((previous) => (previous + pageSize) % totalItems);
  }, [hasRotation, pageSize, totalItems]);

  const containerStyle = React.useMemo<React.CSSProperties>(
    () =>
      ({ "--carousel-visible-count": Math.max(1, pageSize) } as React.CSSProperties),
    [pageSize],
  );

  return (
    <>
      <div className={styles.root}>
        <div className={styles.header}>
          <h3 className={styles.title}>{title}</h3>
          <div className={styles.controls}>
            <Button
              variant="secondary"
              size="icon"
              leftIcon={<CaretLeft size={18} weight="bold" />}
              onClick={handleShowPrev}
              aria-label={`Previous ${title.toLowerCase()}`}
              disabled={!hasRotation || loading}
            />
            <Button
              variant="secondary"
              size="icon"
              leftIcon={<CaretRight size={18} weight="bold" />}
              onClick={handleShowNext}
              aria-label={`Next ${title.toLowerCase()}`}
              disabled={!hasRotation || loading}
            />
            {viewAllHref ? (
              <Button variant="secondary" size="sm" asChild>
                <Link href={viewAllHref}>{viewAllLabel}</Link>
              </Button>
            ) : null}
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                void refresh();
              }}
              loading={loading}
            >
              Refresh
            </Button>
          </div>
        </div>

        {!user ? <div className={styles.empty}>{emptySignedOut}</div> : null}
        {user && error ? <div className={styles.empty}>{error}</div> : null}

        {user ? (
          loading && !filteredItems.length ? (
            <div className={styles.empty}>{emptyLoading}</div>
          ) : !filteredItems.length ? (
            <div className={styles.empty}>{emptyNone}</div>
          ) : (
            <div className={styles.viewport} ref={emblaRef}>
              <div className={styles.container} style={containerStyle}>
                {visibleItems.map((item) => (
                  <div className={styles.slide} key={item.id}>
                    <MemoryAssetCard item={item} onSelect={setActiveItem} />
                  </div>
                ))}
              </div>
            </div>
          )
        ) : null}
      </div>
      {user ? <MemoryUploadDetailDialog item={activeItem} onClose={() => setActiveItem(null)} /> : null}
    </>
  );
}

export function CapsuleAssetsCarousel() {
  return (
    <MemoryAssetCarousel
      title="Capsule Assets"
      variants={["banner", "store_banner", "promo_tile", "logo", "avatar"]}
      viewAllHref="/memory/assets?tab=banners"
      emptySignedOut="Sign in to access your capsule assets."
      emptyLoading="Loading your capsule assets..."
      emptyNone="No capsule assets saved yet. Customize a capsule or profile to add one."
    />
  );
}
