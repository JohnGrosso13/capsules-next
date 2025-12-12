"use client";

import React from "react";
import dynamic from "next/dynamic";
import Image from "next/image";
import Link from "next/link";
import { ImageSquare, Play, Sparkle } from "@phosphor-icons/react/dist/ssr";

import { CapsulePromoTile } from "@/components/capsule/CapsulePromoTile";
import { useHomeLoading } from "@/components/home-loading";
import {
  resolveCapsuleHandle,
  resolveCapsuleHref,
  resolveCapsuleTileMedia,
} from "@/lib/capsules/promo-tile";
import { normalizeMediaUrl } from "@/lib/media";
import { resolveToAbsoluteUrl } from "@/lib/url";
import capsuleTileHostStyles from "@/components/capsule/capsule-tile-host.module.css";
import styles from "./promo-row.module.css";
import {
  composeVideoClasses,
  useHlsVideo,
  usePromoRowData,
  useVideoPresentation,
} from "./promo-row/media-transport";
import type { Post, TileConfig, TileContext } from "./promo-row/media-transport";
import type { PromoLightboxProps } from "./promo-row/lightbox";
import type { PromoVideoOverlayProps } from "./promo-row/video-overlay";

const MEDIA_FALLBACK_ICONS = [ImageSquare, Sparkle];

const PromoLightbox = dynamic<PromoLightboxProps>(
  () => import("./promo-row/lightbox").then((mod) => mod.PromoLightbox),
  { ssr: false, loading: () => null },
);

const PromoVideoOverlay = dynamic<PromoVideoOverlayProps>(
  () => import("./promo-row/video-overlay").then((mod) => mod.PromoVideoOverlay),
  { ssr: false, loading: () => null },
);

export function PromoRow() {
  const {
    context,
    tileRecords,
    imageLightboxItems,
    videoLightboxItems,
    imageIndexLookup,
    videoIndexLookup,
    mediaLookup,
    loading,
  } = usePromoRowData();
  const homeLoading = useHomeLoading();
  const homePending = homeLoading?.isPending ?? false;

  React.useEffect(() => {
    if (!homeLoading) return;
    if (!loading) {
      homeLoading.markReady("promos");
    }
  }, [homeLoading, loading]);

  const showSkeleton = loading || homePending;
  const [activeLightboxIndex, setActiveLightboxIndex] = React.useState<number | null>(null);
  const [activeVideoIndex, setActiveVideoIndex] = React.useState<number | null>(null);

  const openMediaViewer = React.useCallback(
    (tileId: string) => {
      const item = mediaLookup.get(tileId);
      if (!item) return;
      if (item.kind === "video") {
        const videoIndex = videoIndexLookup.get(tileId);
        if (videoIndex === undefined) return;
        setActiveVideoIndex(videoIndex);
        setActiveLightboxIndex(null);
        return;
      }
      const imageIndex = imageIndexLookup.get(tileId);
      if (imageIndex === undefined) return;
      setActiveVideoIndex(null);
      setActiveLightboxIndex(imageIndex);
    },
    [imageIndexLookup, mediaLookup, videoIndexLookup],
  );

  const closeLightbox = React.useCallback(() => {
    setActiveLightboxIndex(null);
  }, []);

  const closeVideoOverlay = React.useCallback(() => {
    setActiveVideoIndex(null);
  }, []);

  const imageCount = imageLightboxItems.length;
  const videoCount = videoLightboxItems.length;

  const navigateLightbox = React.useCallback(
    (direction: number) => {
      if (imageCount === 0) return;
      setActiveLightboxIndex((previous) => {
        if (previous === null) return previous;
        const nextIndex = (previous + direction + imageCount) % imageCount;
        return nextIndex;
      });
    },
    [imageCount],
  );

  const navigateVideoOverlay = React.useCallback(
    (direction: number) => {
      if (videoCount === 0) return;
      setActiveVideoIndex((previous) => {
        if (previous === null) return previous;
        const nextIndex = (previous + direction + videoCount) % videoCount;
        return nextIndex;
      });
    },
    [videoCount],
  );

  React.useEffect(() => {
    if (activeLightboxIndex === null) return;
    if (activeLightboxIndex >= imageCount) {
      setActiveLightboxIndex(imageCount ? Math.min(imageCount - 1, activeLightboxIndex) : null);
    }
  }, [activeLightboxIndex, imageCount]);

  React.useEffect(() => {
    if (activeVideoIndex === null) return;
    if (activeVideoIndex >= videoCount) {
    setActiveVideoIndex(videoCount ? Math.min(videoCount - 1, activeVideoIndex) : null);
    }
  }, [activeVideoIndex, videoCount]);

  React.useEffect(() => {
    if (activeLightboxIndex === null && activeVideoIndex === null) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        if (activeVideoIndex !== null) {
          closeVideoOverlay();
        } else {
          closeLightbox();
        }
      } else if (
        activeLightboxIndex !== null &&
        (event.key === "ArrowRight" || event.key === "ArrowDown") &&
        imageCount > 1
      ) {
        event.preventDefault();
        navigateLightbox(1);
      } else if (
        activeLightboxIndex !== null &&
        (event.key === "ArrowLeft" || event.key === "ArrowUp") &&
        imageCount > 1
      ) {
        event.preventDefault();
        navigateLightbox(-1);
      } else if (
        activeVideoIndex !== null &&
        (event.key === "ArrowRight" || event.key === "ArrowDown") &&
        videoCount > 1
      ) {
        event.preventDefault();
        navigateVideoOverlay(1);
      } else if (
        activeVideoIndex !== null &&
        (event.key === "ArrowLeft" || event.key === "ArrowUp") &&
        videoCount > 1
      ) {
        event.preventDefault();
        navigateVideoOverlay(-1);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    activeLightboxIndex,
    activeVideoIndex,
    closeLightbox,
    closeVideoOverlay,
    imageCount,
    navigateLightbox,
    navigateVideoOverlay,
    videoCount,
  ]);

  const currentItem =
    activeLightboxIndex === null ? null : (imageLightboxItems[activeLightboxIndex] ?? null);
  const activeVideoItem =
    activeVideoIndex === null ? null : (videoLightboxItems[activeVideoIndex] ?? null);

  const fallbackIconIndex = currentItem
    ? currentItem.fallbackIndex % MEDIA_FALLBACK_ICONS.length
    : 0;
  const FallbackIcon = MEDIA_FALLBACK_ICONS[fallbackIconIndex] ?? ImageSquare;

  if (showSkeleton) {
    return (
      <div className={styles.row} data-skeleton="true" aria-busy="true" aria-live="polite">
        {Array.from({ length: 4 }).map((_, index) => (
          <div
            key={`promo-skeleton-${index}`}
            className={`${styles.tile} ${styles.skeletonTile}`.trim()}
            aria-hidden="true"
          >
            <span className={styles.skeletonBlock} />
          </div>
        ))}
      </div>
    );
  }

  return (
    <>
      <div className={styles.row}>
        {tileRecords.map(({ tile, label }) => {
          const isMedia = tile.kind === "media";
          const interactiveProps: React.HTMLAttributes<HTMLDivElement> = isMedia
            ? {
                role: "button",
                tabIndex: 0,
                onClick: () => openMediaViewer(tile.id),
                onKeyDown: (event: React.KeyboardEvent<HTMLDivElement>) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    openMediaViewer(tile.id);
                  }
                },
                "aria-label": label,
              }
            : {};
          return (
            <div
              key={tile.id}
              className={styles.tile}
              data-kind={tile.kind}
              data-interactive={isMedia ? "true" : undefined}
              {...interactiveProps}
            >
              {renderTile(tile, context)}
            </div>
          );
        })}
      </div>
      {currentItem ? (
        <PromoLightbox
          currentItem={currentItem}
          imageCount={imageCount}
          onNavigate={navigateLightbox}
          onClose={closeLightbox}
          FallbackIcon={FallbackIcon}
        />
      ) : null}
      {activeVideoItem ? (
        <PromoVideoOverlay
          items={videoLightboxItems}
          activeIndex={activeVideoIndex}
          onClose={closeVideoOverlay}
          onNavigate={navigateVideoOverlay}
        />
      ) : null}
    </>
  );
}

function renderTile(tile: TileConfig, context: TileContext) {
  switch (tile.kind) {
    case "media":
      return <MediaTile post={context.media[tile.postIndex] ?? null} index={tile.postIndex} />;
    case "friend":
      return <FriendTile friends={context.friends} />;
    case "capsule":
      return <CapsuleTile capsule={context.capsules[tile.capsuleIndex] ?? null} />;
    default:
      return null;
  }
}

function MediaTile({ post, index }: { post: Post | null; index: number }) {
  const Icon = MEDIA_FALLBACK_ICONS[index % MEDIA_FALLBACK_ICONS.length] ?? ImageSquare;
  const mediaKind = post?.mediaKind ?? null;
  const normalizedMedia = normalizeMediaUrl(post?.mediaUrl);
  const mediaSrc =
    normalizedMedia && typeof normalizedMedia === "string"
      ? resolveToAbsoluteUrl(normalizedMedia) ?? normalizedMedia
      : null;

  if (mediaSrc && mediaKind === "video") {
    const normalizedPoster = normalizeMediaUrl(post?.posterUrl);
    const posterSrc =
      normalizedPoster && typeof normalizedPoster === "string"
        ? resolveToAbsoluteUrl(normalizedPoster) ?? normalizedPoster
        : null;
    return (
      <PromoVideoTile src={mediaSrc} poster={posterSrc} mimeType={post?.mimeType ?? null} />
    );
  }

  if (mediaSrc && mediaKind === "image") {
    return (
      <div className={styles.short} data-kind="image">
        <Image
          src={mediaSrc}
          alt="Feed media"
          fill
          sizes="(max-width: 900px) 50vw, 25vw"
          className={styles.media}
          loading="lazy"
          unoptimized
        />
      </div>
    );
  }

  return (
    <div className={styles.short}>
      <div className={styles.fallback}>
        <Icon className={styles.fallbackIcon} weight="duotone" />
      </div>
    </div>
  );
}

function FriendTile({ friends }: { friends: TileContext["friends"] }) {
  const picks = friends.slice(0, 3);
  return (
    <div className={styles.short}>
      <div className={styles.avatars}>
        {picks.map((friend, index) => (
          <FriendAvatar key={`${friend.name}-${index}`} friend={friend} />
        ))}
      </div>
    </div>
  );
}

function FriendAvatar({ friend }: { friend: TileContext["friends"][number] }) {
  const avatarUrl = resolveToAbsoluteUrl(normalizeMediaUrl(friend.avatar));
  if (avatarUrl) {
    return (
      <Image
        src={avatarUrl}
        alt={friend.name}
        width={96}
        height={96}
        className={styles.avatarImage}
        loading="lazy"
        unoptimized
      />
    );
  }
  return <span className={styles.avatar} title={friend.name} />;
}

function CapsuleTile({ capsule }: { capsule: TileContext["capsules"][number] | null }) {
  const tileClass = capsuleTileHostStyles.tileHost ?? "";
  if (!capsule) {
    return (
      <div className={styles.capsuleTile}>
        <CapsulePromoTile name="Featured Capsule" className={tileClass} showSlug={false} />
      </div>
    );
  }

  const { bannerUrl, logoUrl } = resolveCapsuleTileMedia({
    promoTileUrl: capsule.promoTileUrl ?? null,
    bannerUrl: capsule.bannerUrl ?? null,
    coverUrl: capsule.cover ?? null,
    logoUrl: capsule.logoUrl ?? null,
  });
  const rawSlug = capsule.slug ?? null;
  const slugHandle = resolveCapsuleHandle(rawSlug);

  const tile = (
    <CapsulePromoTile
      name={capsule.name}
      slug={slugHandle}
      bannerUrl={bannerUrl}
      logoUrl={logoUrl}
      className={tileClass}
      showSlug={false}
    />
  );

  const href = resolveCapsuleHref(rawSlug, capsule.href ?? null);

  if (href) {
    return (
      <Link
        href={href}
        className={styles.capsuleTile}
        prefetch={false}
        aria-label={`Open capsule ${capsule.name}`}
      >
        {tile}
      </Link>
    );
  }

  return <div className={styles.capsuleTile}>{tile}</div>;
}

type PromoVideoTileProps = {
  src: string;
  poster: string | null;
  mimeType: string | null;
};

function PromoVideoTile({ src, poster, mimeType }: PromoVideoTileProps) {
  const videoRef = React.useRef<HTMLVideoElement | null>(null);
  const [isPlaying, setIsPlaying] = React.useState(false);
  const { isHlsSource } = useHlsVideo(videoRef, src, mimeType);
  const sanitizedPoster = poster && poster !== src ? poster : null;
  const presentation = useVideoPresentation(videoRef, src, mimeType, {
    preferContainWhenMismatch: true,
  });

  const startPlayback = React.useCallback(() => {
    const node = videoRef.current;
    if (!node) return;
    node.muted = true;
    const attempt = node.play();
    if (attempt && typeof attempt.catch === "function") {
      attempt.catch(() => {
        /* silently ignore autoplay restrictions */
      });
    }
  }, []);

  const stopPlayback = React.useCallback(() => {
    const node = videoRef.current;
    if (!node) return;
    node.pause();
    try {
      node.currentTime = 0;
    } catch {
      /* ignore seek failures */
    }
    setIsPlaying(false);
  }, []);

  const handlePlay = React.useCallback(() => {
    setIsPlaying(true);
  }, []);

  const handlePause = React.useCallback(() => {
    setIsPlaying(false);
  }, []);

  return (
    <div
      className={styles.short}
      data-kind="video"
      data-playing={isPlaying ? "true" : undefined}
      data-letterbox={presentation.letterbox ? "true" : undefined}
      onMouseEnter={startPlayback}
      onMouseLeave={stopPlayback}
      onFocus={startPlayback}
      onBlur={stopPlayback}
      onClickCapture={stopPlayback}
    >
      <video
        ref={videoRef}
        className={composeVideoClasses(styles.video, presentation, {
          letterbox: styles.videoLetterbox,
          rotateClockwise: styles.videoRotateFullscreenClockwise,
          rotateCounterclockwise: styles.videoRotateFullscreenCounterclockwise,
        })}
        data-letterbox={presentation.letterbox ? "true" : undefined}
        data-hls={isHlsSource ? "true" : undefined}
        src={!isHlsSource ? src : undefined}
        playsInline
        muted
        loop
        preload="metadata"
        poster={sanitizedPoster ?? undefined}
        onLoadedMetadata={presentation.handleLoadedMetadata}
        onPlay={handlePlay}
        onPause={handlePause}
        onEnded={stopPlayback}
      >
        {!isHlsSource ? <source src={src} type={mimeType ?? undefined} /> : null}
      </video>
      <div className={styles.videoOverlay} aria-hidden="true">
        <Play className={styles.videoIcon} weight="fill" />
      </div>
    </div>
  );
}
