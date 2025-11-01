"use client";

import * as React from "react";
import type Hls from "hls.js";
import { Play } from "@phosphor-icons/react/dist/ssr";

import styles from "../home-feed.module.css";
import { canRenderInlineImage } from "@/lib/media";
import type { FeedGalleryItem } from "@/components/home-feed/utils";
import { FeedLazyImage } from "@/components/home-feed/feed-lazy-image";

export type LightboxImageItem = {
  id: string;
  kind: "image" | "video";
  fullUrl: string;
  fullSrcSet?: string | null;
  displayUrl: string;
  displaySrcSet?: string | null;
  thumbnailUrl?: string | null;
  name: string | null;
  alt: string;
  mimeType: string | null;
  width: number | null;
  height: number | null;
  aspectRatio: number | null;
};

export type FeedVideoItem = FeedGalleryItem & { kind: "video" };

type FeedMediaGalleryProps = {
  postId: string;
  items: FeedGalleryItem[];
  onOpenLightbox: (payload: { postId: string; index: number; items: LightboxImageItem[] }) => void;
};

export function FeedMediaGallery({ postId, items, onOpenLightbox }: FeedMediaGalleryProps) {
  const imageLightboxItems = React.useMemo<LightboxImageItem[]>(
    () =>
      items
        .filter((entry): entry is FeedGalleryItem & { kind: "image" } => entry.kind === "image")
        .map((entry) => ({
          id: entry.id,
          kind: "image" as const,
          fullUrl: entry.fullUrl,
          fullSrcSet: entry.fullSrcSet ?? null,
          displayUrl: entry.displayUrl,
          displaySrcSet: entry.displaySrcSet ?? null,
          thumbnailUrl: entry.thumbnailUrl ?? null,
          name: entry.name ?? null,
          alt: entry.name ?? "Post attachment",
          mimeType: entry.mimeType ?? null,
          width: entry.width ?? null,
          height: entry.height ?? null,
          aspectRatio: entry.aspectRatio ?? null,
        })),
    [items],
  );

  const lightboxLookup = React.useMemo(() => {
    const map = new Map<string, number>();
    imageLightboxItems.forEach((entry, index) => {
      map.set(entry.id, index);
    });
    return map;
  }, [imageLightboxItems]);

  const isSingleImageLayout = items.length === 1 && items[0]?.kind === "image";

  if (!items.length) return null;

  return (
    <div
      className={styles.mediaGallery}
      data-count={items.length}
      data-layout={isSingleImageLayout ? "single" : "grid"}
    >
      {items.map((item) => {
        if (item.kind === "video") {
          return <FeedVideo key={item.id} item={item as FeedVideoItem} />;
        }

        if (!imageLightboxItems.length) return null;

        const imageIndex = lightboxLookup.get(item.id) ?? 0;
        const rawAspectRatio =
          typeof item.aspectRatio === "number" && Number.isFinite(item.aspectRatio)
            ? item.aspectRatio
            : null;
        const aspectRatio =
          rawAspectRatio && rawAspectRatio > 0 ? Number(rawAspectRatio.toFixed(4)) : null;
        const orientation =
          aspectRatio && aspectRatio > 0
            ? aspectRatio > 1.05
              ? "landscape"
              : aspectRatio < 0.95
                ? "portrait"
                : "square"
            : null;
        const singleImageStyles: React.CSSProperties | undefined = isSingleImageLayout
          ? {
              aspectRatio: aspectRatio ?? "auto",
              minHeight:
                orientation === "portrait"
                  ? "clamp(320px, 52vh, 820px)"
                  : orientation === "landscape"
                    ? "clamp(220px, 42vh, 620px)"
                    : "clamp(260px, 48vh, 720px)",
              maxHeight:
                orientation === "portrait"
                  ? "min(92vh, 1040px)"
                  : orientation === "landscape"
                    ? "min(78vh, 880px)"
                    : "min(86vh, 960px)",
            }
          : undefined;
        const singleImageMediaStyles: React.CSSProperties | undefined = isSingleImageLayout
          ? {
              objectFit: "contain",
              objectPosition: "center",
              width: "100%",
              height: "100%",
            }
          : undefined;
        const hasDimensions =
          typeof item.width === "number" &&
          Number.isFinite(item.width) &&
          typeof item.height === "number" &&
          Number.isFinite(item.height) &&
          item.width > 0 &&
          item.height > 0;
        const imageWidth = hasDimensions ? Math.max(1, Math.round(item.width as number)) : 1080;
        const imageHeight = hasDimensions ? Math.max(1, Math.round(item.height as number)) : 1080;
        const imageSizes = isSingleImageLayout
          ? "(max-width: 640px) 100vw, 960px"
          : "(max-width: 640px) 100vw, 720px";

        return (
          <button
            key={item.id}
            type="button"
            className={styles.mediaButton}
            data-kind="image"
            data-orientation={orientation ?? undefined}
            style={singleImageStyles}
            onClick={() =>
              onOpenLightbox({
                postId,
                index: imageIndex,
                items: imageLightboxItems,
              })
            }
            aria-label={item.name ? `View ${item.name}` : "View attachment"}
          >
            <FeedLazyImage
              className={styles.media}
              data-kind="image"
              src={item.displayUrl}
              alt={item.name ?? "Post attachment"}
              width={imageWidth}
              height={imageHeight}
              sizes={imageSizes}
              loading="lazy"
              unoptimized
              style={singleImageMediaStyles}
            />
          </button>
        );
      })}
    </div>
  );
}

const HLS_MIME_HINTS = [
  "application/vnd.apple.mpegurl",
  "application/x-mpegurl",
  "application/mpegurl",
];

function isHlsMimeType(value: string | null | undefined): boolean {
  if (typeof value !== "string") return false;
  const lowered = value.toLowerCase();
  return HLS_MIME_HINTS.some((pattern) => lowered.includes(pattern));
}

function isHlsUrl(value: string | null | undefined): boolean {
  if (typeof value !== "string") return false;
  const trimmed = value.trim();
  if (!trimmed) return false;
  const lowered = trimmed.toLowerCase();
  if (lowered.includes(".m3u8")) return true;
  const withoutHash = lowered.split("#")[0] ?? lowered;
  const withoutQuery = withoutHash.split("?")[0] ?? withoutHash;
  if (withoutQuery.endsWith(".m3u8")) return true;
  try {
    const url = new URL(trimmed, typeof window === "undefined" ? "http://localhost" : window.location.href);
    if (url.pathname.toLowerCase().includes(".m3u8")) return true;
    const formatParam = url.searchParams.get("format");
    if (formatParam && formatParam.toLowerCase() === "m3u8") return true;
  } catch {
    /* Relative URLs without protocol may fail URL parsing; ignore. */
  }
  return false;
}

function looksLikeHlsSource(
  mimeType: string | null | undefined,
  url: string | null | undefined,
): boolean {
  return isHlsMimeType(mimeType) || isHlsUrl(url);
}

function FeedVideo({ item }: { item: FeedVideoItem }) {
  const videoItem = item;
  const containerRef = React.useRef<HTMLDivElement | null>(null);
  const videoRef = React.useRef<HTMLVideoElement | null>(null);
  const hlsRef = React.useRef<Hls | null>(null);
  const [isPlaying, setIsPlaying] = React.useState(false);
  const userInteractedRef = React.useRef(false);
  const videoId = videoItem.id;

  const poster =
    videoItem.thumbnailUrl && videoItem.thumbnailUrl !== videoItem.fullUrl
      ? videoItem.thumbnailUrl
      : null;
  const videoUrl = videoItem.fullUrl;
  const isHlsSource = React.useMemo(
    () => looksLikeHlsSource(videoItem.mimeType, videoUrl),
    [videoItem.mimeType, videoUrl],
  );
  const { aspectRatio, orientation } = React.useMemo(() => {
    const isValidDimension = (value: number | null | undefined): value is number =>
      typeof value === "number" && Number.isFinite(value) && value > 0;
    const width = isValidDimension(videoItem.width) ? videoItem.width : null;
    const height = isValidDimension(videoItem.height) ? videoItem.height : null;
    const rawRatio = isValidDimension(videoItem.aspectRatio)
      ? videoItem.aspectRatio
      : width && height
        ? width / height
        : null;
    const normalizedRatio = rawRatio && rawRatio > 0 ? rawRatio : null;
    const orientation =
      normalizedRatio && normalizedRatio > 0
        ? normalizedRatio > 1.05
          ? "landscape"
          : normalizedRatio < 0.95
            ? "portrait"
            : "square"
        : null;
    return { aspectRatio: normalizedRatio, orientation };
  }, [videoItem.aspectRatio, videoItem.height, videoItem.width]);

  const containerStyle = React.useMemo<React.CSSProperties | undefined>(() => {
    if (!aspectRatio) return undefined;
    return {
      aspectRatio,
      minHeight:
        orientation === "portrait"
          ? "clamp(360px, 54vh, 820px)"
          : orientation === "landscape"
            ? "clamp(260px, 44vh, 620px)"
            : "clamp(300px, 50vh, 720px)",
      maxHeight:
        orientation === "portrait"
          ? "min(92vh, 1040px)"
          : orientation === "landscape"
            ? "min(82vh, 880px)"
            : "min(88vh, 960px)",
    };
  }, [aspectRatio, orientation]);

  const videoStyle = React.useMemo<React.CSSProperties | undefined>(() => {
    if (!aspectRatio) return undefined;
    return {
      objectFit: "contain",
      objectPosition: "center",
      width: "100%",
      height: "100%",
    };
  }, [aspectRatio]);

  React.useEffect(() => {
    const node = videoRef.current;
    if (!node) return undefined;

    const teardown = () => {
      const existing = hlsRef.current;
      if (existing) {
        existing.destroy();
        hlsRef.current = null;
      }
    };

    if (!isHlsSource || !videoUrl) {
      teardown();
      return undefined;
    }

    const nativeSupport =
      node.canPlayType("application/vnd.apple.mpegurl") ||
      node.canPlayType("application/x-mpegurl");
    if (nativeSupport === "probably" || nativeSupport === "maybe") {
      teardown();
      node.src = videoUrl;
      node.load();
      return () => {
        if (node.src === videoUrl) {
          node.removeAttribute("src");
          node.load();
        }
      };
    }

    teardown();
    let cancelled = false;

    (async () => {
      try {
        const mod = await import("hls.js");
        if (cancelled) return;
        const HlsConstructor = mod.default;
        if (!HlsConstructor || !HlsConstructor.isSupported()) {
          node.src = videoUrl;
          node.load();
          return;
        }
        const instance = new HlsConstructor({
          enableWorker: true,
          backBufferLength: 90,
        });
        hlsRef.current = instance;
        instance.attachMedia(node);
        instance.on(HlsConstructor.Events.MEDIA_ATTACHED, () => {
          if (!cancelled) {
            instance.loadSource(videoUrl);
          }
        });
        instance.on(HlsConstructor.Events.ERROR, (_event, data) => {
          if (!data || !data.fatal) return;
          if (data.type === HlsConstructor.ErrorTypes.NETWORK_ERROR) {
            instance.startLoad();
          } else if (data.type === HlsConstructor.ErrorTypes.MEDIA_ERROR) {
            instance.recoverMediaError();
          } else {
            instance.destroy();
            if (hlsRef.current === instance) {
              hlsRef.current = null;
            }
          }
        });
      } catch {
        if (!cancelled) {
          node.src = videoUrl;
          node.load();
        }
      }
    })();

    return () => {
      cancelled = true;
      teardown();
    };
  }, [isHlsSource, videoUrl]);

  const playVideo = React.useCallback(() => {
    const node = videoRef.current;
    if (!node) return;
    node.muted = true;
    const playAttempt = node.play();
    if (playAttempt && typeof playAttempt.catch === "function") {
      playAttempt.catch(() => {
        /* autoplay may be prevented on some browsers; ignore */
      });
    }
  }, []);

  const pauseVideo = React.useCallback((reset = false, force = false) => {
    const node = videoRef.current;
    if (!node) return;
    if (!force && userInteractedRef.current) return;
    node.pause();
    if (reset) {
      try {
        node.currentTime = 0;
      } catch {
        /* Safari may throw if the stream is not seekable yet */
      }
    }
    if (force) {
      userInteractedRef.current = false;
    }
    setIsPlaying(false);
  }, []);

  const handlePointerDown = React.useCallback(() => {
    userInteractedRef.current = true;
  }, []);

  React.useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const handleRemotePlay = (event: Event) => {
      const custom = event as CustomEvent<{ id?: string }>;
      const requester = custom.detail?.id ?? null;
      if (!requester || requester === videoId) return;
      pauseVideo(true, true);
    };
    window.addEventListener("feedvideo:play", handleRemotePlay as EventListener);
    return () => {
      window.removeEventListener("feedvideo:play", handleRemotePlay as EventListener);
    };
  }, [pauseVideo, videoId]);

  React.useEffect(() => {
    const container = containerRef.current;
    if (!container) return undefined;

    const observer = new IntersectionObserver(
      (entries) => {
        const [entry] = entries;
        if (!entry) return;
        if (!entry.isIntersecting) {
          pauseVideo(true, true);
          return;
        }
        if (entry.intersectionRatio >= 0.6) {
          playVideo();
        } else {
          pauseVideo(false);
        }
      },
      {
        threshold: [0, 0.3, 0.45, 0.6, 0.8],
      },
    );

    observer.observe(container);
    return () => {
      observer.disconnect();
    };
  }, [pauseVideo, playVideo]);

  const handlePlay = React.useCallback(() => {
    setIsPlaying(true);
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("feedvideo:play", { detail: { id: videoId } }));
    }
  }, [videoId]);

  const handlePause = React.useCallback(() => {
    setIsPlaying(false);
    userInteractedRef.current = false;
  }, []);

  return (
    <div
      ref={containerRef}
      className={styles.mediaWrapper}
      data-kind="video"
      data-orientation={orientation ?? undefined}
      data-playing={isPlaying ? "true" : undefined}
      onMouseEnter={playVideo}
      onFocus={playVideo}
      style={containerStyle}
    >
      <video
        ref={videoRef}
        className={styles.media}
        data-kind="video"
        data-hls={isHlsSource ? "true" : undefined}
        src={!isHlsSource ? videoUrl : undefined}
        controls
        playsInline
        preload="metadata"
        loop
        muted
        poster={poster ?? undefined}
        onPlay={handlePlay}
        onPause={handlePause}
        onEnded={() => pauseVideo(true, true)}
        onPointerDown={handlePointerDown}
        style={videoStyle}
      >
        {!isHlsSource ? (
          <source src={videoUrl} type={videoItem.mimeType ?? undefined} />
        ) : null}
        Your browser does not support the video tag.
      </video>
      <div
        className={styles.mediaVideoOverlay}
        data-hidden={isPlaying ? "true" : undefined}
        aria-hidden="true"
      >
        <Play className={styles.mediaVideoIcon} weight="fill" />
      </div>
    </div>
  );
}
