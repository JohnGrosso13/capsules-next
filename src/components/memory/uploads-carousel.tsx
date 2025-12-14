"use client";

import * as React from "react";
import useEmblaCarousel from "embla-carousel-react";

import { Button, ButtonLink } from "@/components/ui/button";
import { useAttachmentUpload } from "@/hooks/useAttachmentUpload";
import { shouldBypassCloudflareImages } from "@/lib/cloudflare/runtime";
import {
  ArrowRight,
  CaretLeft,
  CaretRight,
  CloudArrowUp,
  FilePdf,
  FileText,
  PlayCircle,
  PresentationChart,
} from "@phosphor-icons/react/dist/ssr";

import { computeDisplayUploads } from "./process-uploads";
import { useMemoryUploads } from "./use-memory-uploads";
import type { DisplayMemoryUpload, MemoryUploadItem } from "./uploads-types";
import layoutStyles from "./memory-carousel-shell.module.css";
import styles from "./uploads-carousel.module.css";
import { MemoryUploadDetailDialog } from "./upload-detail-dialog";
import { getUploadExtension, isImage, isVideo } from "./upload-helpers";

const MAX_VISIBLE = 6;
const VIEW_ALL_ROUTE = "/memory/uploads";

function normalizeMeta(meta: unknown): Record<string, unknown> | null {
  if (!meta) return null;
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

function collectMetaTokens(meta: Record<string, unknown> | null): string[] {
  if (!meta) return [];
  const tokens: string[] = [];
  const push = (value: unknown) => {
    if (typeof value !== "string") return;
    const normalized = value.trim().toLowerCase();
    if (normalized.length) tokens.push(normalized);
  };

  [
    "source",
    "source_kind",
    "sourceKind",
    "asset_variant",
    "assetVariant",
    "asset_kind",
    "assetKind",
    "category",
    "mime_type",
    "mimeType",
    "content_type",
    "contentType",
    "file_extension",
    "fileExtension",
    "extension",
    "ext",
    "type",
  ].forEach((key) => push((meta as Record<string, unknown>)[key]));

  const summaryTags =
    (meta as { summary_tags?: unknown }).summary_tags ??
    (meta as { summaryTags?: unknown }).summaryTags;
  if (Array.isArray(summaryTags)) {
    summaryTags.forEach(push);
  } else if (typeof summaryTags === "string") {
    summaryTags.split(",").forEach(push);
  }

  return Array.from(new Set(tokens));
}

export function isAiVideoMemory(item: DisplayMemoryUpload): boolean {
  const meta = normalizeMeta(item.meta);
  const tokens = collectMetaTokens(meta);
  const hasAi = tokens.some((token) => token.includes("ai"));
  const hasVideoToken = tokens.some(
    (token) => token.includes("video") || token.includes("clip"),
  );
  const kind = (item.kind ?? "").toLowerCase();
  const mime = (item.media_type ?? "").toLowerCase();
  const videoLike = mime.startsWith("video/");

  if (kind && kind !== "video") return false;
  if (!videoLike && kind !== "video") return false;

  return hasAi && (hasVideoToken || kind === "video" || videoLike);
}

export function isPdfMemory(item: DisplayMemoryUpload): boolean {
  const mime = (item.media_type ?? "").toLowerCase();
  if (mime.includes("pdf")) return true;

  const ext = getUploadExtension(item);
  if (ext && ext.toLowerCase() === "pdf") return true;

  const meta = normalizeMeta(item.meta);
  const tokens = collectMetaTokens(meta);
  return tokens.some((token) => token.includes("pdf"));
}

export function isPowerpointMemory(item: DisplayMemoryUpload): boolean {
  const mime = (item.media_type ?? "").toLowerCase();
  if (mime.includes("presentation") || mime.includes("powerpoint") || mime.includes("ppt")) {
    return true;
  }
  const ext = getUploadExtension(item);
  if (ext) {
    const lower = ext.toLowerCase();
    if (lower === "ppt" || lower === "pptx") return true;
  }
  const meta = normalizeMeta(item.meta);
  const tokens = collectMetaTokens(meta);
  return tokens.some(
    (token) => token === "ppt" || token === "pptx" || token.includes("presentation"),
  );
}

function getSlidesPerView() {
  if (typeof window === "undefined") return 2;
  const width = window.innerWidth;
  if (width >= 960) return 4;
  if (width >= 640) return 3;
  return 2;
}

export type UploadsCarouselProps = {
  title?: string;
  icon?: React.ReactNode;
  kind?: string | null;
  viewAllHref?: string | null;
  emptySignedOut?: string;
  emptyLoading?: string;
  emptyNone?: string;
  uploadEnabled?: boolean;
  filterItems?: (item: DisplayMemoryUpload) => boolean;
  pageSize?: number;
  initialItems?: MemoryUploadItem[] | undefined;
};

export function UploadsCarousel({
  title = "Uploads",
  icon = <CloudArrowUp size={18} weight="fill" />,
  kind,
  viewAllHref = VIEW_ALL_ROUTE,
  emptySignedOut = "Sign in to upload and view your memories.",
  emptyLoading = "Loading your uploads...",
  emptyNone = "No uploads yet. Add your first image or video.",
  uploadEnabled = true,
  filterItems,
  pageSize,
  initialItems,
}: UploadsCarouselProps = {}) {
  const effectivePageSize = pageSize && pageSize > 0 ? pageSize : 60;
  const { user, envelope, items, loading, error, setError, refresh } = useMemoryUploads(kind, {
    pageSize: effectivePageSize,
    initialPage: initialItems
      ? {
          items: initialItems,
          hasMore: initialItems.length >= effectivePageSize,
        }
      : undefined,
  });

  const [emblaRef, emblaApi] = useEmblaCarousel({ align: "start", dragFree: true, loop: false });
  const setViewportRef = React.useCallback(
    (node: HTMLDivElement | null) => {
      // Always forward the ref so Embla can mount/unmount cleanly.
      emblaRef(node);
    },
    [emblaRef],
  );
  const [slidesPerView, setSlidesPerView] = React.useState<number>(() => getSlidesPerView());
  const [activeItem, setActiveItem] = React.useState<DisplayMemoryUpload | null>(null);

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

  const filteredItems = React.useMemo(
    () => (filterItems ? processedItems.filter(filterItems) : processedItems),
    [filterItems, processedItems],
  );

  const totalItems = filteredItems.length;
  const visiblePageSize = React.useMemo(() => {
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
    if (visiblePageSize === 0 || totalItems <= visiblePageSize) {
      setOffset(0);
      return;
    }
    setOffset((previous) => previous % totalItems);
  }, [visiblePageSize, totalItems]);

  const visibleItems = React.useMemo(() => {
    if (visiblePageSize === 0) return [];
    const result: DisplayMemoryUpload[] = [];
    for (let index = 0; index < visiblePageSize; index += 1) {
      const item = filteredItems[(offset + index) % totalItems];
      if (item) result.push(item);
    }
    return result;
  }, [filteredItems, offset, visiblePageSize, totalItems]);

  React.useEffect(() => {
    queueMicrotask(() => emblaApi?.reInit());
  }, [emblaApi, visibleItems]);

  const hasRotation = visiblePageSize > 0 && totalItems > visiblePageSize;

  const handleShowPrev = React.useCallback(() => {
    if (!hasRotation || totalItems === 0 || visiblePageSize === 0) return;
    setOffset((previous) => {
      const next = (previous - visiblePageSize) % totalItems;
      return next < 0 ? next + totalItems : next;
    });
  }, [hasRotation, visiblePageSize, totalItems]);

  const handleShowNext = React.useCallback(() => {
    if (!hasRotation || totalItems === 0 || visiblePageSize === 0) return;
    setOffset((previous) => (previous + visiblePageSize) % totalItems);
  }, [hasRotation, visiblePageSize, totalItems]);

  const indexUploaded = React.useCallback(async () => {
    if (!uploadEnabled || !envelope || !readyAttachment || !readyAttachment.url) return;
    try {
      setError(null);
      const extension =
        typeof readyAttachment.name === "string" && readyAttachment.name.includes(".")
          ? readyAttachment.name.split(".").pop()?.toLowerCase() ?? null
          : null;
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
            mime_type: readyAttachment.mimeType,
            file_extension: extension ?? undefined,
            file_size_bytes: readyAttachment.size,
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
  }, [clearAttachment, envelope, readyAttachment, refresh, setError, uploadEnabled]);

  React.useEffect(() => {
    if (uploadEnabled && readyAttachment) {
      void indexUploaded();
    }
  }, [indexUploaded, readyAttachment, uploadEnabled]);

  const progressPct =
    attachment && attachment.progress > 0
      ? Math.min(100, Math.max(0, Math.round(attachment.progress)))
      : 0;
  const progressStyle = React.useMemo<React.CSSProperties>(
    () => ({ width: `${progressPct}%` }),
    [progressPct],
  );

  const containerStyle = React.useMemo<React.CSSProperties>(
    () => ({
      "--memory-visible-count": Math.max(1, visiblePageSize),
    }) as React.CSSProperties,
    [visiblePageSize],
  );

  const hasSlides = user && !loading && visibleItems.length > 0;
  const navDisabled = loading || !hasRotation || !hasSlides;

  const emptyContent = !user
    ? emptySignedOut
    : loading
      ? emptyLoading
      : error
        ? error
        : emptyNone;

  const renderCard = (item: DisplayMemoryUpload) => {
    const url = item.displayUrl || item.media_url || "";
    const fullUrl = item.fullUrl || url;
    const mime = item.media_type || null;
    const cardTitle = item.title?.trim() || item.description?.trim() || "Upload";
    const desc = item.description?.trim() || null;
    const imageLike = isImage(mime);
    const videoLike = isVideo(mime);
    const extension = getUploadExtension(item);
    const shortLabel = extension ?? (mime ? mime.split("/")[0]?.toUpperCase() ?? null : null);
    const metaType = mime ?? extension ?? null;

    return (
      <button
        type="button"
        className={styles.cardButton}
        onClick={() => setActiveItem(item)}
        aria-label={`View details for ${cardTitle}`}
      >
        <div className={styles.card}>
          <div className={styles.media}>
            {videoLike ? (
              <video
                className={styles.video}
                src={fullUrl}
                preload="none"
                poster={url && url !== fullUrl ? url : undefined}
                muted
                playsInline
              />
            ) : imageLike ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                className={styles.img}
                src={url}
                alt={cardTitle}
                loading="lazy"
                decoding="async"
              />
            ) : (
              <div className={styles.filePreview} aria-hidden>
                <div className={styles.filePreviewIcon}>
                  <FileText size={28} weight="duotone" />
                </div>
                <span className={styles.filePreviewExt}>{shortLabel ?? "FILE"}</span>
              </div>
            )}
          </div>
          <div className={styles.meta}>
            <h4 className={styles.metaTitle}>{cardTitle}</h4>
            {desc ? <p className={styles.metaDesc}>{desc}</p> : null}
            {metaType ? <span className={styles.metaDetail}>{metaType}</span> : null}
          </div>
        </div>
      </button>
    );
  };

  return (
    <>
      <div className={styles.root}>
        <div className={styles.header}>
          <div className={styles.titleGroup}>
            <span className={styles.titleIcon}>{icon}</span>
            <div>
              <h3 className={styles.title}>{title}</h3>
            </div>
          </div>
          <div className={styles.actions}>
            {uploadEnabled && user ? (
              <>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="*/*"
                  onChange={handleAttachmentSelect}
                  hidden
                />
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={handleAttachClick}
                  loading={uploading}
                  leftIcon={<CloudArrowUp size={16} weight="bold" />}
                >
                  {uploading ? "Uploading..." : "Add Upload"}
                </Button>
              </>
            ) : null}
            {viewAllHref ? (
              <ButtonLink
                variant="ghost"
                size="sm"
                href={viewAllHref}
                rightIcon={<ArrowRight size={16} weight="bold" />}
              >
                View All
              </ButtonLink>
            ) : null}
          </div>
        </div>

        {user ? (
          <div className={styles.statusRow}>
            {error ? <span role="status">{error}</span> : null}
            {uploadEnabled && uploading ? (
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
        ) : null}

        <div className={layoutStyles.carouselShell}>
          <Button
            variant="secondary"
            size="icon"
            className={layoutStyles.navButton}
            data-side="prev"
            data-hidden={!visibleItems.length}
            leftIcon={<CaretLeft size={18} weight="bold" />}
            onClick={handleShowPrev}
            aria-label={`Previous ${title.toLowerCase()}`}
            disabled={navDisabled}
          />
          <div className={layoutStyles.viewport} ref={setViewportRef}>
            <div className={layoutStyles.container} style={containerStyle}>
              {hasSlides
                ? visibleItems.map((item) => (
                    <div className={`${layoutStyles.slide} ${styles.slide}`} key={item.id}>
                      {renderCard(item)}
                    </div>
                  ))
                : (
                  <div className={`${layoutStyles.slide} ${styles.slide}`}>
                    <div className={styles.empty}>{emptyContent}</div>
                  </div>
                )}
            </div>
          </div>
          <Button
            variant="secondary"
            size="icon"
            className={layoutStyles.navButton}
            data-side="next"
            data-hidden={!visibleItems.length}
            leftIcon={<CaretRight size={18} weight="bold" />}
            onClick={handleShowNext}
            aria-label={`Next ${title.toLowerCase()}`}
            disabled={navDisabled}
          />
        </div>
      </div>
      {user ? (
        <MemoryUploadDetailDialog item={activeItem} onClose={() => setActiveItem(null)} />
      ) : null}
    </>
  );
}

type UploadVariantProps = { initialItems?: MemoryUploadItem[]; pageSize?: number };

export function AiVideosCarousel({ initialItems, pageSize }: UploadVariantProps = {}) {
  const effectivePageSize = pageSize && pageSize > 0 ? pageSize : 24;
  return (
    <UploadsCarousel
      title="AI Videos"
      icon={<PlayCircle size={18} weight="fill" />}
      kind="video"
      uploadEnabled={false}
      viewAllHref={`${VIEW_ALL_ROUTE}?tab=ai-videos`}
      emptySignedOut="Sign in to view your AI-generated videos."
      emptyLoading="Loading your AI videos..."
      emptyNone="No AI videos yet. Generate a video in the AI composer to see it here."
      filterItems={isAiVideoMemory}
      initialItems={initialItems}
      pageSize={effectivePageSize}
    />
  );
}

export function PdfsCarousel({ initialItems, pageSize }: UploadVariantProps = {}) {
  const effectivePageSize = pageSize && pageSize > 0 ? pageSize : 24;
  return (
    <UploadsCarousel
      title="PDFs"
      icon={<FilePdf size={18} weight="fill" />}
      kind="upload"
      uploadEnabled={false}
      viewAllHref={`${VIEW_ALL_ROUTE}?tab=pdfs`}
      emptySignedOut="Sign in to view your PDFs."
      emptyLoading="Loading your PDFs..."
      emptyNone="No PDFs yet. Generate a PDF to see it here."
      filterItems={isPdfMemory}
      initialItems={initialItems}
      pageSize={effectivePageSize}
    />
  );
}

export function PowerpointsCarousel(
  { initialItems, pageSize }: UploadVariantProps = {},
) {
  const effectivePageSize = pageSize && pageSize > 0 ? pageSize : 24;
  return (
    <UploadsCarousel
      title="Powerpoints"
      icon={<PresentationChart size={18} weight="fill" />}
      kind="upload"
      uploadEnabled={false}
      viewAllHref={`${VIEW_ALL_ROUTE}?tab=powerpoints`}
      emptySignedOut="Sign in to view your Powerpoints."
      emptyLoading="Loading your Powerpoints..."
      emptyNone="No Powerpoints yet. Generate a PPTX in Composer to see it here."
      filterItems={isPowerpointMemory}
      initialItems={initialItems}
      pageSize={effectivePageSize}
    />
  );
}
