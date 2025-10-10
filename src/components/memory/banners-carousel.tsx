"use client";

import * as React from "react";
import useEmblaCarousel from "embla-carousel-react";

import styles from "./uploads-carousel.module.css";
import { Button } from "@/components/ui/button";
import { useMemoryUploads } from "./use-memory-uploads";
import { computeDisplayUploads } from "./process-uploads";
import { shouldBypassCloudflareImages } from "@/lib/cloudflare/runtime";
import type { DisplayMemoryUpload } from "./uploads-types";

const MAX_VISIBLE = 6;

function getSlidesPerView() {
  if (typeof window === "undefined") return 2;
  const width = window.innerWidth;
  if (width >= 960) return 4;
  if (width >= 640) return 3;
  return 2;
}

export function BannersCarousel() {
  const { user, items, loading, error, refresh } = useMemoryUploads("banner");
  const [emblaRef, emblaApi] = useEmblaCarousel({ align: "start", dragFree: true, loop: false });
  const [slidesPerView, setSlidesPerView] = React.useState<number>(() => getSlidesPerView());

  const cloudflareEnabled = React.useMemo(() => !shouldBypassCloudflareImages(), []);
  const currentOrigin = React.useMemo(
    () => (typeof window !== "undefined" ? window.location.origin : null),
    [],
  );

  const processedItems = React.useMemo(
    () => computeDisplayUploads(items, { origin: currentOrigin, cloudflareEnabled }),
    [cloudflareEnabled, currentOrigin, items],
  );

  const totalItems = processedItems.length;
  const pageSize = React.useMemo(() => {
    if (totalItems === 0) return 0;
    return Math.max(1, Math.min(MAX_VISIBLE, slidesPerView, totalItems));
  }, [slidesPerView, totalItems]);
  const [offset, setOffset] = React.useState(0);

  React.useEffect(() => {
    if (typeof window === "undefined") return;
    const updateSlidesPerView = () => setSlidesPerView(getSlidesPerView());
    updateSlidesPerView();
    window.addEventListener("resize", updateSlidesPerView);
    return () => {
      window.removeEventListener("resize", updateSlidesPerView);
    };
  }, []);

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
      const item = processedItems[(offset + index) % totalItems];
      if (item) result.push(item);
    }
    return result;
  }, [offset, pageSize, processedItems, totalItems]);

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

  const renderCard = (item: DisplayMemoryUpload) => {
    const url = item.displayUrl || item.media_url || "";
    const title = item.title?.trim() || item.description?.trim() || "Capsule banner";
    const desc = item.description?.trim() || null;
    return (
      <div className={styles.card}>
        <div className={`${styles.media} ${styles.bannerMedia}`}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className={styles.img} src={url} alt={title} />
        </div>
        <div className={styles.meta}>
          <h4 className={styles.metaTitle}>{title}</h4>
          {desc ? <p className={styles.metaDesc}>{desc}</p> : null}
        </div>
      </div>
    );
  };

  if (!user) {
    return (
      <div className={styles.root}>
        <div className={styles.header}>
          <h3 className={styles.title}>Banners and Tiles</h3>
        </div>
        <div className={styles.empty}>Sign in to save and recall capsule banners and tiles.</div>
      </div>
    );
  }

  return (
    <div className={styles.root}>
      <div className={styles.header}>
        <h3 className={styles.title}>Banners and Tiles</h3>
        <div className={styles.controls}>
          <Button
            variant="ghost"
            size="icon"
            onClick={handleShowPrev}
            aria-label="Previous banners and tiles"
            disabled={!hasRotation || loading}
          >
            {"<"}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={handleShowNext}
            aria-label="Next banners and tiles"
            disabled={!hasRotation || loading}
          >
            {">"}
          </Button>
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

      {error ? <div className={styles.empty}>{error}</div> : null}

      {loading ? (
        <div className={styles.empty}>Loading your banners and tiles...</div>
      ) : visibleItems.length === 0 ? (
        <div className={styles.empty}>No banners or tiles saved yet. Customize a capsule to add one.</div>
      ) : (
        <div className={styles.viewport} ref={emblaRef}>
          <div className={styles.container} style={containerStyle}>
            {visibleItems.map((item) => (
              <div className={styles.slide} key={item.id}>
                {renderCard(item)}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}



