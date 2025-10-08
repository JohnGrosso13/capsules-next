"use client";

import * as React from "react";
import useEmblaCarousel from "embla-carousel-react";

import styles from "./uploads-carousel.module.css";
import { Button, ButtonLink } from "@/components/ui/button";
import { useAttachmentUpload } from "@/hooks/useAttachmentUpload";
import { shouldBypassCloudflareImages } from "@/lib/cloudflare/runtime";

import { computeDisplayUploads } from "./process-uploads";
import { useMemoryUploads } from "./use-memory-uploads";
import type { DisplayMemoryUpload } from "./uploads-types";

function isVideo(mime: string | null | undefined) {
  return typeof mime === "string" && mime.startsWith("video/");
}

const MAX_VISIBLE = 6;
const VIEW_ALL_ROUTE = "/memory/uploads";

function getSlidesPerView() {
  if (typeof window === "undefined") return 2;
  const width = window.innerWidth;
  if (width >= 960) return 4;
  if (width >= 640) return 3;
  return 2;
}

export function UploadsCarousel() {
  const { user, envelope, items, loading, error, setError, refresh } = useMemoryUploads();

  const [emblaRef, emblaApi] = useEmblaCarousel({ align: "start", dragFree: true, loop: false });
  const [slidesPerView, setSlidesPerView] = React.useState<number>(() => getSlidesPerView());

  const {
    fileInputRef,
    attachment,
    readyAttachment,
    uploading,
    handleAttachClick,
    handleAttachmentSelect,
    clearAttachment,
  } = useAttachmentUpload();

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

  const indexUploaded = React.useCallback(async () => {
    if (!envelope || !readyAttachment || !readyAttachment.url) return;
    try {
      setError(null);
      const body = {
        user: envelope,
        item: {
          kind: "upload",
          media_url: readyAttachment.url,
          media_type: readyAttachment.mimeType,
          title: readyAttachment.name,
          description: null,
          meta: {
            upload_key: readyAttachment.key ?? undefined,
            upload_session_id: readyAttachment.sessionId ?? undefined,
            source: "upload",
          },
        },
      };
      const res = await fetch("/api/memory/upsert", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(await res.text().catch(() => "Index failed"));
      clearAttachment();
      await refresh();
    } catch (err) {
      setError((err as Error)?.message || "Upload indexing failed");
    }
  }, [clearAttachment, envelope, readyAttachment, refresh, setError]);

  React.useEffect(() => {
    if (readyAttachment) {
      void indexUploaded();
    }
  }, [indexUploaded, readyAttachment]);

  const progressPct =
    attachment && attachment.progress > 0
      ? Math.min(100, Math.max(0, Math.round(attachment.progress)))
      : 0;
  const progressStyle = React.useMemo<React.CSSProperties>(
    () => ({ "--progress": `${progressPct}%` } as React.CSSProperties),
    [progressPct],
  );

  const containerStyle = React.useMemo<React.CSSProperties>(
    () =>
      ({ "--carousel-visible-count": Math.max(1, pageSize) } as React.CSSProperties),
    [pageSize],
  );

  const renderCard = (item: DisplayMemoryUpload) => {
    const url = item.displayUrl || item.media_url || "";
    const mime = item.media_type || null;
    const title = item.title?.trim() || item.description?.trim() || "Upload";
    const desc = item.description?.trim() || null;
    return (
      <div className={styles.card}>
        <div className={styles.media}>
          {isVideo(mime) ? (
            <video
              className={styles.video}
              src={item.fullUrl || url}
              preload="metadata"
              muted
              playsInline
              loop
            />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img className={styles.img} src={url} alt={title} />
          )}
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
          <h3 className={styles.title}>Uploads</h3>
        </div>
        <div className={styles.empty}>Sign in to upload and view your memories.</div>
      </div>
    );
  }

  return (
    <div className={styles.root}>
      <div className={styles.header}>
        <h3 className={styles.title}>Uploads</h3>
        <div className={styles.controls}>
          <Button
            variant="ghost"
            size="icon"
            onClick={handleShowPrev}
            aria-label="Previous uploads"
            disabled={!hasRotation}
          >
            {"<"}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={handleShowNext}
            aria-label="Next uploads"
            disabled={!hasRotation}
          >
            {">"}
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,video/*"
            onChange={handleAttachmentSelect}
            hidden
          />
          <Button variant="secondary" size="sm" onClick={handleAttachClick} loading={uploading}>
            {uploading ? "Uploading..." : "Add Upload"}
          </Button>
          <ButtonLink variant="ghost" size="sm" href={VIEW_ALL_ROUTE}>
            View All
          </ButtonLink>
        </div>
      </div>

      <div className={styles.statusRow}>
        {error ? <span role="status">{error}</span> : null}
        {uploading ? (
          <div
            className={styles.progressBar}
            aria-label="Upload progress"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={progressPct}
            role="progressbar"
          >
            <div className={styles.progressInner} style={progressStyle} />
          </div>
        ) : null}
      </div>

      {loading ? (
        <div className={styles.empty}>Loading your uploads...</div>
      ) : visibleItems.length === 0 ? (
        <div className={styles.empty}>No uploads yet. Add your first image or video.</div>
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
