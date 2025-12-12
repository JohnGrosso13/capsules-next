"use client";

import React from "react";
import type Hls from "hls.js";

import type { HomeFeedPost } from "@/hooks/useHomeFeed";
import { normalizePosts } from "@/hooks/useHomeFeed/utils";
import { resolveCapsuleHandle } from "@/lib/capsules/promo-tile";
import { normalizeMediaUrl, IMAGE_EXTENSION_PATTERN } from "@/lib/media";
import { resolveToAbsoluteUrl } from "@/lib/url";

export type MediaKind = "image" | "video";

export type Post = {
  id: string;
  mediaUrl?: string | null;
  mediaKind?: MediaKind | null;
  posterUrl?: string | null;
  mimeType?: string | null;
  content?: string | null;
};

export type Friend = { name: string; avatar?: string | null };

export type Capsule = {
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

export type TileConfig =
  | { id: string; kind: "media"; postIndex: number }
  | { id: string; kind: "friend"; friendIndex: number }
  | { id: string; kind: "capsule"; capsuleIndex: number };

export type TileContext = {
  media: Post[];
  friends: Friend[];
  capsules: Capsule[];
};

export type PromoLightboxMediaItem = {
  id: string;
  kind: MediaKind;
  mediaSrc: string;
  posterSrc: string | null;
  mimeType: string | null;
  caption: string | null;
  fallbackIndex: number;
  letterbox: boolean;
};

export type VideoPresentationState = {
  letterbox: boolean;
  rotation: "clockwise" | "counterclockwise" | null;
  handleLoadedMetadata: (event: React.SyntheticEvent<HTMLVideoElement>) => void;
};

export type VideoClassOptions = {
  letterbox?: string | undefined;
  rotateClockwise?: string | undefined;
  rotateCounterclockwise?: string | undefined;
};

export const fallbackMedia: Post[] = [
  { id: "media-1", mediaUrl: null, mediaKind: null, posterUrl: null, mimeType: null },
  { id: "media-2", mediaUrl: null, mediaKind: null, posterUrl: null, mimeType: null },
  { id: "media-3", mediaUrl: null, mediaKind: null, posterUrl: null, mimeType: null },
  { id: "media-4", mediaUrl: null, mediaKind: null, posterUrl: null, mimeType: null },
];

export const fallbackFriends: Friend[] = [
  { name: "Capsules Team" },
  { name: "Memory Bot" },
  { name: "Dream Studio" },
  { name: "Photo Walks" },
];

export const fallbackCapsules: Capsule[] = [
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

const HLS_MIME_HINTS = [
  "application/vnd.apple.mpegurl",
  "application/x-mpegurl",
  "application/mpegurl",
];

export function normalizeMediaPath(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  try {
    const base = typeof window !== "undefined" ? window.location.href : "http://localhost";
    const url = new URL(trimmed, base);
    return url.pathname.toLowerCase();
  } catch {
    const withoutHash = trimmed.split("#")[0] ?? trimmed;
    const withoutQuery = withoutHash.split("?")[0] ?? withoutHash;
    return withoutQuery.toLowerCase();
  }
}

export function shouldLetterboxMedia(
  mimeType: string | null | undefined,
  src: string | null | undefined,
): boolean {
  const mime = typeof mimeType === "string" ? mimeType.toLowerCase() : "";
  if (mime.includes("quicktime") || mime.includes("video/quicktime") || mime.includes("mov")) {
    return true;
  }
  if (typeof src === "string") {
    const lowered = src.toLowerCase();
    if (lowered.includes(".mov") || lowered.includes(".qt")) {
      return true;
    }
  }
  const path = normalizeMediaPath(src);
  if (!path) return false;
  return path.endsWith(".mov") || path.endsWith(".qt");
}

export function useVideoPresentation(
  ref: React.RefObject<HTMLVideoElement | null>,
  src: string | null | undefined,
  mimeType: string | null | undefined,
  options?: { presetLetterbox?: boolean; preferContainWhenMismatch?: boolean },
): VideoPresentationState {
  const { presetLetterbox, preferContainWhenMismatch = false } = options ?? {};
  const letterboxHint = React.useMemo(
    () => (typeof presetLetterbox === "boolean" ? presetLetterbox : shouldLetterboxMedia(mimeType, src)),
    [mimeType, presetLetterbox, src],
  );
  const [isSquare, setIsSquare] = React.useState(false);
  const [rotation, setRotation] = React.useState<"clockwise" | "counterclockwise" | null>(null);
  const [letterboxMismatch, setLetterboxMismatch] = React.useState(false);

  const updateFromNode = React.useCallback(
    (node: HTMLVideoElement | null) => {
      if (!node) return;
      const { videoWidth, videoHeight } = node;
      if (!videoWidth || !videoHeight) return;
      const ratio = videoWidth / videoHeight;
      if (!Number.isFinite(ratio)) return;
      const squareThreshold = 0.03;
      const square = Math.abs(ratio - 1) <= squareThreshold;
      setIsSquare(square);

      const rect = node.getBoundingClientRect();
      if (preferContainWhenMismatch && rect.width && rect.height) {
        const displayRatio = rect.width / rect.height;
        const ratioDelta = Math.abs(displayRatio - ratio);
        const mismatch = ratioDelta > 0.12;
        setLetterboxMismatch(mismatch);
      } else {
        setLetterboxMismatch(false);
      }

      if (letterboxHint) {
        const intrinsicLandscape = ratio >= 1;
        if (!rect.width || !rect.height) {
          setRotation(null);
        } else {
          const displayLandscape = rect.width >= rect.height;
          if (!square && intrinsicLandscape !== displayLandscape) {
            setRotation(intrinsicLandscape ? "clockwise" : "counterclockwise");
          } else {
            setRotation(null);
          }
        }
      } else {
        setRotation(null);
      }
    },
    [letterboxHint, preferContainWhenMismatch],
  );

  React.useEffect(() => {
    setIsSquare(false);
    setRotation(null);
    setLetterboxMismatch(false);
    updateFromNode(ref.current);
  }, [ref, src, letterboxHint, updateFromNode]);

  const handleLoadedMetadata = React.useCallback(
    (event: React.SyntheticEvent<HTMLVideoElement>) => {
      updateFromNode(event.currentTarget ?? null);
    },
    [updateFromNode],
  );

  return {
    letterbox: letterboxHint || isSquare || letterboxMismatch,
    rotation,
    handleLoadedMetadata,
  };
}

export function composeVideoClasses(
  baseClass: string | undefined,
  presentation: VideoPresentationState,
  options: VideoClassOptions,
): string {
  const classes = baseClass ? [baseClass] : [];
  if (presentation.letterbox && options.letterbox) {
    classes.push(options.letterbox);
  }
  if (presentation.rotation === "clockwise" && options.rotateClockwise) {
    classes.push(options.rotateClockwise);
  } else if (presentation.rotation === "counterclockwise" && options.rotateCounterclockwise) {
    classes.push(options.rotateCounterclockwise);
  }
  return classes.filter(Boolean).join(" ");
}

export function isHlsMimeType(value: string | null | undefined): boolean {
  if (typeof value !== "string") return false;
  const lowered = value.toLowerCase();
  return HLS_MIME_HINTS.some((pattern) => lowered.includes(pattern));
}

export function isHlsUrl(value: string | null | undefined): boolean {
  if (typeof value !== "string") return false;
  const trimmed = value.trim();
  if (!trimmed) return false;
  const lowered = trimmed.toLowerCase();
  if (lowered.includes(".m3u8")) return true;
  const withoutHash = lowered.split("#")[0] ?? lowered;
  const withoutQuery = withoutHash.split("?")[0] ?? withoutHash;
  if (withoutQuery.endsWith(".m3u8")) return true;
  try {
    const base = typeof window !== "undefined" ? window.location.href : "http://localhost";
    const url = new URL(trimmed, base);
    if (url.pathname.toLowerCase().includes(".m3u8")) return true;
    const formatParam = url.searchParams.get("format");
    if (formatParam && formatParam.toLowerCase() === "m3u8") return true;
  } catch {
    /* ignore malformed URLs */
  }
  return false;
}

export function looksLikeHlsSource(
  mimeType: string | null | undefined,
  url: string | null | undefined,
): boolean {
  return isHlsMimeType(mimeType) || isHlsUrl(url);
}

export function useHlsVideo(
  ref: React.RefObject<HTMLVideoElement | null>,
  src: string | null | undefined,
  mimeType: string | null | undefined,
): { isHlsSource: boolean } {
  const hlsRef = React.useRef<Hls | null>(null);
  const normalizedSrc = React.useMemo(() => {
    if (typeof src !== "string") return "";
    const trimmed = src.trim();
    return trimmed.length ? trimmed : "";
  }, [src]);
  const isHlsSource = React.useMemo(
    () => (normalizedSrc ? looksLikeHlsSource(mimeType ?? null, normalizedSrc) : false),
    [mimeType, normalizedSrc],
  );

  React.useEffect(() => {
    const node = ref.current;
    if (!node) return undefined;

    const teardown = () => {
      const existing = hlsRef.current;
      if (existing) {
        existing.destroy();
        hlsRef.current = null;
      }
    };

    if (!normalizedSrc) {
      teardown();
      return undefined;
    }

    if (!isHlsSource) {
      teardown();
      return undefined;
    }

    const nativeSupport =
      node.canPlayType("application/vnd.apple.mpegurl") ||
      node.canPlayType("application/x-mpegurl");
    if (nativeSupport === "probably" || nativeSupport === "maybe") {
      teardown();
      node.src = normalizedSrc;
      node.load();
      return () => {
        if (node.src === normalizedSrc) {
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
        const HlsCtor = mod.default;
        if (!HlsCtor || !HlsCtor.isSupported()) {
          node.src = normalizedSrc;
          node.load();
          return;
        }
        const instance = new HlsCtor({
          enableWorker: true,
          backBufferLength: 90,
        });
        hlsRef.current = instance;
        instance.attachMedia(node);
        instance.on(HlsCtor.Events.MEDIA_ATTACHED, () => {
          if (!cancelled) {
            instance.loadSource(normalizedSrc);
          }
        });
        instance.on(HlsCtor.Events.ERROR, (_event, data) => {
          if (!data || !data.fatal) return;
          if (data.type === HlsCtor.ErrorTypes.NETWORK_ERROR) {
            instance.startLoad();
          } else if (data.type === HlsCtor.ErrorTypes.MEDIA_ERROR) {
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
          node.src = normalizedSrc;
          node.load();
        }
      }
    })();

    return () => {
      cancelled = true;
      teardown();
    };
  }, [isHlsSource, normalizedSrc, ref]);

  React.useEffect(
    () => () => {
      const existing = hlsRef.current;
      if (existing) {
        existing.destroy();
        hlsRef.current = null;
      }
    },
    [],
  );

  return { isHlsSource };
}

export function inferMediaKind(
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

export function extractPostMedia(
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
      normalizeMediaUrl(attachment.variants?.promo),
      normalizeMediaUrl(attachment.variants?.feed),
      normalizeMediaUrl(attachment.variants?.thumb),
      normalizeMediaUrl(attachment.variants?.original),
    );
    if (!kind) continue;

    if (kind === "image") {
      const displayUrl =
        normalizeMediaUrl(attachment.variants?.promo) ??
        normalizeMediaUrl(attachment.variants?.feed) ??
        normalizeMediaUrl(attachment.variants?.full) ??
        url;
      const posterUrl =
        normalizeMediaUrl(attachment.variants?.thumb) ??
        normalizeMediaUrl(attachment.thumbnailUrl) ??
        normalizeMediaUrl(attachment.variants?.promo) ??
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
        normalizeMediaUrl(attachment.variants?.promo) ??
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

export function truncateText(value: string, maxLength = 96): string {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, Math.max(0, maxLength - 3))}...`;
}

export function formatTimestamp(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return "0:00";
  const clamped = Math.max(0, value);
  const minutes = Math.floor(clamped / 60);
  const seconds = Math.floor(clamped % 60);
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

export function getTileLabel(tile: TileConfig, context: TileContext): string {
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

export function usePromoRowData() {
  const [mediaPosts, setMediaPosts] = React.useState<Post[]>([]);
  const [friends, setFriends] = React.useState<Friend[]>([]);
  const [mediaLoading, setMediaLoading] = React.useState(true);
  const [friendsLoading, setFriendsLoading] = React.useState(true);

  React.useEffect(() => {
    let cancelled = false;

    const loadMedia = async () => {
      setMediaLoading(true);
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
      } finally {
        if (!cancelled) {
          setMediaLoading(false);
        }
      }
    };

    const loadFriends = async () => {
      setFriendsLoading(true);
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
      } finally {
        if (!cancelled) {
          setFriendsLoading(false);
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
      capsules: fallbackCapsules,
    }),
    [resolvedMedia, friends],
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
        letterbox: shouldLetterboxMedia(post?.mimeType ?? null, mediaSrcCandidate),
      });
    });
    return items;
  }, [context.media, tileLayout]);

  const imageLightboxItems = React.useMemo(
    () => lightboxItems.filter((item) => item.kind === "image"),
    [lightboxItems],
  );

  const videoLightboxItems = React.useMemo(
    () => lightboxItems.filter((item) => item.kind === "video"),
    [lightboxItems],
  );

  const imageIndexLookup = React.useMemo(() => {
    const lookup = new Map<string, number>();
    imageLightboxItems.forEach((item, index) => {
      lookup.set(item.id, index);
    });
    return lookup;
  }, [imageLightboxItems]);

  const videoIndexLookup = React.useMemo(() => {
    const lookup = new Map<string, number>();
    videoLightboxItems.forEach((item, index) => {
      lookup.set(item.id, index);
    });
    return lookup;
  }, [videoLightboxItems]);

  const mediaLookup = React.useMemo(() => {
    const lookup = new Map<string, PromoLightboxMediaItem>();
    lightboxItems.forEach((item) => {
      lookup.set(item.id, item);
    });
    return lookup;
  }, [lightboxItems]);

  return {
    context,
    tileRecords,
    tileLayout,
    lightboxItems,
    imageLightboxItems,
    videoLightboxItems,
    imageIndexLookup,
    videoIndexLookup,
    mediaLookup,
    loading: mediaLoading || friendsLoading,
  };
}
