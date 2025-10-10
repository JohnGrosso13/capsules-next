"use client";

import React from "react";
import Image from "next/image";
import Link from "next/link";
import { CaretLeft, CaretRight, ImageSquare, Sparkle } from "@phosphor-icons/react/dist/ssr";

import { CapsulePromoTile } from "@/components/capsule/CapsulePromoTile";
import type { HomeFeedPost } from "@/hooks/useHomeFeed";
import { normalizePosts, resolvePostMediaUrl } from "@/hooks/useHomeFeed/utils";
import {
  resolveCapsuleHandle,
  resolveCapsuleHref,
  resolveCapsuleTileMedia,
} from "@/lib/capsules/promo-tile";
import { normalizeMediaUrl } from "@/lib/media";
import { resolveToAbsoluteUrl } from "@/lib/url";
import capsuleTileHostStyles from "@/components/capsule/capsule-tile-host.module.css";
import homeStyles from "./home.module.css";
import styles from "./promo-row.module.css";

type Post = { id: string; mediaUrl?: string | null; content?: string | null };
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
  { id: "media-1", mediaUrl: null },
  { id: "media-2", mediaUrl: null },
  { id: "media-3", mediaUrl: null },
  { id: "media-4", mediaUrl: null },
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
  mediaSrc: string | null;
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
        const posts: Post[] = filtered.map((record: HomeFeedPost) => ({
          id: record.id,
          mediaUrl: resolvePostMediaUrl(record),
          content: typeof record.content === "string" ? record.content : null,
        }));

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

  const lightboxItems = React.useMemo<PromoLightboxMediaItem[]>(
    () =>
      tileLayout
        .map((tile) => {
          if (tile.kind !== "media") return null;
          const post = context.media[tile.postIndex] ?? null;
          const rawMediaSrc = normalizeMediaUrl(post?.mediaUrl);
          const mediaSrc = resolveToAbsoluteUrl(rawMediaSrc);
          const content = typeof post?.content === "string" ? post.content.trim() : "";
          return {
            id: tile.id,
            mediaSrc,
            caption: content ? truncateText(content, 140) : null,
            fallbackIndex: tile.postIndex,
          };
        })
        .filter((item): item is PromoLightboxMediaItem => item !== null),
    [context.media, tileLayout],
  );

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
    activeLightboxIndex === null ? null : lightboxItems[activeLightboxIndex] ?? null;
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
          className={homeStyles.lightboxOverlay}
          role="dialog"
          aria-modal="true"
          aria-label={currentItem.caption ?? "Promo media viewer"}
          onClick={closeLightbox}
        >
          <div className={homeStyles.lightboxContent} onClick={(event) => event.stopPropagation()}>
            <button
              type="button"
              className={homeStyles.lightboxClose}
              onClick={closeLightbox}
              aria-label="Close promo media viewer"
            >
              {"\u00d7"}
            </button>
            {tileCount > 1 ? (
              <>
                <button
                  type="button"
                  className={`${homeStyles.lightboxNav} ${homeStyles.lightboxNavPrev}`.trim()}
                  onClick={() => navigateLightbox(-1)}
                  aria-label="Previous promo media"
                >
                  <CaretLeft size={28} weight="bold" />
                </button>
                <button
                  type="button"
                  className={`${homeStyles.lightboxNav} ${homeStyles.lightboxNavNext}`.trim()}
                  onClick={() => navigateLightbox(1)}
                  aria-label="Next promo media"
                >
                  <CaretRight size={28} weight="bold" />
                </button>
              </>
            ) : null}
            <div className={homeStyles.lightboxBody}>
              <div className={homeStyles.lightboxMedia}>
                {currentItem.mediaSrc ? (
                  <>
                    {/* eslint-disable-next-line @next/next/no-img-element -- preserve lightbox loading behaviour */}
                    <img
                      className={homeStyles.lightboxImage}
                      src={currentItem.mediaSrc}
                      alt={currentItem.caption ?? "Promo media"}
                      loading="eager"
                      draggable={false}
                    />
                  </>
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
              <div className={homeStyles.lightboxCaption}>{currentItem.caption}</div>
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
  const Icon =
    MEDIA_FALLBACK_ICONS[index % MEDIA_FALLBACK_ICONS.length] ?? ImageSquare;
  const rawMediaSrc = normalizeMediaUrl(post?.mediaUrl);
  const mediaSrc = resolveToAbsoluteUrl(rawMediaSrc);
  return (
    <div className={styles.short}>
      {mediaSrc ? (
        <Image
          src={mediaSrc}
          alt="Feed media"
          fill
          sizes="(max-width: 900px) 50vw, 25vw"
          className={styles.media}
          loading="lazy"
          unoptimized
        />
      ) : (
        <div className={styles.fallback}>
          <Icon className={styles.fallbackIcon} weight="duotone" />
        </div>
      )}
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
  const tileClass = capsuleTileHostStyles.tileHost;
  if (!capsule) {
    return (
      <div className={styles.capsuleTile}>
        <CapsulePromoTile
          name="Featured Capsule"
          className={tileClass}
          showSlug={false}
        />
      </div>
    );
  }

  const { bannerUrl, logoUrl } = resolveCapsuleTileMedia({
    promoTileUrl: capsule.promoTileUrl,
    bannerUrl: capsule.bannerUrl,
    coverUrl: capsule.cover,
    logoUrl: capsule.logoUrl,
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

  const href =
    resolveCapsuleHref(rawSlug, capsule.href ?? null);

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
