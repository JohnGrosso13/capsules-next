"use client";

import * as React from "react";

import dynamic from "next/dynamic";
import { useWindowVirtualizer } from "@tanstack/react-virtual";

import styles from "./home-feed.module.css";

import { useHomeLoading } from "@/components/home-loading";
import type { HomeFeedItem, HomeFeedPost } from "@/hooks/useHomeFeed";
import { normalizeMediaUrl } from "@/lib/media";
import { shouldBypassCloudflareImages } from "@/lib/cloudflare/runtime";
import { buildViewerEnvelope } from "@/lib/feed/viewer-envelope";
import { useComposerActions } from "@/components/composer/ComposerProvider";
import { useOptionalFriendsDataContext } from "@/components/providers/FriendsDataProvider";
import { useSupabaseUserId } from "@/components/providers/SupabaseSessionProvider";
import { buildPrompterAttachment, type DocumentCardData } from "@/components/documents/document-card";
import { PostCard } from "@/components/home-feed/cards/PostCard";
import { FeedPostViewer } from "@/components/home-feed/FeedPostViewer";
import { useFeedSummary } from "@/components/home-feed/useFeedSummary";
import { useFeedComments } from "@/components/home-feed/useFeedComments";
import { useFeedCommentUI } from "@/components/home-feed/useFeedCommentUI";
import { useFeedLightbox } from "@/components/home-feed/useFeedLightbox";
import ShareSheet from "@/components/home-feed/ShareSheet";
import { buildPostMediaCollections } from "@/components/home-feed/utils";
import {
  buildLightboxItemsFromGallery,
  type LightboxImageItem,
} from "@/components/home-feed/feed-media-gallery";
import { PromoRow } from "@/components/promo-row";
import { useCurrentUser } from "@/services/auth/client";
import { EMPTY_THREAD_STATE } from "@/components/comments/types";
import { buildPostShareMessage, buildPostShareUrl, getPostCapsuleId } from "@/lib/share";

const CommentPanel = dynamic(

  () => import("@/components/comments/CommentPanel").then((mod) => mod.CommentPanel),

  {

    ssr: false,

    loading: () => <div className={styles.commentPanelFallback}>Loading comments...</div>,

  },

);

const SummaryCTAIsland = dynamic(

  () => import("@/components/home-feed/SummaryCTA").then((mod) => mod.SummaryCTA),

  { ssr: false, loading: () => null },

);

function normalizeIdentifier(value: unknown): string | null {

  if (typeof value === "number" && Number.isFinite(value)) {

    value = String(value);

  }
  if (typeof value !== "string") return null;

  const trimmed = value.trim();

  return trimmed.length ? trimmed : null;

}
function buildIdentifierSet(...identifiers: Array<unknown>): Set<string> {

  const result = new Set<string>();

  for (const entry of identifiers) {

    const normalized = normalizeIdentifier(entry);

    if (normalized) {

      result.add(normalized);

    }
  }
  return result;

}

type FeedRenderItem =
  | { kind: "post"; post: HomeFeedPost }
  | { kind: "promo"; id: string; payload?: Record<string, unknown> | null };

const PROMO_INTERVAL_DEFAULT = 10;
const LOAD_MORE_THRESHOLD = 3;
const FAST_SCROLL_POSTS_PER_SECOND = 35;
const PREFETCH_CHAIN_MAX = 2;
type HomeFeedListProps = {
  /** Hide the summary CTA banner (used inside Composer preview). */
  showSummaryCTA?: boolean;
  /** Card rendering variant. */
  cardVariant?: "full" | "preview";
  /** Optional override to route comment clicks (used in Composer preview). */
  onCommentClickOverride?: (post: HomeFeedPost) => void;
  /** Insert a promo row every N posts (set to null to disable). */
  promoInterval?: number | null;
  /** Pre-typed feed items (supports promos/modules). Falls back to posts if not provided. */
  items?: HomeFeedItem[] | null;

  posts: HomeFeedPost[];

  likePending: Record<string, boolean>;

  memoryPending: Record<string, boolean>;

  activeFriendTarget: string | null;

  friendActionPending: string | null;

  onToggleLike(postId: string): void;

  onToggleMemory(post: HomeFeedPost, desired: boolean): Promise<boolean | void> | boolean | void;

  onFriendRequest(post: HomeFeedPost, identifier: string): Promise<void> | void;
  onFollowUser(post: HomeFeedPost, identifier: string): Promise<void> | void;
  onUnfollowUser(post: HomeFeedPost, identifier: string): Promise<void> | void;

  onDelete(postId: string): void;

  onRemoveFriend(post: HomeFeedPost, identifier: string): Promise<void> | void;

  onToggleFriendTarget(identifier: string | null): void;

  formatCount(value?: number | null): string;

  timeAgo(iso?: string | null): string;

  exactTime(iso?: string | null): string;

  canRemember: boolean;

  hasFetched: boolean;

  isRefreshing: boolean;

  emptyMessage?: string;

  focusPostId?: string | null;

  onLoadMore?: () => void;

  hasMore?: boolean;

  isLoadingMore?: boolean;

};

export function HomeFeedList({

  posts,

  likePending,

  memoryPending,

  activeFriendTarget,

  friendActionPending,

  onToggleLike,

  onToggleMemory,

  onFriendRequest,
  onFollowUser,
  onUnfollowUser,

  onDelete,

  onToggleFriendTarget,

  onRemoveFriend,

  formatCount,

  timeAgo,

  exactTime,

  canRemember,

  hasFetched,

  isRefreshing,

  emptyMessage,

  focusPostId,

  items,

  onLoadMore,

  hasMore = false,

  isLoadingMore = false,

  showSummaryCTA = true,
  promoInterval = PROMO_INTERVAL_DEFAULT,
  cardVariant = "full",
  onCommentClickOverride,
}: HomeFeedListProps) {

  const composer = useComposerActions();

  const { user: currentUser } = useCurrentUser();

  const friendsData = useOptionalFriendsDataContext();

  const supabaseUserId = useSupabaseUserId();

  const viewerUserId =

    typeof currentUser?.id === "string" && currentUser.id.trim().length ? currentUser.id.trim() : null;

  const viewerUserKey =

    typeof currentUser?.key === "string" && currentUser.key.trim().length

      ? currentUser.key.trim()

      : null;

  const supabaseViewerId =

    typeof friendsData?.viewerId === "string" && friendsData.viewerId.trim().length

      ? friendsData.viewerId.trim()

      : null;

  const viewerIdentifierSet = React.useMemo(
    () => buildIdentifierSet(viewerUserId, viewerUserKey, supabaseViewerId, supabaseUserId),
    [viewerUserId, viewerUserKey, supabaseViewerId, supabaseUserId],
  );
  const homeLoading = useHomeLoading();

  React.useEffect(() => {
    if (!homeLoading) return;
    if (hasFetched) {
      homeLoading.markReady("feed");
    }
  }, [hasFetched, homeLoading]);

  const followingIdentifierSet = friendsData?.followingIds ?? null;

  const showSkeletons = !hasFetched || (homeLoading?.isPending ?? false);
  const baseItems = React.useMemo<HomeFeedItem[]>(() => {
    if (showSkeletons) return [];
    if (items && Array.isArray(items)) return items;
    return posts.map((post) => ({
      id: post.id,
      type: "post",
      post,
      score: null,
      slotInterval: null,
      pinnedAt: null,
      payload: null,
    }));
  }, [items, posts, showSkeletons]);

  const postItems = React.useMemo(
    () => baseItems.filter((entry): entry is Extract<HomeFeedItem, { type: "post" }> => entry.type === "post").map((entry) => entry.post),
    [baseItems],
  );

  const feedItems = React.useMemo<FeedRenderItem[]>(() => {
    if (showSkeletons) return [];
    const interval =
      typeof promoInterval === "number" && promoInterval > 0
        ? Math.max(1, Math.trunc(promoInterval))
        : null;
    const hasSourcePromos = baseItems.some((entry) => entry.type !== "post");
    let promoCount = 0;
    let seenPosts = 0;
    const itemsOut: FeedRenderItem[] = [];
    baseItems.forEach((entry) => {
      if (entry.type === "post" && entry.post) {
        seenPosts += 1;
        itemsOut.push({ kind: "post", post: entry.post });
        if (!hasSourcePromos && interval && seenPosts % interval === 0 && seenPosts < postItems.length) {
          promoCount += 1;
          itemsOut.push({ kind: "promo", id: `promo-${promoCount}-${entry.post.id}` });
        }
      } else {
        itemsOut.push({ kind: "promo", id: entry.id, payload: entry.payload ?? null });
      }
    });
    return itemsOut;
  }, [baseItems, postItems.length, promoInterval, showSkeletons]);

  const feedItemIndexByPostId = React.useMemo(() => {
    const map = new Map<string, number>();
    feedItems.forEach((item, index) => {
      if (item.kind === "post") {
        map.set(item.post.id, index);
      }
    });
    return map;
  }, [feedItems]);

  const estimateItemHeight = React.useCallback(
    (index: number) => (feedItems[index]?.kind === "promo" ? 360 : 520),
    [feedItems],
  );
  const virtualizationCount = showSkeletons ? 0 : feedItems.length;
  const windowVirtualizer = useWindowVirtualizer({
    count: virtualizationCount,
    estimateSize: estimateItemHeight,
    overscan: 8,
    getItemKey: React.useCallback(
      (index: number) => {
        const item = feedItems[index];
        if (!item) return `feed-item-${index}`;
        return item.kind === "promo" ? item.id : item.post.id;
      },
      [feedItems],
    ),
  });
  const virtualItems = windowVirtualizer.getVirtualItems();
  const totalVirtualHeight = windowVirtualizer.getTotalSize();
  const measureVirtualElement = React.useCallback(
    (node: HTMLElement | null) => {
      if (!node) return;
      windowVirtualizer.measureElement(node);
    },
    [windowVirtualizer],
  );
  const loadMoreTriggerLengthRef = React.useRef<number>(0);
  const deferredLoadRef = React.useRef(false);
  const scrollDepthRef = React.useRef<number>(-1);
  const scrollVelocityRef = React.useRef<{ index: number; time: number }>({
    index: -1,
    time:
      typeof performance !== "undefined" && typeof performance.now === "function"
        ? performance.now()
        : Date.now(),
  });
  const prefetchBudgetRef = React.useRef<number>(0);
  const wasLoadingRef = React.useRef<boolean>(false);

  React.useEffect(() => {
    if (!virtualItems.length) return;
    const maxIndex = Math.max(...virtualItems.map((item) => item.index));
    if (maxIndex > scrollDepthRef.current) {
      scrollDepthRef.current = maxIndex;
      if (typeof window !== "undefined") {
        window.dispatchEvent(
          new CustomEvent("feed:scroll-depth", {
            detail: { lastVisibleIndex: maxIndex, total: feedItems.length },
          }),
        );
      }
    }
  }, [feedItems.length, virtualItems]);

  const isSlowConnection = React.useCallback(() => {
    if (typeof navigator === "undefined") return false;
    const connection = (navigator as { connection?: { effectiveType?: string; saveData?: boolean } }).connection;
    if (!connection) return false;
    const saveData = Boolean(connection.saveData);
    const effectiveType = typeof connection.effectiveType === "string" ? connection.effectiveType : "";
    return saveData || effectiveType.includes("2g");
  }, []);

  React.useEffect(() => {
    if (!onLoadMore || !hasMore || isLoadingMore || showSkeletons) return;
    const last = virtualItems[virtualItems.length - 1];
    if (!last) return;

    const now =
      typeof performance !== "undefined" && typeof performance.now === "function"
        ? performance.now()
        : Date.now();
    const previous = scrollVelocityRef.current;
    const deltaIndex = last.index - previous.index;
    const deltaTime = Math.max(1, now - previous.time);
    const postsPerSecond = deltaIndex > 0 ? (deltaIndex / deltaTime) * 1000 : 0;
    const fastScroll = postsPerSecond >= FAST_SCROLL_POSTS_PER_SECOND || deltaIndex >= 20;
    scrollVelocityRef.current = { index: last.index, time: now };

    const remaining = feedItems.length - 1 - last.index;
    if (remaining <= LOAD_MORE_THRESHOLD && loadMoreTriggerLengthRef.current !== feedItems.length) {
      if (typeof document !== "undefined" && document.visibilityState === "hidden") {
        deferredLoadRef.current = true;
        return;
      }
      if (isSlowConnection()) {
        deferredLoadRef.current = true;
        return;
      }
      loadMoreTriggerLengthRef.current = feedItems.length;
      if (fastScroll) {
        prefetchBudgetRef.current = Math.min(
          PREFETCH_CHAIN_MAX,
          prefetchBudgetRef.current + 1,
        );
      }
      onLoadMore();
    }
  }, [
    feedItems.length,
    hasMore,
    isLoadingMore,
    isSlowConnection,
    onLoadMore,
    showSkeletons,
    virtualItems,
  ]);

  React.useEffect(() => {
    if (
      !deferredLoadRef.current ||
      !onLoadMore ||
      !hasMore ||
      isLoadingMore ||
      showSkeletons ||
      typeof document === "undefined"
    ) {
      return;
    }
    if (document.visibilityState === "visible" && !isSlowConnection()) {
      deferredLoadRef.current = false;
      loadMoreTriggerLengthRef.current = feedItems.length;
      onLoadMore();
    }
  }, [feedItems.length, hasMore, isLoadingMore, isSlowConnection, onLoadMore, showSkeletons]);

  React.useEffect(() => {
    if (!hasMore) {
      loadMoreTriggerLengthRef.current = 0;
      prefetchBudgetRef.current = 0;
    }
  }, [hasMore]);

  React.useEffect(() => {
    const wasLoading = wasLoadingRef.current;
    wasLoadingRef.current = isLoadingMore;
    if (
      !onLoadMore ||
      showSkeletons ||
      isLoadingMore ||
      !wasLoading ||
      prefetchBudgetRef.current <= 0 ||
      !hasMore
    ) {
      return;
    }
    if (typeof document !== "undefined" && document.visibilityState === "hidden") {
      return;
    }
    if (isSlowConnection()) {
      prefetchBudgetRef.current = 0;
      return;
    }
    prefetchBudgetRef.current -= 1;
    loadMoreTriggerLengthRef.current = feedItems.length;
    onLoadMore();
  }, [
    feedItems.length,
    hasMore,
    isLoadingMore,
    isSlowConnection,
    onLoadMore,
    showSkeletons,
  ]);

  const [pendingFocusPostId, setPendingFocusPostId] = React.useState<string | null>(() => {

    if (typeof focusPostId === "string" && focusPostId.trim().length) {

      return focusPostId.trim();

    }
    return null;

  });

  React.useEffect(() => {

    if (typeof focusPostId === "string" && focusPostId.trim().length) {

      const trimmed = focusPostId.trim();

      setPendingFocusPostId((previous) => (previous === trimmed ? previous : trimmed));

    } else if (focusPostId === null) {

      setPendingFocusPostId(null);

    }
  }, [focusPostId]);

  React.useEffect(() => {

    if (typeof window === "undefined") return;

    if (!pendingFocusPostId) return;

    if (!feedItems.length) return;

    const targetIndex = feedItemIndexByPostId.get(pendingFocusPostId);

    if (typeof targetIndex !== "number") return;

    if (virtualizationCount > 0) {

      windowVirtualizer.scrollToIndex(targetIndex, { align: "center" });

    }

    const raf = window.requestAnimationFrame(() => {

      const escapedId =

        typeof CSS !== "undefined" && typeof CSS.escape === "function"

          ? CSS.escape(pendingFocusPostId)

          : pendingFocusPostId.replace(/["'\\]/g, "\\$&");

      const card = document.querySelector<HTMLElement>(`[data-post-id="${escapedId}"]`);

      if (!card) return;

      card.scrollIntoView({ behavior: "smooth", block: "center" });

      card.setAttribute("data-summary-flash", "true");

      window.setTimeout(() => {

        card.removeAttribute("data-summary-flash");

      }, 2400);

      setPendingFocusPostId(null);

    });

    return () => window.cancelAnimationFrame(raf);

  }, [pendingFocusPostId, feedItemIndexByPostId, feedItems.length, windowVirtualizer, virtualizationCount]);

  const viewerEnvelope = React.useMemo(() => buildViewerEnvelope(currentUser), [currentUser]);

  const { commentThreads, commentSubmitting, loadComments, submitComment } = useFeedComments({
    currentUser,
    viewerUserId,
    viewerEnvelope,
  });

  const {
    activeComment,
    commentAnchorRef,
    handleCommentButtonClick,
    closeComments,
    highlightPost,
  } = useFeedCommentUI({ displayedPosts: postItems, loadComments });

  const skeletons = React.useMemo(

    () =>

      Array.from({ length: 4 }, (_, index) => (

        <article key={`skeleton-${index}`} className={styles.card} data-skeleton="true" aria-hidden>

          <header className={styles.cardHead}>

            <span className={styles.avatarWrap} data-skeleton-block />

            <div data-skeleton-stack>

              <span data-skeleton-line />

              <span data-skeleton-line />

            </div>

            <span className={styles.iconBtn} data-skeleton-block />

          </header>

          <div className={styles.cardBody} data-skeleton-stack>

            <span data-skeleton-line />

            <span data-skeleton-line />

            <span data-skeleton-line />

          </div>

          <div className={styles.mediaGallery} data-skeleton-gallery>

            <span data-skeleton-tile />

            <span data-skeleton-tile />

            <span data-skeleton-tile />

          </div>

          <footer className={styles.actionBar}>

            <span data-skeleton-pill />

            <span data-skeleton-pill />

            <span data-skeleton-pill />

          </footer>

        </article>

      )),

    [],

  );

  const cloudflareEnabled = React.useMemo(() => !shouldBypassCloudflareImages(), []);

  const currentOrigin = React.useMemo(

    () => (typeof window !== "undefined" ? window.location.origin : null),

    [],

  );

  const lightboxCacheRef = React.useRef<Map<string, LightboxImageItem[]>>(new Map());
  const openedFocusRef = React.useRef<string | null>(null);

  const getLightboxItemsForPost = React.useCallback(

    (post: HomeFeedPost) => {

      const cached = lightboxCacheRef.current.get(post.id);

      if (cached) return cached;

      const { galleryItems } = buildPostMediaCollections({

        post,

        initialMedia: normalizeMediaUrl(post.mediaUrl),

        cloudflareEnabled,

        currentOrigin,

      });

      const items = buildLightboxItemsFromGallery(galleryItems);

      lightboxCacheRef.current.set(post.id, items);

      return items;

    },

    [cloudflareEnabled, currentOrigin],

  );

  const findSiblingPost = React.useCallback(

    (startIndex: number, step: number) => {

      if (!postItems.length) return null;

      const direction = step >= 0 ? 1 : -1;

      let nextIndex = startIndex + direction;

      while (nextIndex >= 0 && nextIndex < postItems.length) {

        const candidate = postItems[nextIndex];

        if (!candidate) break;

        const items = getLightboxItemsForPost(candidate);

        if (items.length) {

          return { post: candidate, items, index: nextIndex };

        }

        nextIndex += direction;

      }

      return null;

  },

    [getLightboxItemsForPost, postItems],

  );

  const handleAskDocument = React.useCallback(

    (doc: DocumentCardData) => {

      const promptSegments = [`Summarize the document "${doc.name}" for the capsule.`];

      if (doc.summary) {

        promptSegments.push(`Existing summary: ${doc.summary}`);

      } else if (doc.snippet) {

        promptSegments.push(`Preview: ${doc.snippet}`);

      }
      const attachment = buildPrompterAttachment(doc);

      composer

        .submitPrompt(promptSegments.join("\n\n"), [attachment])

        .catch((error) => console.error("Document prompt submit failed", error));

    },

    [composer],

  );



  const {

    documentSummaryPending,

    feedSummaryPending,

    summarizeDocument,

    summarizeFeed,

  } = useFeedSummary({

    displayedPosts: postItems,

    timeAgo,

    onHighlightPost: highlightPost,

  });

  const {

    lightbox,

    openLightbox,

    closeLightbox,

    navigate: navigateLightbox,

  } = useFeedLightbox();

  const [sharePayload, setSharePayload] = React.useState<{
    url: string | null;
    title: string;
    text: string;
  } | null>(null);
  const [shareCounts, setShareCounts] = React.useState<Record<string, number | undefined>>({});

  const getShareOverride = React.useCallback(
    (postId: string, fallback?: number | null): number | null => {
      const value = shareCounts[postId];
      if (typeof value === "number" && Number.isFinite(value)) return value;
      if (typeof fallback === "number" && Number.isFinite(fallback)) return fallback;
      return null;
    },
    [shareCounts],
  );

  const buildSharePayload = React.useCallback(
    (post: HomeFeedPost) => {
      const url = buildPostShareUrl(post, currentOrigin);
      const message = buildPostShareMessage(post);
      return { url, ...message };
    },
    [currentOrigin],
  );

  const resolveShareTargetId = React.useCallback((post: HomeFeedPost) => {
    const candidates = [post.dbId, post.id].filter(
      (value): value is string => typeof value === "string" && value.trim().length > 0,
    );
    const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    for (const candidate of candidates) {
      if (uuidPattern.test(candidate)) return candidate;
    }
    return null;
  }, []);

  const recordShare = React.useCallback(
    async (post: HomeFeedPost) => {
      const targetId = resolveShareTargetId(post);
      if (!targetId) return;
      const capsuleId = getPostCapsuleId(post);
      try {
        const response = await fetch("/api/posts/share", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            postId: targetId,
            capsuleId,
          }),
        });
        if (!response.ok) {
          return;
        }
        const data = (await response.json()) as { shares?: number | null };
        if (typeof data?.shares === "number" && Number.isFinite(data.shares)) {
          setShareCounts((prev) => ({ ...prev, [post.id]: data.shares as number }));
        } else {
          setShareCounts((prev) => {
            const raw = prev[post.id];
            const base =
              Number.isFinite(raw) && typeof raw === "number"
                ? raw
                : typeof post.shares === "number" && Number.isFinite(post.shares)
                  ? post.shares
                  : 0;
            const nextValue = Math.max(0, base + 1);
            return { ...prev, [post.id]: nextValue };
          });
        }
      } catch (error) {
        console.warn("share logging failed", error);
      }
    },
    [resolveShareTargetId],
  );

  const handleSharePost = React.useCallback(
    async (post: HomeFeedPost) => {
      const payload = buildSharePayload(post);
      setSharePayload(payload);
      void recordShare(post);
    },
    [buildSharePayload, recordShare],
  );

  const closeShareSheet = React.useCallback(() => setSharePayload(null), []);

  const handleNativeShareFromSheet = React.useCallback(() => {
    if (!sharePayload?.url) return;
    if (typeof navigator === "undefined" || typeof navigator.share !== "function") return;
    const data = { title: sharePayload.title, text: sharePayload.text, url: sharePayload.url };
    const supported = typeof navigator.canShare === "function" ? navigator.canShare(data) : true;
    if (!supported) return;
    void navigator.share(data).catch((error) => {
      if (error && typeof error === "object" && (error as DOMException)?.name === "AbortError") {
        return;
      }
      console.warn("Native share failed from sheet", error);
    });
  }, [sharePayload]);

  const canUseNativeShare = React.useMemo(
    () => typeof navigator !== "undefined" && typeof navigator.share === "function",
    [],
  );

  React.useEffect(() => {
    if (!focusPostId) {
      openedFocusRef.current = null;
      return;
    }

    const target = focusPostId.trim();
    if (!target || !postItems.length) return;
    if (openedFocusRef.current === target) return;

    const post = postItems.find((entry) => entry.id === target);
    if (!post) return;

    const items = getLightboxItemsForPost(post);
    lightboxCacheRef.current.set(post.id, items);

    openLightbox({
      postId: post.id,
      index: 0,
      items,
      post,
    });

    openedFocusRef.current = target;
  }, [focusPostId, getLightboxItemsForPost, openLightbox, postItems]);

  const handleNavigateAttachment = React.useCallback(

    (step: number, options?: { loop?: boolean }) => navigateLightbox(step, options),

    [navigateLightbox],

  );

  const handleNavigatePost = React.useCallback(

    (step: number) => {

      if (!lightbox) return;

      const currentIndex = postItems.findIndex((entry) => entry.id === lightbox.postId);

      if (currentIndex === -1) return;

      const target = findSiblingPost(currentIndex, step);

      if (!target) return;

      lightboxCacheRef.current.set(target.post.id, target.items);

      openLightbox({

        postId: target.post.id,

        index: 0,

        items: target.items,

        post: target.post,

      });

    },

    [findSiblingPost, lightbox, openLightbox, postItems],

  );

  const handleSummarizeFeed = React.useCallback(() => {

    void summarizeFeed();

  }, [summarizeFeed]);

  const activeCommentPost = React.useMemo(

    () =>

      activeComment

        ? postItems.find((post) => post.id === activeComment.postId) ?? null

        : null,

    [activeComment, postItems],

  );

  const viewerPost = lightbox

    ? postItems.find((entry) => entry.id === lightbox.postId) ?? lightbox.post ?? null

    : null;

  const viewerShareCountOverride = viewerPost
    ? getShareOverride(
        viewerPost.id,
        typeof viewerPost.shares === "number" ? viewerPost.shares : null,
      )
    : null;

  const viewerAttachment = lightbox ? lightbox.items[lightbox.index] ?? null : null;

  const viewerThread = viewerPost ? commentThreads[viewerPost.id] ?? EMPTY_THREAD_STATE : EMPTY_THREAD_STATE;

  const viewerSubmitting = viewerPost ? Boolean(commentSubmitting[viewerPost.id]) : false;

  const viewerLikePending = viewerPost ? Boolean(likePending[viewerPost.id]) : false;
  const viewerMemoryPending = viewerPost ? Boolean(memoryPending[viewerPost.id]) : false;
  const viewerRemembered = viewerPost
    ? Boolean(viewerPost.viewerRemembered ?? viewerPost.viewer_remembered ?? false)
    : false;

  const viewerPostNavigation = React.useMemo(() => {

    if (!lightbox) {

      return { prev: false, next: false };

    }

    const currentIndex = postItems.findIndex((entry) => entry.id === lightbox.postId);

    if (currentIndex === -1) {

      return { prev: false, next: false };

    }

    return {

      prev: Boolean(findSiblingPost(currentIndex, -1)),

      next: Boolean(findSiblingPost(currentIndex, 1)),

    };

  }, [findSiblingPost, lightbox, postItems]);

  const viewerFriendControls = React.useMemo(() => {

    if (!viewerPost) return null;

    const resolvedUserId =

      viewerPost.owner_user_id ??

      viewerPost.ownerUserId ??

      viewerPost.author_user_id ??

      viewerPost.authorUserId ??

      null;

    const resolvedUserKey =

      viewerPost.owner_user_key ??

      viewerPost.ownerUserKey ??

      viewerPost.author_user_key ??

      viewerPost.authorUserKey ??

      null;

    const friendTargetKey = resolvedUserId ?? resolvedUserKey ?? viewerPost.id;

    const menuIdentifier = `${friendTargetKey}::${viewerPost.id}`;

    const canTarget = Boolean(resolvedUserId ?? resolvedUserKey);

    const normalizedAuthorIds = [

      normalizeIdentifier(resolvedUserId),

      normalizeIdentifier(resolvedUserKey),

      normalizeIdentifier(viewerPost.owner_user_id),

      normalizeIdentifier(viewerPost.ownerUserId),

      normalizeIdentifier(viewerPost.author_user_id),

      normalizeIdentifier(viewerPost.authorUserId),

      normalizeIdentifier(viewerPost.owner_user_key),

      normalizeIdentifier(viewerPost.ownerKey),

      normalizeIdentifier(viewerPost.author_user_key),

      normalizeIdentifier(viewerPost.authorUserKey),

    ].filter((value): value is string => Boolean(value));

    const viewerOwnsPost =

      normalizedAuthorIds.length > 0 &&

      normalizedAuthorIds.some((id) => viewerIdentifierSet.has(id));

    const allowFollowActions = canTarget && !viewerOwnsPost;

    const isFollowing = normalizedAuthorIds.some((id) =>

      id && followingIdentifierSet ? followingIdentifierSet.has(id) : false,

    );

    const followState: "following" | "not_following" | null =

      allowFollowActions && normalizedAuthorIds.length

        ? isFollowing

          ? "following"

          : "not_following"

        : null;

    const bind =

      <T extends (post: HomeFeedPost, identifier: string) => unknown>(fn?: T | null) =>

        fn

          ? () => {

              fn(viewerPost, menuIdentifier);

            }

          : null;

    return {

      canTarget,

      pending: friendActionPending === menuIdentifier,

      followState,

      onRequest: bind(onFriendRequest),

      onRemove: bind(onRemoveFriend),

      onFollow: followState === "not_following" ? bind(onFollowUser) : null,

      onUnfollow: followState === "following" ? bind(onUnfollowUser) : null,

    };

  }, [

    viewerPost,

    viewerIdentifierSet,

    followingIdentifierSet,

    friendActionPending,

    onFriendRequest,

    onRemoveFriend,

    onFollowUser,

    onUnfollowUser,

  ]);

  const activeCommentFriendMenu = React.useMemo(() => {
    if (!activeCommentPost) return null;
    const resolvedUserId =
      activeCommentPost.owner_user_id ??
      activeCommentPost.ownerUserId ??
      activeCommentPost.author_user_id ??
      activeCommentPost.authorUserId ??
      null;
    const resolvedUserKey =
      activeCommentPost.owner_user_key ??
      activeCommentPost.ownerUserKey ??
      activeCommentPost.author_user_key ??
      activeCommentPost.authorUserKey ??
      null;

    const normalizedAuthorIds = [
      normalizeIdentifier(resolvedUserId),
      normalizeIdentifier(resolvedUserKey),
      normalizeIdentifier(activeCommentPost.owner_user_id),
      normalizeIdentifier(activeCommentPost.ownerUserId),
      normalizeIdentifier(activeCommentPost.author_user_id),
      normalizeIdentifier(activeCommentPost.authorUserId),
      normalizeIdentifier(activeCommentPost.owner_user_key),
      normalizeIdentifier(activeCommentPost.ownerKey),
      normalizeIdentifier(activeCommentPost.author_user_key),
      normalizeIdentifier(activeCommentPost.authorUserKey),
    ].filter((value): value is string => Boolean(value));

    const friendTargetKey = resolvedUserId ?? resolvedUserKey ?? activeCommentPost.id;
    const menuIdentifier = `${friendTargetKey}::${activeCommentPost.id}`;
    const canTarget = Boolean(resolvedUserId ?? resolvedUserKey);
    const viewerOwnsPost =
      normalizedAuthorIds.length > 0 && normalizedAuthorIds.some((id) => viewerIdentifierSet.has(id));
    const allowFollowActions = canTarget && !viewerOwnsPost;
    const isFollowingAuthor =
      allowFollowActions &&
      Boolean(
        followingIdentifierSet &&
          normalizedAuthorIds.some((id) => followingIdentifierSet.has(id)),
      );
    const followState: "following" | "not_following" | null = allowFollowActions
      ? isFollowingAuthor
        ? "following"
        : "not_following"
      : null;

    return {
      canTarget,
      pending: friendActionPending === menuIdentifier,
      followState,
      onRequest: () => onFriendRequest(activeCommentPost, menuIdentifier),
      onRemove: () => onRemoveFriend(activeCommentPost, menuIdentifier),
      onFollow:
        followState === "not_following"
          ? () => onFollowUser(activeCommentPost, menuIdentifier)
          : null,
      onUnfollow:
        followState === "following"
          ? () => onUnfollowUser(activeCommentPost, menuIdentifier)
          : null,
    };
  }, [
    activeCommentPost,
    followingIdentifierSet,
    friendActionPending,
    onFollowUser,
    onFriendRequest,
    onRemoveFriend,
    onUnfollowUser,
    viewerIdentifierSet,
  ]);

  return (

    <>

      {showSkeletons ? (

        <div className={styles.feedSkeleton} aria-live="polite" aria-busy="true">

          {skeletons}
        </div>

      ) : null}
      {!showSkeletons && postItems.length === 0 ? (

        <div className={styles.feedEmpty} role="status">

          <p className={styles.feedEmptyTitle}>No posts yet</p>

          <p className={styles.feedEmptySubtitle}>

            {emptyMessage ?? "Be the first to share something in this space."}
          </p>

        </div>

      ) : null}
      {!showSkeletons && showSummaryCTA ? (

        <React.Suspense fallback={<div className={styles.feedVirtualFallback}>Preparing summary...</div>}>

          <SummaryCTAIsland

            pending={feedSummaryPending}

            hasPosts={postItems.length > 0}

            onSummarize={handleSummarizeFeed}

          />

        </React.Suspense>

      ) : null}
      {!showSkeletons && virtualizationCount > 0 ? (

        <React.Suspense fallback={<div className={styles.feedVirtualFallback}>Rendering feed...</div>}>

          <div className={styles.feedVirtualRoot} style={{ height: `${totalVirtualHeight}px` }}>

            {virtualItems.map((virtualRow) => {

              const item = feedItems[virtualRow.index];

              if (!item) return null;

              if (item.kind === "promo") {
                return (
                  <div
                    key={virtualRow.key}
                    ref={measureVirtualElement}
                    data-index={virtualRow.index}
                    className={styles.feedVirtualItem}
                    style={{
                      transform: `translateY(${virtualRow.start}px)`,
                    }}
                  >
                    <PromoRow />
                  </div>
                );
              }

              const post = item.post;
              const resolvedUserId =

                post.owner_user_id ??

                post.ownerUserId ??

                post.author_user_id ??

                post.authorUserId ??

                null;

              const resolvedUserKey =

                post.owner_user_key ??

                post.ownerUserKey ??

                post.author_user_key ??

                post.authorUserKey ??

                null;

              const friendTargetKey = resolvedUserId ?? resolvedUserKey ?? post.id;

              const menuIdentifier = `${friendTargetKey}::${post.id}`;

              const canTarget = Boolean(resolvedUserId ?? resolvedUserKey);

              const normalizedAuthorIds = [
                normalizeIdentifier(resolvedUserId),
                normalizeIdentifier(resolvedUserKey),
              ].filter((value): value is string => Boolean(value));

              const viewerOwnsPost =
                normalizedAuthorIds.length > 0 &&
                normalizedAuthorIds.some((id) => viewerIdentifierSet.has(id));

              const allowFollowActions = canTarget && !viewerOwnsPost;

              const isFriendOptionOpen = activeFriendTarget === menuIdentifier;

              const isFriendActionPending = friendActionPending === menuIdentifier;

              const isFollowingAuthor =
                allowFollowActions &&
                Boolean(
                  followingIdentifierSet &&
                    normalizedAuthorIds.some((id) => followingIdentifierSet.has(id)),
                );

              const followState: "following" | "not_following" | null = allowFollowActions
                ? isFollowingAuthor
                  ? "following"
                  : "not_following"
                : null;

              const friendMenuConfig = {

                canTarget,

                isOpen: isFriendOptionOpen,

                isPending: isFriendActionPending,

                identifier: menuIdentifier,

                onToggle: (next: boolean) => onToggleFriendTarget(next ? menuIdentifier : null),

                onRequest: () => onFriendRequest(post, menuIdentifier),

                onRemove: () => onRemoveFriend(post, menuIdentifier),

                ...(followState
                  ? {
                      followState,
                      onFollow: () => onFollowUser(post, menuIdentifier),
                      onUnfollow: () => onUnfollowUser(post, menuIdentifier),
                    }
                  : {}),

              };

              const baseCommentCount =

                typeof post.comments === "number" ? Math.max(0, post.comments) : 0;

              const threadForPost = commentThreads[post.id] ?? null;

              const commentCount = threadForPost ? threadForPost.comments.length : baseCommentCount;
              const shareCountOverride = getShareOverride(
                post.id,
                typeof post.shares === "number" ? post.shares : null,
              );

              const handlePostLightboxOpen = (payload: { postId: string; index: number; items: LightboxImageItem[] }) => {
                lightboxCacheRef.current.set(post.id, payload.items);
                openLightbox({
                  postId: post.id,
                  index: payload.index,
                  items: payload.items,
                  post,
                });
              };
              const isPriority = virtualRow.index < 2;

              return (

                <div

                  key={virtualRow.key}

                  ref={measureVirtualElement}

                  data-index={virtualRow.index}

                  className={styles.feedVirtualItem}

                  style={{
                    transform: `translateY(${virtualRow.start}px)`,
                  }}

                >

                  <PostCard

                    variant={cardVariant} post={post}
                    viewerIdentifiers={viewerIdentifierSet}
                    likePending={Boolean(likePending[post.id])}
                    memoryPending={Boolean(memoryPending[post.id])}
                    remembered={Boolean(post.viewerRemembered ?? post.viewer_remembered ?? false)}
                    canRemember={canRemember}
                    friendMenu={friendMenuConfig}
                    cloudflareEnabled={cloudflareEnabled}
                    currentOrigin={currentOrigin}
                    formatCount={formatCount}
                    timeAgo={timeAgo}
                    exactTime={exactTime}
                    commentCount={commentCount}
                    commentThread={threadForPost ?? null}
                    onRequestComments={loadComments}
                    isRefreshing={isRefreshing && hasFetched}
                    documentSummaryPending={documentSummaryPending}
                    onToggleLike={onToggleLike}
                    onToggleMemory={onToggleMemory}
                    onDelete={onDelete}
                    onOpenLightbox={handlePostLightboxOpen}
                  onAskDocument={handleAskDocument}
                  onSummarizeDocument={summarizeDocument}
                  priority={isPriority}
                  onCommentClick={(currentPost, anchor) => onCommentClickOverride ? onCommentClickOverride(currentPost) : handleCommentButtonClick(currentPost, anchor)}
                  onShare={handleSharePost}
                  shareCountOverride={shareCountOverride ?? null}
                />

              </div>

            );

            })}

          </div>

        </React.Suspense>

      ) : null}
      {hasMore && onLoadMore ? (

        <div className={styles.loadMoreRow}>

          <button

            type="button"

            className={styles.loadMoreButton}
            onClick={onLoadMore}
            disabled={isLoadingMore}
            aria-busy={isLoadingMore ? true : undefined}
          >

            {isLoadingMore ? "Loading more..." : "Load more posts"}
          </button>

        </div>

      ) : null}
      {lightbox ? (

        <FeedPostViewer

          attachment={viewerAttachment}

          attachments={lightbox.items}

          post={viewerPost}

          onClose={closeLightbox}

          onNavigateAttachment={handleNavigateAttachment}

          onNavigatePost={handleNavigatePost}

          canNavigatePrevPost={viewerPostNavigation.prev}

          canNavigateNextPost={viewerPostNavigation.next}

          formatCount={formatCount}

          timeAgo={timeAgo}

          exactTime={exactTime}

          commentThread={viewerThread}

          commentSubmitting={viewerSubmitting}

          loadComments={loadComments}

          submitComment={submitComment}

          likePending={viewerLikePending}

          onToggleLike={onToggleLike}

          remembered={viewerRemembered}

          memoryPending={viewerMemoryPending}

          canRemember={canRemember}

          onToggleMemory={onToggleMemory}

          friendControls={viewerFriendControls}

          onShare={handleSharePost}

          shareCountOverride={viewerShareCountOverride ?? null}

        />

      ) : null}
      {activeCommentPost ? (

        <CommentPanel

          post={activeCommentPost}
          anchorEl={commentAnchorRef.current}
          visible={Boolean(activeComment)}
          thread={commentThreads[activeCommentPost.id] ?? EMPTY_THREAD_STATE}
          submitting={Boolean(commentSubmitting[activeCommentPost.id])}
          onClose={closeComments}
          onLoad={loadComments}
          onReload={loadComments}
          onSubmit={submitComment}
          timeAgo={timeAgo}
          exactTime={exactTime}
          onToggleLike={onToggleLike}
          likePending={Boolean(likePending[activeCommentPost.id])}
          likeCount={
            typeof activeCommentPost.likes === "number" ? activeCommentPost.likes : null
          }
          shareCount={
            getShareOverride(
              activeCommentPost.id,
              typeof activeCommentPost.shares === "number" ? activeCommentPost.shares : null,
            )
          }
          onShare={handleSharePost}
          viewerLiked={Boolean(
            activeCommentPost.viewerLiked ?? activeCommentPost.viewer_liked ?? false,
          )}
          remembered={Boolean(
            activeCommentPost.viewerRemembered ?? activeCommentPost.viewer_remembered ?? false,
          )}
          memoryPending={Boolean(memoryPending[activeCommentPost.id])}
          canRemember={canRemember}
          onToggleMemory={(post, desired) => {
            const outcome = onToggleMemory(post, desired);
            if (outcome && typeof (outcome as Promise<unknown>).then === "function") {
              return (outcome as Promise<unknown>).then(() => {});
            }
            return undefined;
          }}
          friendMenu={activeCommentFriendMenu}
        />

      ) : null}
      <ShareSheet
        open={Boolean(sharePayload)}
        url={sharePayload?.url ?? null}
        title={sharePayload?.title ?? "Share post"}
        text={sharePayload?.text ?? ""}
        canNativeShare={canUseNativeShare}
        onNativeShare={handleNativeShareFromSheet}
        onClose={closeShareSheet}
      />
    </>

  );

}
