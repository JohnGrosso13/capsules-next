"use client";

import React from "react";
import Image from "next/image";
import Link from "next/link";
import { CaretLeft, CaretRight, ImageSquare, Play, Sparkle } from "@phosphor-icons/react/dist/ssr";

import { CapsulePromoTile } from "@/components/capsule/CapsulePromoTile";
import type { HomeFeedPost } from "@/hooks/useHomeFeed";
import { normalizePosts } from "@/hooks/useHomeFeed/utils";
import {
  resolveCapsuleHandle,
  resolveCapsuleHref,
  resolveCapsuleTileMedia,
} from "@/lib/capsules/promo-tile";
import { normalizeMediaUrl } from "@/lib/media";
import { resolveToAbsoluteUrl } from "@/lib/url";
import capsuleTileHostStyles from "@/components/capsule/capsule-tile-host.module.css";
import lightboxStyles from "@/components/home-feed.module.css";
import styles from "./promo-row.module.css";

type MediaKind = "image" | "video";

type Post = {
  id: string;
  mediaUrl?: string | null;
  mediaKind?: MediaKind | null;
  posterUrl?: string | null;
  mimeType?: string | null;
  content?: string | null;
};
type Friend = { name: string; avatar?: string | null };
type Capsule = {
  id?: string | null;
  name: string;
  slug?: string | null;
  href?: string | null;
  bannerUrl?: string | null;
  cover?: string | null;
  promoTileUrl?: string | null;
  logoUrl?: string | null;
  createdAt?: string | null;
};

const fallbackMedia: Post[] = [
  { id: "media-1", mediaUrl: null, mediaKind: null, posterUrl: null, mimeType: null },
  { id: "media-2", mediaUrl: null, mediaKind: null, posterUrl: null, mimeType: null },
  { id: "media-3", mediaUrl: null, mediaKind: null, posterUrl: null, mimeType: null },
  { id: "media-4", mediaUrl: null, mediaKind: null, posterUrl: null, mimeType: null },
];

const fallbackFriends: Friend[] = [
  { name: "Capsules Team" },
  { name: "Memory Bot" },
  { name: "Dream Studio" },
  { name: "Photo Walks" },
];

const fallbackCapsules: Capsule[] = [
  {
    id: "capsule-creators",
    name: "Creators Guild",
    slug: "creators-guild",
    href: "/capsule/creators-guild",
    cover: null,
  },
  {
    id: "capsule-indie",
    name: "Indie Devs",
    slug: "indie-devs",
    href: "/capsule/indie-devs",
    cover: null,
  },
  {
    id: "capsule-design",
    name: "Design Brush",
    slug: "design-brush",
    href: "/capsule/design-brush",
    cover: null,
  },
];

const VIDEO_EXTENSION_PATTERN = /\.(mp4|webm|mov|m4v|avi|ogv|ogg|mkv|3gp|3g2)(\?|#|$)/i;
const IMAGE_EXTENSION_PATTERN = /\.(png|jpe?g|gif|webp|avif|svg|heic|heif)(\?|#|$)/i;

function inferMediaKind(
  mimeType: string | null | undefined,
  ...sources: Array<string | null | undefined>
): MediaKind | null {
  const lowered = typeof mimeType === "string" ? mimeType.trim().toLowerCase() : "";
  if (lowered.startsWith("image/")) return "image";
  if (lowered.startsWith("video/")) return "video";

  for (const source of sources) {
    if (!source || typeof source !== "string") continue;
    const normalized = source.trim().toLowerCase();
    if (!normalized.length) continue;
    if (VIDEO_EXTENSION_PATTERN.test(normalized)) return "video";
    if (IMAGE_EXTENSION_PATTERN.test(normalized)) return "image";
  }

  return null;
}

function extractPostMedia(
  record: HomeFeedPost,
): { mediaUrl: string | null; mediaKind: MediaKind | null; posterUrl: string | null; mimeType: string | null } {
  const attachments = Array.isArray(record.attachments) ? record.attachments : [];

  for (const attachment of attachments) {
    if (!attachment || typeof attachment !== "object") continue;
    const url = normalizeMediaUrl(attachment.url) ?? null;
    if (!url) continue;
    const kind = inferMediaKind(
      attachment.mimeType ?? null,
      url,
      normalizeMediaUrl(attachment.thumbnailUrl),
      normalizeMediaUrl(attachment.variants?.feed),
      normalizeMediaUrl(attachment.variants?.thumb),
      normalizeMediaUrl(attachment.variants?.original),
    );
    if (!kind) continue;

    if (kind === "image") {
      const displayUrl =
        normalizeMediaUrl(attachment.variants?.feed) ??
        normalizeMediaUrl(attachment.variants?.full) ??
        url;
      const posterUrl =
        normalizeMediaUrl(attachment.variants?.thumb) ??
        normalizeMediaUrl(attachment.thumbnailUrl) ??
        displayUrl;
      return {
        mediaUrl: displayUrl ?? url,
        mediaKind: "image",
        posterUrl: posterUrl ?? null,
        mimeType: attachment.mimeType ?? null,
      };
    }

    if (kind === "video") {
      const mediaUrl =
        url ??
        normalizeMediaUrl(attachment.variants?.original) ??
        normalizeMediaUrl(attachment.variants?.feed);
      if (!mediaUrl) continue;
      const posterUrl =
        normalizeMediaUrl(attachment.thumbnailUrl) ??
        normalizeMediaUrl(attachment.variants?.thumb) ??
        null;
      return {
        mediaUrl,
        mediaKind: "video",
        posterUrl,
        mimeType: attachment.mimeType ?? null,
      };
    }
  }

  const fallbackUrl = normalizeMediaUrl(record.mediaUrl) ?? null;
  if (fallbackUrl) {
    const inferred = inferMediaKind(null, fallbackUrl);
    if (inferred) {
      return {
        mediaUrl: fallbackUrl,
        mediaKind: inferred,
        posterUrl: null,
        mimeType: null,
      };
    }
  }

  return {
    mediaUrl: null,
    mediaKind: null,
    posterUrl: null,
    mimeType: null,
  };
}

type TileConfig =
  | { id: string; kind: "media"; postIndex: number }
  | { id: string; kind: "friend"; friendIndex: number }
  | { id: string; kind: "capsule"; capsuleIndex: number };

type TileContext = {
  media: Post[];
  friends: Friend[];
  capsules: Capsule[];
};

type PromoLightboxMediaItem = {
  id: string;
  kind: MediaKind;
  mediaSrc: string;
  posterSrc: string | null;
  mimeType: string | null;
  caption: string | null;
  fallbackIndex: number;
};

const MEDIA_FALLBACK_ICONS = [ImageSquare, Sparkle];

function truncateText(value: string, maxLength = 96): string {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, Math.max(0, maxLength - 3))}...`;
}

function getTileLabel(tile: TileConfig, context: TileContext): string {
  switch (tile.kind) {
    case "media": {
      const post = context.media[tile.postIndex] ?? null;
      const content = typeof post?.content === "string" ? post.content.trim() : "";
      if (content) {
        return `Open promo media: ${truncateText(content, 80)}`;
      }
      return `Open promo media ${tile.postIndex + 1}`;
    }
    case "friend": {
      const names = context.friends
        .slice(0, 3)
        .map((friend) => friend.name)
        .filter(Boolean);
      if (names.length) {
        return `View featured friends: ${truncateText(names.join(", "), 80)}`;
      }
      return "View featured friends";
    }
    case "capsule": {
      const capsule = context.capsules[tile.capsuleIndex] ?? null;
      if (capsule?.name) {
        const handleValue = resolveCapsuleHandle(capsule.slug);
        const handle = handleValue ? ` (@${handleValue})` : "";
        return `Explore capsule ${truncateText(capsule.name, 60)}${handle}`;
      }
      return "Explore featured capsule";
    }
    default:
      return "Open promo tile";
  }
}

export function PromoRow() {
  const [mediaPosts, setMediaPosts] = React.useState<Post[]>([]);
  const [friends, setFriends] = React.useState<Friend[]>([]);
  const [capsules] = React.useState<Capsule[]>(fallbackCapsules);
  const [activeLightboxIndex, setActiveLightboxIndex] = React.useState<number | null>(null);

  React.useEffect(() => {
    let cancelled = false;

    const loadMedia = async () => {
      try {
        const response = await fetch("/api/posts?limit=24");
        const data = (await response.json().catch(() => null)) as {
          posts?: unknown[];
          deleted?: unknown[];
        } | null;
        const raw = Array.isArray(data?.posts) ? data.posts : [];
        const normalized = normalizePosts(raw);
        const deletedSet =
          Array.isArray(data?.deleted) && data.deleted.length
            ? new Set(
                data.deleted
                  .map((entry) => {
                    if (typeof entry === "string") {
                      const trimmed = entry.trim();
                      return trimmed.length ? trimmed : null;
                    }
                    if (typeof entry === "number" && Number.isFinite(entry)) {
                      return String(entry);
                    }
                    return null;
                  })
                  .filter((value): value is string => Boolean(value)),
              )
            : null;
        const filtered = deletedSet
          ? normalized.filter((record: HomeFeedPost) => {
              const id = typeof record.id === "string" ? record.id : String(record.id ?? "");
              const dbId = typeof record.dbId === "string" ? record.dbId : null;
              return !(id && deletedSet.has(id)) && !(dbId && deletedSet.has(dbId));
            })
          : normalized;
        const posts: Post[] = [];
        filtered.forEach((record: HomeFeedPost) => {
          const media = extractPostMedia(record);
          if (!media.mediaUrl || !media.mediaKind) {
            return;
          }
          posts.push({
            id: record.id,
            mediaUrl: media.mediaUrl,
            mediaKind: media.mediaKind,
            posterUrl: media.posterUrl,
            mimeType: media.mimeType,
            content: typeof record.content === "string" ? record.content : null,
          });
        });

        if (!cancelled) {
          setMediaPosts(posts);
        }
      } catch {
        if (!cancelled) {
          setMediaPosts([]);
        }
      }
    };

    const loadFriends = async () => {
      try {
        const response = await fetch("/api/friends/sync", { method: "POST" });
        const data = (await response.json().catch(() => null)) as { friends?: unknown[] } | null;
        const arr = Array.isArray(data?.friends) ? data.friends : [];
        const list: Friend[] = arr.map((entry) => {
          const friend = entry as Record<string, unknown>;
          const nameSource = friend.name ?? friend.userName ?? "Friend";
          const avatarSource =
            (friend.avatar as string | undefined) ??
            (friend.userAvatar as string | undefined) ??
            null;
          return {
            name: String(nameSource ?? "Friend"),
            avatar: normalizeMediaUrl(avatarSource),
          };
        });
        if (!cancelled) {
          setFriends(list);
        }
      } catch {
        if (!cancelled) {
          setFriends([]);
        }
      }
    };

    loadMedia();
    loadFriends();

    return () => {
      cancelled = true;
    };
  }, []);

  const resolvedMedia = React.useMemo(() => {
    const pool = mediaPosts.length ? mediaPosts : fallbackMedia;
    if (!pool.length) return fallbackMedia;
    const next: Post[] = [];
    for (let i = 0; i < 4; i += 1) {
      const post = (pool[i] ?? pool[i % pool.length] ?? fallbackMedia[i]) as Post;
      next.push(post);
    }
    return next;
  }, [mediaPosts]);

  const tileLayout = React.useMemo<TileConfig[]>(
    () => [
      { id: "promo-1", kind: "media", postIndex: 0 },
      { id: "promo-2", kind: "media", postIndex: 1 },
      { id: "promo-3", kind: "media", postIndex: 2 },
      { id: "promo-4", kind: "media", postIndex: 3 },
    ],
    [],
  );

  const context = React.useMemo<TileContext>(
    () => ({
      media: resolvedMedia,
      friends: friends.length ? friends : fallbackFriends,
      capsules: capsules.length ? capsules : fallbackCapsules,
    }),
    [resolvedMedia, friends, capsules],
  );

  const tileRecords = React.useMemo(
    () =>
      tileLayout.map((tile) => ({
        tile,
        label: getTileLabel(tile, context),
      })),
    [tileLayout, context],
  );

  const lightboxItems = React.useMemo<PromoLightboxMediaItem[]>(() => {
    const items: PromoLightboxMediaItem[] = [];
    tileLayout.forEach((tile) => {
      if (tile.kind !== "media") return;
      const post = context.media[tile.postIndex] ?? null;
      const mediaKind = post?.mediaKind ?? null;
      if (!mediaKind) return;
      const rawMediaSrc = normalizeMediaUrl(post?.mediaUrl);
      const mediaSrcCandidate =
        rawMediaSrc && typeof rawMediaSrc === "string"
          ? resolveToAbsoluteUrl(rawMediaSrc) ?? rawMediaSrc
          : null;
      if (!mediaSrcCandidate) return;
      const rawPoster = normalizeMediaUrl(post?.posterUrl);
      const posterSrc =
        rawPoster && typeof rawPoster === "string"
          ? resolveToAbsoluteUrl(rawPoster) ?? rawPoster
          : null;
      const content = typeof post?.content === "string" ? post.content.trim() : "";
      items.push({
        id: tile.id,
        kind: mediaKind,
        mediaSrc: mediaSrcCandidate,
        posterSrc,
        mimeType: post?.mimeType ?? null,
        caption: content ? truncateText(content, 140) : null,
        fallbackIndex: tile.postIndex,
      });
    });
    return items;
  }, [context.media, tileLayout]);

  const openLightbox = React.useCallback(
    (tileId: string) => {
      const index = lightboxItems.findIndex((item) => item.id === tileId);
      if (index >= 0) {
        setActiveLightboxIndex(index);
      }
    },
    [lightboxItems],
  );

  const closeLightbox = React.useCallback(() => {
    setActiveLightboxIndex(null);
  }, []);

  const tileCount = lightboxItems.length;

  const navigateLightbox = React.useCallback(
    (direction: number) => {
      if (tileCount === 0) return;
      setActiveLightboxIndex((previous) => {
        if (previous === null) return previous;
        const nextIndex = (previous + direction + tileCount) % tileCount;
        return nextIndex;
      });
    },
    [tileCount],
  );

  React.useEffect(() => {
    if (activeLightboxIndex === null) return;
    if (activeLightboxIndex >= tileCount) {
      setActiveLightboxIndex(tileCount ? Math.min(tileCount - 1, activeLightboxIndex) : null);
    }
  }, [activeLightboxIndex, tileCount]);

  React.useEffect(() => {
    if (activeLightboxIndex === null) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeLightbox();
      } else if ((event.key === "ArrowRight" || event.key === "ArrowDown") && tileCount > 1) {
        event.preventDefault();
        navigateLightbox(1);
      } else if ((event.key === "ArrowLeft" || event.key === "ArrowUp") && tileCount > 1) {
        event.preventDefault();
        navigateLightbox(-1);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [activeLightboxIndex, closeLightbox, navigateLightbox, tileCount]);

  const currentItem =
    activeLightboxIndex === null ? null : (lightboxItems[activeLightboxIndex] ?? null);
  const fallbackIconIndex = currentItem
    ? currentItem.fallbackIndex % MEDIA_FALLBACK_ICONS.length
    : 0;
  const FallbackIcon = MEDIA_FALLBACK_ICONS[fallbackIconIndex] ?? ImageSquare;

  return (
    <>
      <div className={styles.row}>
        {tileRecords.map(({ tile, label }) => {
          const isMedia = tile.kind === "media";
          const interactiveProps: React.HTMLAttributes<HTMLDivElement> = isMedia
            ? {
                role: "button",
                tabIndex: 0,
                onClick: () => openLightbox(tile.id),
                onKeyDown: (event: React.KeyboardEvent<HTMLDivElement>) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    openLightbox(tile.id);
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
        <div
          className={lightboxStyles.lightboxOverlay}
          role="dialog"
          aria-modal="true"
          aria-label={currentItem.caption ?? "Promo media viewer"}
          onClick={closeLightbox}
        >
          <div className={lightboxStyles.lightboxContent} onClick={(event) => event.stopPropagation()}>
            <button
              type="button"
              className={lightboxStyles.lightboxClose}
              onClick={closeLightbox}
              aria-label="Close promo media viewer"
            >
              {"\u00d7"}
            </button>
            {tileCount > 1 ? (
              <>
                  <button
                    type="button"
                    className={lightboxStyles.lightboxNav}
                    data-direction="prev"
                  onClick={() => navigateLightbox(-1)}
                  aria-label="Previous promo media"
                >
                  <CaretLeft size={28} weight="bold" />
                </button>
                  <button
                    type="button"
                    className={lightboxStyles.lightboxNav}
                    data-direction="next"
                  onClick={() => navigateLightbox(1)}
                  aria-label="Next promo media"
                >
                  <CaretRight size={28} weight="bold" />
                </button>
              </>
            ) : null}
            <div className={lightboxStyles.lightboxBody}>
              <div className={lightboxStyles.lightboxMedia}>
                {currentItem.mediaSrc ? (
                  currentItem.kind === "video" ? (
                    <video
                      className={lightboxStyles.lightboxVideo}
                      controls
                      playsInline
                      preload="auto"
                      poster={currentItem.posterSrc ?? undefined}
                    >
                      <source src={currentItem.mediaSrc} type={currentItem.mimeType ?? undefined} />
                      Your browser does not support embedded video.
                    </video>
                  ) : (
                    /* eslint-disable-next-line @next/next/no-img-element -- preserve lightbox loading behaviour */
                    <img
                      className={lightboxStyles.lightboxImage}
                      src={currentItem.mediaSrc}
                      alt={currentItem.caption ?? "Promo media"}
                      loading="eager"
                      draggable={false}
                    />
                  )
                ) : (
                  <div className={styles.lightboxFallback} aria-hidden="true">
                    <FallbackIcon
                      className={`${styles.fallbackIcon} ${styles.lightboxFallbackIcon}`}
                      weight="duotone"
                    />
                  </div>
                )}
              </div>
            </div>
            {currentItem.caption ? (
              <div className={lightboxStyles.lightboxCaption}>{currentItem.caption}</div>
            ) : null}
          </div>
        </div>
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

function FriendTile({ friends }: { friends: Friend[] }) {
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

function FriendAvatar({ friend }: { friend: Friend }) {
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

function CapsuleTile({ capsule }: { capsule: Capsule | null }) {
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

  const sanitizedPoster = poster && poster !== src ? poster : null;

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
      onMouseEnter={startPlayback}
      onMouseLeave={stopPlayback}
      onFocus={startPlayback}
      onBlur={stopPlayback}
      onClickCapture={stopPlayback}
    >
      <video
        ref={videoRef}
        className={styles.video}
        playsInline
        muted
        loop
        preload="metadata"
        poster={sanitizedPoster ?? undefined}
        onPlay={handlePlay}
        onPause={handlePause}
        onEnded={stopPlayback}
      >
        <source src={src} type={mimeType ?? undefined} />
      </video>
      <div className={styles.videoOverlay} aria-hidden="true">
        <Play className={styles.videoIcon} weight="fill" />
      </div>
    </div>
  );
}
