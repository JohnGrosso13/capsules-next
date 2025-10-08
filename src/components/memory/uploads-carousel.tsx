"use client";

import * as React from "react";
import type { EmblaCarouselType } from "embla-carousel";
import useEmblaCarousel from "embla-carousel-react";
import { CaretLeft, CaretRight } from "@phosphor-icons/react/dist/ssr";

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

const VIEW_ALL_ROUTE = "/memory/uploads";

export function UploadsCarousel() {
  const { user, envelope, items, loading, error, setError, refresh } = useMemoryUploads();

  const [emblaRef, emblaApi] = useEmblaCarousel({
    align: "start",
    dragFree: true,
    containScroll: "trimSnaps",
    loop: false,
  });

  const [canScrollPrev, setCanScrollPrev] = React.useState(false);
  const [canScrollNext, setCanScrollNext] = React.useState(false);

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

  const refreshScrollButtons = React.useCallback(
    (api: EmblaCarouselType) => {
      setCanScrollPrev(api.canScrollPrev());
      setCanScrollNext(api.canScrollNext());
    },
    [],
  );

  React.useEffect(() => {
    if (!emblaApi) return;
    refreshScrollButtons(emblaApi);
    emblaApi.on("select", refreshScrollButtons);
    emblaApi.on("reInit", refreshScrollButtons);
    return () => {
      emblaApi.off("select", refreshScrollButtons);
      emblaApi.off("reInit", refreshScrollButtons);
    };
  }, [emblaApi, refreshScrollButtons]);

  React.useEffect(() => {
    if (!emblaApi) return;
    emblaApi.reInit();
  }, [emblaApi, totalItems]);

  const handleShowPrev = React.useCallback(() => {
    emblaApi?.scrollPrev();
  }, [emblaApi]);

  const handleShowNext = React.useCallback(() => {
    emblaApi?.scrollNext();
  }, [emblaApi]);

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
            <div className={styles.progressInner} style={{ ["--progress" as any]: `${progressPct}%` }} />
          </div>
        ) : null}
      </div>

      {loading ? (
        <div className={styles.empty}>Loading your uploads...</div>
      ) : processedItems.length === 0 ? (
        <div className={styles.empty}>No uploads yet. Add your first image or video.</div>
      ) : (
        <div className={styles.carousel}>
          <Button
            variant="secondary"
            size="icon"
            className={`${styles.arrow} ${styles.arrowPrev}`}
            onClick={handleShowPrev}
            aria-label="Previous uploads"
            disabled={!canScrollPrev}
            type="button"
          >
            <CaretLeft size={18} aria-hidden="true" />
          </Button>

          <div className={styles.viewport} ref={emblaRef}>
            <div className={styles.container}>
              {processedItems.map((item) => (
                <div className={styles.slide} key={item.id}>
                  {renderCard(item)}
                </div>
              ))}
            </div>
          </div>

          <Button
            variant="secondary"
            size="icon"
            className={`${styles.arrow} ${styles.arrowNext}`}
            onClick={handleShowNext}
            aria-label="Next uploads"
            disabled={!canScrollNext}
            type="button"
          >
            <CaretRight size={18} aria-hidden="true" />
          </Button>
        </div>
      )}
    </div>
  );
}
