"use client";

import * as React from "react";

import dynamic from "next/dynamic";
import { useWindowVirtualizer } from "@tanstack/react-virtual";

import styles from "./home-feed.module.css";

import type { HomeFeedPost } from "@/hooks/useHomeFeed";
import { normalizeMediaUrl } from "@/lib/media";
import { shouldBypassCloudflareImages } from "@/lib/cloudflare/runtime";
import { buildViewerEnvelope } from "@/lib/feed/viewer-envelope";
import { useComposer } from "@/components/composer/ComposerProvider";
import { useOptionalFriendsDataContext } from "@/components/providers/FriendsDataProvider";
import { useSupabaseUserId } from "@/components/providers/SupabaseSessionProvider";
import { buildPrompterAttachment, type DocumentCardData } from "@/components/documents/document-card";
import { PostCard } from "@/components/home-feed/cards/PostCard";
import { FeedPostViewer } from "@/components/home-feed/FeedPostViewer";
import { useFeedSummary } from "@/components/home-feed/useFeedSummary";
import { useFeedComments } from "@/components/home-feed/useFeedComments";
import { useFeedCommentUI } from "@/components/home-feed/useFeedCommentUI";
import { useFeedLightbox } from "@/components/home-feed/useFeedLightbox";
import { buildPostMediaCollections } from "@/components/home-feed/utils";
import {
  buildLightboxItemsFromGallery,
  type LightboxImageItem,
} from "@/components/home-feed/feed-media-gallery";
import { useCurrentUser } from "@/services/auth/client";
import { EMPTY_THREAD_STATE } from "@/components/comments/types";

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
type HomeFeedListProps = {
  /** Hide the summary CTA banner (used inside Composer preview). */
  showSummaryCTA?: boolean;
  /** Card rendering variant. */
  cardVariant?: "full" | "preview";
  /** Optional override to route comment clicks (used in Composer preview). */
  onCommentClickOverride?: (post: HomeFeedPost) => void;

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

  onLoadMore,

  hasMore = false,

  isLoadingMore = false,

  showSummaryCTA = true,
  cardVariant = "full",
  onCommentClickOverride,
}: HomeFeedListProps) {

  const composer = useComposer();

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

  const followingIdentifierSet = friendsData?.followingIds ?? null;

  const INITIAL_BATCH = 6;

  const BATCH_SIZE = 6;

  const [visibleCount, setVisibleCount] = React.useState(INITIAL_BATCH);

  const sentinelRef = React.useRef<HTMLDivElement | null>(null);

  const showSkeletons = !hasFetched;

  React.useEffect(() => {

    if (!hasFetched) {

      setVisibleCount(INITIAL_BATCH);

      return;

    }
    setVisibleCount((previous) => {

      const total = posts.length;

      if (total === 0) return 0;

      const baseline = Math.min(INITIAL_BATCH, total);

      if (previous === 0) return baseline;

      const bounded = Math.min(Math.max(previous, baseline), total);

      return bounded;

    });

  }, [hasFetched, posts.length]);

  React.useEffect(() => {

    if (!hasFetched) return;

    if (posts.length <= visibleCount) return;

    const node = sentinelRef.current;

    if (!node) return;

    const observer = new IntersectionObserver(

      (entries) => {

        const entry = entries.find((item) => item.isIntersecting);

        if (!entry) return;

        setVisibleCount((previous) => {

          const total = posts.length;

          if (total === 0) return 0;

          if (previous >= total) return previous;

          const next = Math.min(total, previous + BATCH_SIZE);

          return next;

        });

      },

      { rootMargin: "600px 0px" },

    );

    observer.observe(node);

    return () => observer.disconnect();

  }, [hasFetched, posts.length, visibleCount]);

  const visibleLimit = showSkeletons ? 0 : Math.min(visibleCount, posts.length);

  const displayedPosts = React.useMemo(() => {

    if (showSkeletons) return [];

    return posts.slice(0, visibleLimit || posts.length);

  }, [showSkeletons, posts, visibleLimit]);

  const estimatePostHeight = React.useCallback(() => 520, []);
  const virtualizationCount = showSkeletons ? 0 : displayedPosts.length;
  const windowVirtualizer = useWindowVirtualizer({
    count: virtualizationCount,
    estimateSize: estimatePostHeight,
    overscan: 8,
    getItemKey: React.useCallback(
      (index: number) => displayedPosts[index]?.id ?? `feed-item-${index}`,
      [displayedPosts],
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

    if (!displayedPosts.length) return;

    const targetIndex = displayedPosts.findIndex((post) => post.id === pendingFocusPostId);

    if (targetIndex === -1) return;

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

  }, [pendingFocusPostId, displayedPosts, windowVirtualizer, virtualizationCount]);

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
  } = useFeedCommentUI({ displayedPosts, loadComments });

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

  const shouldShowSentinel = !showSkeletons && displayedPosts.length < posts.length;

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

      if (!displayedPosts.length) return null;

      const direction = step >= 0 ? 1 : -1;

      let nextIndex = startIndex + direction;

      while (nextIndex >= 0 && nextIndex < displayedPosts.length) {

        const candidate = displayedPosts[nextIndex];

        if (!candidate) break;

        const items = getLightboxItemsForPost(candidate);

        if (items.length) {

          return { post: candidate, items, index: nextIndex };

        }

        nextIndex += direction;

      }

      return null;

    },

    [displayedPosts, getLightboxItemsForPost],

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

    displayedPosts,

    timeAgo,

    onHighlightPost: highlightPost,

  });

  const {

    lightbox,

    openLightbox,

    closeLightbox,

    navigate: navigateLightbox,

  } = useFeedLightbox();

  React.useEffect(() => {
    if (!focusPostId) {
      openedFocusRef.current = null;
      return;
    }

    const target = focusPostId.trim();
    if (!target || !displayedPosts.length) return;
    if (openedFocusRef.current === target) return;

    const post = displayedPosts.find((entry) => entry.id === target);
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
  }, [displayedPosts, focusPostId, getLightboxItemsForPost, openLightbox]);

  const handleNavigateAttachment = React.useCallback(

    (step: number, options?: { loop?: boolean }) => navigateLightbox(step, options),

    [navigateLightbox],

  );

  const handleNavigatePost = React.useCallback(

    (step: number) => {

      if (!lightbox) return;

      const currentIndex = displayedPosts.findIndex((entry) => entry.id === lightbox.postId);

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

    [displayedPosts, findSiblingPost, lightbox, openLightbox],

  );

  const handleSummarizeFeed = React.useCallback(() => {

    void summarizeFeed();

  }, [summarizeFeed]);

  const activeCommentPost = React.useMemo(

    () =>

      activeComment

        ? posts.find((post) => post.id === activeComment.postId) ?? null

        : null,

    [activeComment, posts],

  );

  const viewerPost = lightbox

    ? displayedPosts.find((entry) => entry.id === lightbox.postId) ?? lightbox.post ?? null

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

    const currentIndex = displayedPosts.findIndex((entry) => entry.id === lightbox.postId);

    if (currentIndex === -1) {

      return { prev: false, next: false };

    }

    return {

      prev: Boolean(findSiblingPost(currentIndex, -1)),

      next: Boolean(findSiblingPost(currentIndex, 1)),

    };

  }, [displayedPosts, findSiblingPost, lightbox]);

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

  return (

    <>

      {showSkeletons ? (

        <div className={styles.feedSkeleton} aria-live="polite" aria-busy="true">

          {skeletons}
        </div>

      ) : null}
      {!showSkeletons && posts.length === 0 ? (

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

            hasPosts={displayedPosts.length > 0}

            onSummarize={handleSummarizeFeed}

          />

        </React.Suspense>

      ) : null}
      {!showSkeletons && virtualizationCount > 0 ? (

        <React.Suspense fallback={<div className={styles.feedVirtualFallback}>Rendering feed...</div>}>

          <div className={styles.feedVirtualRoot} style={{ height: `${totalVirtualHeight}px` }}>

            {virtualItems.map((virtualRow) => {

              const post = displayedPosts[virtualRow.index];

              if (!post) return null;

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

              const handlePostLightboxOpen = (payload: { postId: string; index: number; items: LightboxImageItem[] }) => {
                lightboxCacheRef.current.set(post.id, payload.items);
                openLightbox({
                  postId: post.id,
                  index: payload.index,
                  items: payload.items,
                  post,
                });
              };

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
                    onCommentClick={(currentPost, anchor) => onCommentClickOverride ? onCommentClickOverride(currentPost) : handleCommentButtonClick(currentPost, anchor)}
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
      {shouldShowSentinel ? (

        <div ref={sentinelRef} className={styles.feedSentinel} aria-hidden />

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
        />

      ) : null}
    </>

  );

}
