"use client";

import React from "react";
import Image from "next/image";
import Link from "next/link";
import {
  CaretLeft,
  CaretRight,
  ImageSquare,
  Pause,
  Play,
  SpeakerHigh,
  SpeakerSlash,
  Sparkle,
  X,
} from "@phosphor-icons/react/dist/ssr";
import type Hls from "hls.js";

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

const HLS_MIME_HINTS = [
  "application/vnd.apple.mpegurl",
  "application/x-mpegurl",
  "application/mpegurl",
];

function normalizeMediaPath(value: string | null | undefined): string | null {
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

function shouldLetterboxMedia(
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

type VideoPresentationState = {
  letterbox: boolean;
  rotation: "clockwise" | "counterclockwise" | null;
  handleLoadedMetadata: (event: React.SyntheticEvent<HTMLVideoElement>) => void;
};

function useVideoPresentation(
  ref: React.RefObject<HTMLVideoElement | null>,
  src: string | null | undefined,
  mimeType: string | null | undefined,
  presetLetterbox?: boolean,
): VideoPresentationState {
  const letterboxHint = React.useMemo(
    () => (typeof presetLetterbox === "boolean" ? presetLetterbox : shouldLetterboxMedia(mimeType, src)),
    [mimeType, presetLetterbox, src],
  );
  const [isSquare, setIsSquare] = React.useState(false);
  const [rotation, setRotation] = React.useState<"clockwise" | "counterclockwise" | null>(null);

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

      if (letterboxHint) {
        const intrinsicLandscape = ratio >= 1;
        const rect = node.getBoundingClientRect();
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
    [letterboxHint],
  );

  React.useEffect(() => {
    setIsSquare(false);
    setRotation(null);
    updateFromNode(ref.current);
  }, [ref, src, letterboxHint, updateFromNode]);

  const handleLoadedMetadata = React.useCallback(
    (event: React.SyntheticEvent<HTMLVideoElement>) => {
      updateFromNode(event.currentTarget ?? null);
    },
    [updateFromNode],
  );

  return {
    letterbox: letterboxHint || isSquare,
    rotation,
    handleLoadedMetadata,
  };
}

function composeVideoClasses(
  baseClass: string | undefined,
  presentation: VideoPresentationState,
): string {
  const classes = baseClass ? [baseClass] : [];
  if (presentation.letterbox && styles.videoLetterbox) {
    classes.push(styles.videoLetterbox);
  }
  if (presentation.rotation === "clockwise" && styles.videoRotateFullscreenClockwise) {
    classes.push(styles.videoRotateFullscreenClockwise);
  } else if (
    presentation.rotation === "counterclockwise" &&
    styles.videoRotateFullscreenCounterclockwise
  ) {
    classes.push(styles.videoRotateFullscreenCounterclockwise);
  }
  return classes.filter(Boolean).join(" ");
}
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

function looksLikeHlsSource(
  mimeType: string | null | undefined,
  url: string | null | undefined,
): boolean {
  return isHlsMimeType(mimeType) || isHlsUrl(url);
}

function useHlsVideo(
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
  letterbox: boolean;
};

const MEDIA_FALLBACK_ICONS = [ImageSquare, Sparkle];

function truncateText(value: string, maxLength = 96): string {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, Math.max(0, maxLength - 3))}...`;
}

function formatTimestamp(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return "0:00";
  const clamped = Math.max(0, value);
  const minutes = Math.floor(clamped / 60);
  const seconds = Math.floor(clamped % 60);
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
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
  const [activeVideoIndex, setActiveVideoIndex] = React.useState<number | null>(null);
  const [isOverlayPlaying, setIsOverlayPlaying] = React.useState(false);
  const [isOverlayMuted, setIsOverlayMuted] = React.useState(false);
  const [overlayProgress, setOverlayProgress] = React.useState({ current: 0, duration: 0 });
  const [hasOverlayEnded, setHasOverlayEnded] = React.useState(false);
  const lightboxVideoRef = React.useRef<HTMLVideoElement | null>(null);
  const videoViewerRef = React.useRef<HTMLVideoElement | null>(null);

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
    const node = videoViewerRef.current;
    if (node) {
      node.pause();
    }
    setIsOverlayPlaying(false);
    setHasOverlayEnded(false);
    setOverlayProgress({ current: 0, duration: 0 });
    setIsOverlayMuted(false);
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
  const { isHlsSource: isLightboxHls } = useHlsVideo(
    lightboxVideoRef,
    currentItem && currentItem.kind === "video" ? currentItem.mediaSrc ?? null : null,
    currentItem && currentItem.kind === "video" ? currentItem.mimeType ?? null : null,
  );
  const lightboxPresentation = useVideoPresentation(
    lightboxVideoRef,
    currentItem && currentItem.kind === "video" ? currentItem.mediaSrc ?? null : null,
    currentItem && currentItem.kind === "video" ? currentItem.mimeType ?? null : null,
    currentItem?.letterbox,
  );
  const activeVideoItem =
    activeVideoIndex === null ? null : (videoLightboxItems[activeVideoIndex] ?? null);
  const { isHlsSource: isOverlayHls } = useHlsVideo(
    videoViewerRef,
    activeVideoItem?.mediaSrc ?? null,
    activeVideoItem?.mimeType ?? null,
  );
  const overlayPresentation = useVideoPresentation(
    videoViewerRef,
    activeVideoItem?.mediaSrc ?? null,
    activeVideoItem?.mimeType ?? null,
    activeVideoItem?.letterbox,
  );
  React.useEffect(() => {
    if (activeVideoItem) return;
    setIsOverlayPlaying(false);
    setHasOverlayEnded(false);
    setOverlayProgress({ current: 0, duration: 0 });
    setIsOverlayMuted(false);
  }, [activeVideoItem]);

  React.useEffect(() => {
    const node = videoViewerRef.current;
    if (!node || !activeVideoItem) return;
    setHasOverlayEnded(false);
    setOverlayProgress({
      current: node.currentTime,
      duration: Number.isFinite(node.duration) ? node.duration : 0,
    });
    const attemptPlay = async () => {
      try {
        const playPromise = node.play();
        if (playPromise && typeof playPromise.then === "function") {
          await playPromise;
        }
        setIsOverlayPlaying(!node.paused);
      } catch {
        setIsOverlayPlaying(false);
      }
    };
    void attemptPlay();
    return () => {
      node.pause();
    };
  }, [activeVideoItem]);

  React.useEffect(() => {
    const node = videoViewerRef.current;
    if (!node) return;
    node.muted = isOverlayMuted;
  }, [isOverlayMuted]);

  const handleOverlayLoadedMetadata = React.useCallback(
    (event: React.SyntheticEvent<HTMLVideoElement>) => {
      overlayPresentation.handleLoadedMetadata(event);
      const target = event.currentTarget;
      setOverlayProgress({
        current: target.currentTime,
        duration: Number.isFinite(target.duration) ? target.duration : 0,
      });
    },
    [overlayPresentation],
  );

  const handleOverlayTimeUpdate = React.useCallback(
    (event: React.SyntheticEvent<HTMLVideoElement>) => {
      const target = event.currentTarget;
      setOverlayProgress({
        current: target.currentTime,
        duration: Number.isFinite(target.duration) ? target.duration : 0,
      });
    },
    [],
  );

  const handleOverlayPlay = React.useCallback(() => {
    setHasOverlayEnded(false);
    setIsOverlayPlaying(true);
  }, []);

  const handleOverlayPause = React.useCallback(() => {
    setIsOverlayPlaying(false);
  }, []);

  const handleOverlayEnded = React.useCallback(() => {
    setHasOverlayEnded(true);
    setIsOverlayPlaying(false);
    if (videoCount > 1) {
      navigateVideoOverlay(1);
    }
  }, [navigateVideoOverlay, videoCount]);

  const handleOverlayVolumeChange = React.useCallback(
    (event: React.SyntheticEvent<HTMLVideoElement>) => {
      setIsOverlayMuted(event.currentTarget.muted);
    },
    [],
  );

  const handleOverlayTogglePlay = React.useCallback(() => {
    const node = videoViewerRef.current;
    if (!node) return;
    if (node.paused || node.ended) {
      if (node.ended) {
        node.currentTime = 0;
      }
      const playPromise = node.play();
      if (playPromise && typeof playPromise.catch === "function") {
        playPromise.catch(() => {
          setIsOverlayPlaying(false);
        });
      }
    } else {
      node.pause();
    }
  }, []);

  const handleOverlayToggleMute = React.useCallback(() => {
    const node = videoViewerRef.current;
    if (!node) return;
    const nextMuted = !node.muted;
    node.muted = nextMuted;
    setIsOverlayMuted(nextMuted);
  }, []);

  const handleOverlayScrub = React.useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const node = videoViewerRef.current;
    if (!node) return;
    const value = Number(event.currentTarget.value);
    if (!Number.isFinite(value)) return;
    const duration = Number.isFinite(node.duration) ? node.duration : 0;
    if (duration <= 0) return;
    const nextTime = (value / 100) * duration;
    if (!Number.isFinite(nextTime)) return;
    try {
      node.currentTime = nextTime;
      setOverlayProgress({ current: nextTime, duration });
    } catch {
      /* ignore seek errors */
    }
  }, []);

  const overlayProgressPercent = React.useMemo(() => {
    const { current, duration } = overlayProgress;
    if (!Number.isFinite(duration) || duration <= 0) return 0;
    const ratio = Number.isFinite(current) && duration > 0 ? current / duration : 0;
    return Math.min(100, Math.max(0, ratio * 100));
  }, [overlayProgress]);

  const formattedCurrentTime = formatTimestamp(overlayProgress.current);
  const formattedDuration = formatTimestamp(overlayProgress.duration);
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
              <X weight="bold" size={22} />
            </button>
            <div
              className={lightboxStyles.lightboxBody}
              data-has-nav={imageCount > 1 ? "true" : undefined}
            >
              {imageCount > 1 ? (
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
              <div className={lightboxStyles.lightboxMedia}>
                {currentItem.mediaSrc ? (
                  currentItem.kind === "video" ? (
                    <video
                      ref={lightboxVideoRef}
                      className={composeVideoClasses(lightboxStyles.lightboxVideo, lightboxPresentation)}
                      data-letterbox={lightboxPresentation.letterbox ? "true" : undefined}
                      data-hls={isLightboxHls ? "true" : undefined}
                      src={
                        !isLightboxHls
                          ? currentItem.mediaSrc ?? undefined
                          : undefined
                      }
                      controls
                      playsInline
                      preload="auto"
                      poster={currentItem.posterSrc ?? undefined}
                      onLoadedMetadata={lightboxPresentation.handleLoadedMetadata}
                    >
                      {!isLightboxHls ? (
                        <source
                          src={currentItem.mediaSrc ?? undefined}
                          type={currentItem.mimeType ?? undefined}
                        />
                      ) : null}
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
      {activeVideoItem ? (
        <div
          className={styles.videoViewerOverlay}
          role="dialog"
          aria-modal="true"
          aria-label={activeVideoItem.caption ?? "Promo video viewer"}
          onClick={closeVideoOverlay}
        >
          <div className={styles.videoViewerContainer} onClick={(event) => event.stopPropagation()}>
            <button
              type="button"
              className={styles.videoViewerClose}
              onClick={closeVideoOverlay}
              aria-label="Close promo video"
            >
              <X weight="bold" size={22} />
            </button>
            {videoCount > 0 ? (
              <div className={styles.videoViewerProgressGroup} aria-hidden="true">
                {videoLightboxItems.map((item, index) => {
                  const width =
                    activeVideoIndex === null
                      ? 0
                      : index < activeVideoIndex
                      ? 100
                      : index === activeVideoIndex
                      ? overlayProgressPercent
                      : 0;
                  return (
                    <div key={item.id} className={styles.videoViewerProgressBar}>
                      <div
                        className={styles.videoViewerProgressFill}
                        style={{ width: `${Math.max(0, Math.min(100, width))}%` }}
                      />
                    </div>
                  );
                })}
              </div>
            ) : null}
            <div
              className={styles.videoViewerStage}
              data-playing={isOverlayPlaying ? "true" : undefined}
              data-ended={hasOverlayEnded ? "true" : undefined}
              data-has-nav={videoCount > 1 ? "true" : undefined}
            >
              {videoCount > 1 ? (
                <>
                  <button
                    type="button"
                    className={styles.videoViewerNav}
                    data-direction="prev"
                    onClick={(event) => {
                      event.stopPropagation();
                      navigateVideoOverlay(-1);
                    }}
                    aria-label="Previous promo video"
                  >
                    <CaretLeft size={28} weight="bold" />
                  </button>
                  <button
                    type="button"
                    className={styles.videoViewerNav}
                    data-direction="next"
                    onClick={(event) => {
                      event.stopPropagation();
                      navigateVideoOverlay(1);
                    }}
                    aria-label="Next promo video"
                  >
                    <CaretRight size={28} weight="bold" />
                  </button>
                </>
              ) : null}
              {activeVideoItem.mediaSrc ? (
                <video
                  key={activeVideoItem.mediaSrc}
                  ref={videoViewerRef}
                  className={composeVideoClasses(styles.videoViewerPlayer, overlayPresentation)}
                  data-letterbox={overlayPresentation.letterbox ? "true" : undefined}
                  data-hls={isOverlayHls ? "true" : undefined}
                  src={!isOverlayHls ? activeVideoItem.mediaSrc ?? undefined : undefined}
                  playsInline
                  preload="auto"
                  poster={activeVideoItem.posterSrc ?? undefined}
                  onLoadedMetadata={handleOverlayLoadedMetadata}
                  onTimeUpdate={handleOverlayTimeUpdate}
                  onEnded={handleOverlayEnded}
                  onPlay={handleOverlayPlay}
                  onPause={handleOverlayPause}
                  onVolumeChange={handleOverlayVolumeChange}
                  onClick={handleOverlayTogglePlay}
                  muted={isOverlayMuted}
                  disablePictureInPicture
                  controlsList="nodownload nofullscreen noplaybackrate"
                >
                  {!isOverlayHls ? (
                    <source
                      src={activeVideoItem.mediaSrc ?? undefined}
                      type={activeVideoItem.mimeType ?? undefined}
                    />
                  ) : null}
                  Your browser does not support embedded video.
                </video>
              ) : (
                <div className={styles.videoViewerFallback} aria-hidden="true">
                  <Play className={styles.videoViewerFallbackIcon} weight="fill" />
                </div>
              )}
              {activeVideoItem.mediaSrc && !isOverlayPlaying ? (
                <button
                  type="button"
                  className={styles.videoViewerPlayHint}
                  onClick={handleOverlayTogglePlay}
                  aria-label={hasOverlayEnded ? "Replay video" : "Play video"}
                >
                  <Play weight="fill" size={26} />
                </button>
              ) : null}
            </div>
            {activeVideoItem.mediaSrc ? (
              <div className={styles.videoViewerControls}>
                <button
                  type="button"
                  className={styles.videoViewerControlButton}
                  onClick={handleOverlayTogglePlay}
                  aria-label={
                    isOverlayPlaying
                      ? "Pause video"
                      : hasOverlayEnded
                      ? "Replay video"
                      : "Play video"
                  }
                >
                  {isOverlayPlaying ? <Pause size={20} weight="bold" /> : <Play size={20} weight="bold" />}
                </button>
                <div className={styles.videoViewerTimeline}>
                  <div className={styles.videoViewerTimelineBar} aria-hidden="true">
                    <div
                      className={styles.videoViewerTimelineProgress}
                      style={{ width: `${overlayProgressPercent}%` }}
                    />
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    step={0.1}
                    value={overlayProgressPercent}
                    onChange={handleOverlayScrub}
                    className={styles.videoViewerTimelineInput}
                    aria-label="Scrub promo video"
                  />
                </div>
                <div className={styles.videoViewerTimecode} aria-live="off">
                  {formattedCurrentTime} / {formattedDuration}
                </div>
                <button
                  type="button"
                  className={styles.videoViewerControlButton}
                  onClick={handleOverlayToggleMute}
                  aria-label={isOverlayMuted ? "Unmute video" : "Mute video"}
                >
                  {isOverlayMuted ? (
                    <SpeakerSlash size={20} weight="bold" />
                  ) : (
                    <SpeakerHigh size={20} weight="bold" />
                  )}
                </button>
                {videoCount > 1 && activeVideoIndex !== null ? (
                  <div className={styles.videoViewerStepper} aria-live="polite">
                    {activeVideoIndex + 1} / {videoCount}
                  </div>
                ) : null}
              </div>
            ) : null}
            {activeVideoItem.caption ? (
              <div className={styles.videoViewerCaption}>{activeVideoItem.caption}</div>
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
  const { isHlsSource } = useHlsVideo(videoRef, src, mimeType);
  const sanitizedPoster = poster && poster !== src ? poster : null;
  const presentation = useVideoPresentation(videoRef, src, mimeType);

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
        className={composeVideoClasses(styles.video, presentation)}
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
