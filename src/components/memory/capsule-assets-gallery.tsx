"use client";

import * as React from "react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { shouldBypassCloudflareImages } from "@/lib/cloudflare/runtime";

import {
  detectAssetVariant,
  formatAssetTimestamp,
  getAssetVariantLabel,
  type MemoryAssetVariant,
} from "./asset-carousel";
import { computeDisplayUploads } from "./process-uploads";
import { useMemoryUploads } from "./use-memory-uploads";
import type { DisplayMemoryUpload } from "./uploads-types";
import carouselStyles from "./uploads-carousel.module.css";
import styles from "./capsule-assets-gallery.module.css";
import { MemoryUploadDetailDialog } from "./upload-detail-dialog";

type GalleryTab = {
  value: string;
  label: string;
  variants: MemoryAssetVariant[];
  emptyMessage: string;
  loadingMessage: string;
};

const GALLERY_TABS: GalleryTab[] = [
  {
    value: "banners",
    label: "Capsule Banners",
    variants: ["banner"],
    emptyMessage: "No capsule banners saved yet. Customize a capsule to add one.",
    loadingMessage: "Loading your capsule banners...",
  },
  {
    value: "tiles",
    label: "Promo Tiles",
    variants: ["promo_tile"],
    emptyMessage: "No promo tiles saved yet. Generate or upload one to see it here.",
    loadingMessage: "Loading your promo tiles...",
  },
  {
    value: "logos",
    label: "Capsule Logos",
    variants: ["logo"],
    emptyMessage: "No capsule logos saved yet. Customize a capsule to add one.",
    loadingMessage: "Loading your capsule logos...",
  },
  {
    value: "store-banners",
    label: "Store Banners",
    variants: ["store_banner"],
    emptyMessage: "No store banners saved yet. Design a storefront hero to add one.",
    loadingMessage: "Loading your store banners...",
  },
  {
    value: "user-logos",
    label: "User Logos",
    variants: ["avatar"],
    emptyMessage: "No user logos saved yet. Personalize your profile to add one.",
    loadingMessage: "Loading your user logos...",
  },
];

function buildInitialTab(initialValue: string | null | undefined): string {
  if (!initialValue) return GALLERY_TABS[0]?.value ?? "banners";
  const normalized = initialValue.toLowerCase();
  return GALLERY_TABS.some((tab) => tab.value === normalized)
    ? normalized
    : GALLERY_TABS[0]?.value ?? "banners";
}

function groupAssetsByTab(
  items: DisplayMemoryUpload[],
): Record<string, DisplayMemoryUpload[]> {
  const record: Record<string, DisplayMemoryUpload[]> = {};
  for (const tab of GALLERY_TABS) {
    record[tab.value] = [];
  }

  for (const item of items) {
    const variant = detectAssetVariant(item);
    for (const tab of GALLERY_TABS) {
      if (tab.variants.includes(variant)) {
        record[tab.value].push(item);
      }
    }
  }

  for (const key of Object.keys(record)) {
    record[key].sort((a, b) => {
      const aTime = a.created_at ? new Date(a.created_at).getTime() : 0;
      const bTime = b.created_at ? new Date(b.created_at).getTime() : 0;
      return bTime - aTime;
    });
  }

  return record;
}

type CapsuleAssetsGalleryProps = {
  initialTab?: string | null;
};

export function CapsuleAssetsGallery({ initialTab }: CapsuleAssetsGalleryProps) {
  const [activeItem, setActiveItem] = React.useState<DisplayMemoryUpload | null>(null);
  const [activeTab, setActiveTab] = React.useState(() => buildInitialTab(initialTab));
  const { user, items, loading, error, refresh } = useMemoryUploads();
  const cloudflareEnabled = React.useMemo(() => !shouldBypassCloudflareImages(), []);
  const currentOrigin = React.useMemo(
    () => (typeof window !== "undefined" ? window.location.origin : null),
    [],
  );

  const processedItems = React.useMemo(
    () => computeDisplayUploads(items, { origin: currentOrigin, cloudflareEnabled }),
    [cloudflareEnabled, currentOrigin, items],
  );

  const groupedByTab = React.useMemo(
    () => groupAssetsByTab(processedItems),
    [processedItems],
  );

  React.useEffect(() => {
    setActiveTab((previous) => buildInitialTab(previous));
  }, []);

  const renderCard = (item: DisplayMemoryUpload) => {
    const variant = detectAssetVariant(item);
    const variantLabel = getAssetVariantLabel(variant);
    const createdAt = formatAssetTimestamp(item.created_at ?? null);
    const url = item.displayUrl || item.media_url || "";
    const title = item.title?.trim() || item.description?.trim() || "Asset";
    const desc = item.description?.trim() || null;

    const mediaClassName =
      variant === "banner" || variant === "store_banner"
        ? `${carouselStyles.media} ${carouselStyles.bannerMedia}`
        : variant === "logo" || variant === "avatar"
          ? `${carouselStyles.media} ${carouselStyles.squareMedia}`
          : variant === "promo_tile"
            ? `${carouselStyles.media} ${carouselStyles.tileMedia}`
            : carouselStyles.media;

    return (
      <button
        key={item.id}
        type="button"
        className={`${carouselStyles.cardButton} ${styles.cardButton}`}
        onClick={() => setActiveItem(item)}
        aria-label={`View details for ${title}`}
      >
        <article className={carouselStyles.card} data-variant={variant}>
          <div className={mediaClassName}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className={carouselStyles.img} src={url} alt={title} loading="lazy" />
          </div>
          <div className={carouselStyles.meta}>
            <div className={carouselStyles.metaHeader}>
              <span className={carouselStyles.metaBadge}>{variantLabel}</span>
              {createdAt ? <span className={carouselStyles.metaTimestamp}>{createdAt}</span> : null}
            </div>
            <h4 className={carouselStyles.metaTitle}>{title}</h4>
            {desc ? <p className={carouselStyles.metaDesc}>{desc}</p> : null}
          </div>
        </article>
      </button>
    );
  };

  if (!user) {
    return <div className={styles.empty}>Sign in to explore your capsule assets.</div>;
  }

  return (
    <section className={styles.root}>
      <div className={styles.actions}>
        <div className={styles.actionGroup}>
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
          <Button variant="ghost" size="sm" asChild>
            <Link href="/memory">Back to Memory</Link>
          </Button>
        </div>
      </div>

      {error ? <p className={styles.status}>{error}</p> : null}

      <Tabs value={activeTab} onValueChange={setActiveTab} variant="outline">
        <TabsList className={styles.tabList}>
          {GALLERY_TABS.map((tab) => (
            <TabsTrigger key={tab.value} value={tab.value}>
              {tab.label}
            </TabsTrigger>
          ))}
        </TabsList>
        {GALLERY_TABS.map((tab) => {
          const tabItems = groupedByTab[tab.value] ?? [];
          return (
            <TabsContent key={tab.value} value={tab.value} className={styles.tabContent}>
              {loading && !tabItems.length ? (
                <div className={styles.empty}>{tab.loadingMessage}</div>
              ) : !tabItems.length ? (
                <div className={styles.empty}>{tab.emptyMessage}</div>
              ) : (
                <div className={styles.grid}>{tabItems.map((item) => renderCard(item))}</div>
              )}
            </TabsContent>
          );
        })}
      </Tabs>

      <MemoryUploadDetailDialog item={activeItem} onClose={() => setActiveItem(null)} />
    </section>
  );
}
