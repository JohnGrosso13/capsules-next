"use client";

import React from "react";
import Image from "next/image";
import Link from "next/link";
import { ImageSquare, Sparkle } from "@phosphor-icons/react/dist/ssr";

import type { HomeFeedPost } from "@/hooks/useHomeFeed";
import { normalizePosts, resolvePostMediaUrl } from "@/hooks/useHomeFeed/utils";
import { normalizeMediaUrl } from "@/lib/media";
import { resolveToAbsoluteUrl } from "@/lib/url";
import styles from "./promo-row.module.css";

type Post = { id: string; mediaUrl?: string | null; content?: string | null };
type Friend = { name: string; avatar?: string | null };
type Capsule = { name: string; slug?: string | null; cover?: string | null };

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
  { name: "Creators Guild", slug: "/capsule/creators-guild", cover: null },
  { name: "Indie Devs", slug: "/capsule/indie-devs", cover: null },
  { name: "Design Brush", slug: "/capsule/design-brush", cover: null },
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

export function PromoRow() {
  const [mediaPosts, setMediaPosts] = React.useState<Post[]>([]);
  const [friends, setFriends] = React.useState<Friend[]>([]);
  const [capsules] = React.useState<Capsule[]>(fallbackCapsules);

  React.useEffect(() => {
    let cancelled = false;

    const loadMedia = async () => {
      try {
        const response = await fetch("/api/posts?limit=24");
        const data = (await response.json().catch(() => null)) as { posts?: unknown[] } | null;
        const raw = Array.isArray(data?.posts) ? data.posts : [];
        const normalized = normalizePosts(raw);
        const posts: Post[] = normalized.map((record: HomeFeedPost) => ({
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

  const tileLayout: TileConfig[] = [
    { id: "promo-1", kind: "media", postIndex: 0 },
    { id: "promo-2", kind: "media", postIndex: 1 },
    { id: "promo-3", kind: "media", postIndex: 2 },
    { id: "promo-4", kind: "media", postIndex: 3 },
  ];

  const context: TileContext = {
    media: resolvedMedia,
    friends: friends.length ? friends : fallbackFriends,
    capsules: capsules.length ? capsules : fallbackCapsules,
  };

  return (
    <div className={styles.row}>
      {tileLayout.map((tile) => (
        <div key={tile.id} className={styles.tile} data-kind={tile.kind}>
          {renderTile(tile, context)}
        </div>
      ))}
    </div>
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
  const icons = [ImageSquare, Sparkle];
  const Icon = icons[index % icons.length] ?? ImageSquare;
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
  if (!capsule) {
    return (
      <div className={styles.short}>
        <div className={styles.fallback}>
          <Sparkle className={styles.fallbackIcon} weight="duotone" />
        </div>
      </div>
    );
  }

  const coverUrl = resolveToAbsoluteUrl(normalizeMediaUrl(capsule.cover));

  const body = (
    <>
      {coverUrl ? (
        <Image
          src={coverUrl}
          alt={capsule.name}
          fill
          sizes="(max-width: 900px) 50vw, 25vw"
          className={styles.media}
          loading="lazy"
          unoptimized
        />
      ) : (
        <div className={styles.fallback}>
          <Sparkle className={styles.fallbackIcon} weight="duotone" />
        </div>
      )}
      <div className={styles.overlay}>
        <span className={styles.overlayLabel}>{capsule.name}</span>
      </div>
    </>
  );

  if (capsule.slug) {
    return (
      <Link href={capsule.slug} className={styles.short} prefetch={false}>
        {body}
      </Link>
    );
  }

  return <div className={styles.short}>{body}</div>;
}
