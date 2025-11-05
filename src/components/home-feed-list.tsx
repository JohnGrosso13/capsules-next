"use client";

import * as React from "react";

import dynamic from "next/dynamic";

import styles from "./home-feed.module.css";

import { CaretLeft, CaretRight, X } from "@phosphor-icons/react/dist/ssr";

import type { HomeFeedPost } from "@/hooks/useHomeFeed";
import { canRenderInlineImage } from "@/lib/media";
import { shouldBypassCloudflareImages } from "@/lib/cloudflare/runtime";
import { useComposer } from "@/components/composer/ComposerProvider";
import { useOptionalFriendsDataContext } from "@/components/providers/FriendsDataProvider";
import { buildPrompterAttachment, type DocumentCardData } from "@/components/documents/document-card";
import { PostCard } from "@/components/home-feed/cards/PostCard";
import { useFeedSummary } from "@/components/home-feed/useFeedSummary";
import { useFeedComments } from "@/components/home-feed/useFeedComments";
import { useFeedCommentUI } from "@/components/home-feed/useFeedCommentUI";
import { useCurrentUser } from "@/services/auth/client";
import type { LightboxImageItem } from "@/components/home-feed/feed-media-gallery";
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

  posts: HomeFeedPost[];

  likePending: Record<string, boolean>;

  memoryPending: Record<string, boolean>;

  activeFriendTarget: string | null;

  friendActionPending: string | null;

  onToggleLike(postId: string): void;

  onToggleMemory(post: HomeFeedPost, desired: boolean): Promise<boolean | void> | boolean | void;

  onFriendRequest(post: HomeFeedPost, identifier: string): Promise<void> | void;

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

}: HomeFeedListProps) {

  const composer = useComposer();

  const { user: currentUser } = useCurrentUser();

  const friendsData = useOptionalFriendsDataContext();

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

    () => buildIdentifierSet(viewerUserId, viewerUserKey, supabaseViewerId),

    [viewerUserId, viewerUserKey, supabaseViewerId],

  );

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

    const hasPost = displayedPosts.some((post) => post.id === pendingFocusPostId);

    if (!hasPost) return;

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

  }, [pendingFocusPostId, displayedPosts]);

  const viewerEnvelope = React.useMemo(() => {

    if (!currentUser) return null;

    const provider = currentUser.provider ?? "guest";

    const envelope: Record<string, unknown> = {

      provider,

      email: currentUser.email ?? null,

      full_name: currentUser.name ?? null,

      avatar_url: currentUser.avatarUrl ?? null,

    };

    if (currentUser.provider === "clerk") {

      envelope.clerk_id = currentUser.id ?? null;

    } else {

      envelope.clerk_id = null;

    }
    envelope.key =

      currentUser.key ?? (currentUser.provider === "clerk" ? `clerk:${currentUser.id}` : currentUser.id);

    return envelope;

  }, [currentUser]);

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

    handleCloseButtonClick,

    navigate: navigateLightbox,

  } = useFeedLightbox();

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
      {!showSkeletons ? (

        <SummaryCTAIsland

          pending={feedSummaryPending}

          hasPosts={displayedPosts.length > 0}

          onSummarize={handleSummarizeFeed}

        />

      ) : null}
      {displayedPosts.map((post) => {

        const resolvedUserId =

          post.owner_user_id ??

          post.ownerUserId ??

          post.author_user_id ??

          post.authorUserId ??

          null;

        const resolvedUserKey =

          post.owner_user_key ??

          post.ownerKey ??

          post.author_user_key ??

          post.authorUserKey ??

          null;

        const friendTargetKey = resolvedUserId ?? resolvedUserKey ?? post.id;

        const menuIdentifier = `${friendTargetKey}::${post.id}`;

        const canTarget = Boolean(resolvedUserId ?? resolvedUserKey);

        const isFriendOptionOpen = activeFriendTarget === menuIdentifier;

        const isFriendActionPending = friendActionPending === menuIdentifier;

        const friendMenuConfig = {

          canTarget,

          isOpen: isFriendOptionOpen,

          isPending: isFriendActionPending,

          identifier: menuIdentifier,

          onToggle: (next: boolean) => onToggleFriendTarget(next ? menuIdentifier : null),

          onRequest: () => onFriendRequest(post, menuIdentifier),

          onRemove: () => onRemoveFriend(post, menuIdentifier),

        };

        const baseCommentCount =

          typeof post.comments === "number" ? Math.max(0, post.comments) : 0;

        const threadForPost = commentThreads[post.id] ?? null;

        const commentCount = threadForPost ? threadForPost.comments.length : baseCommentCount;

        return (

          <PostCard

            key={post.id}
            post={post}
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
            isRefreshing={isRefreshing && hasFetched}
            documentSummaryPending={documentSummaryPending}
            onToggleLike={onToggleLike}
            onToggleMemory={onToggleMemory}
            onDelete={onDelete}
            onOpenLightbox={openLightbox}
            onAskDocument={handleAskDocument}
            onSummarizeDocument={summarizeDocument}
            onCommentClick={(currentPost, anchor) => handleCommentButtonClick(currentPost, anchor)}
          />

        );

      })}
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
      {lightbox

        ? (() => {

            const current = lightbox.items[lightbox.index] ?? null;

            if (!current) return null;

            const hasMultiple = lightbox.items.length > 1;

            const hasDimensions =

              typeof current.width === "number" &&

              Number.isFinite(current.width) &&

              current.width > 0 &&

              typeof current.height === "number" &&

              Number.isFinite(current.height) &&

              current.height > 0;

            const widthValue = hasDimensions ? (current.width as number) : null;

            const heightValue = hasDimensions ? (current.height as number) : null;

            const rawLightboxAspect =

              typeof current.aspectRatio === "number" && Number.isFinite(current.aspectRatio)

                ? current.aspectRatio

                : widthValue && heightValue

                  ? widthValue / heightValue

                  : null;

            const lightboxAspectRatio =

              rawLightboxAspect && rawLightboxAspect > 0

                ? Number(rawLightboxAspect.toFixed(4))

                : null;

            const lightboxOrientation =

              lightboxAspectRatio && lightboxAspectRatio > 0

                ? lightboxAspectRatio > 1.05

                  ? "landscape"

                  : lightboxAspectRatio < 0.95

                    ? "portrait"

                    : "square"

                : null;

            return (

              <div

                className={styles.lightboxOverlay}
                role="dialog"

                aria-modal="true"

                aria-label={current.name ?? "Post attachment"}
                onClick={closeLightbox}
              >

                <div

                  className={styles.lightboxContent}
                  onClick={(event) => event.stopPropagation()}
                >

                  <button

                    type="button"

                    className={styles.lightboxClose}
                    onClick={handleCloseButtonClick}
                    aria-label="Close attachment viewer"

                  >

                    <X weight="bold" size={22} />

                  </button>

                  <div

                    className={styles.lightboxBody}
                    data-has-nav={hasMultiple ? "true" : undefined}
                  >

                    {hasMultiple ? (

                      <>

                        <button

                          type="button"

                          className={styles.lightboxNav}
                          data-direction="prev"

                          onClick={() => navigateLightbox(-1)}
                          aria-label="Previous attachment"

                        >

                          <CaretLeft weight="bold" size={26} />

                        </button>

                        <button

                          type="button"

                          className={styles.lightboxNav}
                          data-direction="next"

                          onClick={() => navigateLightbox(1)}
                          aria-label="Next attachment"

                        >

                          <CaretRight weight="bold" size={26} />

                        </button>

                      </>

                    ) : null}
                    <div

                      className={styles.lightboxMedia}
                      data-orientation={lightboxOrientation ?? undefined}
                    >

                      {current.kind === "video" ? (

                        <video

                          className={styles.lightboxVideo}
                          controls

                          playsInline

                          preload="auto"

                        >

                          <source src={current.fullUrl} type={current.mimeType ?? undefined} />

                          Your browser does not support embedded video.

                        </video>

                      ) : (() => {

                        const renderable = canRenderInlineImage(current.mimeType, current.fullUrl);

                        const fallbackSrc = [current.thumbnailUrl, current.displayUrl]

                          .find((src) => src && src !== current.fullUrl)

                          ?? null;

                        const imageSrc = renderable ? current.fullUrl : fallbackSrc;

                        const imageSrcSet = renderable

                          ? current.fullSrcSet ?? current.displaySrcSet ?? undefined

                          : current.displaySrcSet ?? current.fullSrcSet ?? undefined;

                        if (!imageSrc) {

                          return (

                            <div className={styles.lightboxFallback} role="status">

                              Preview unavailable for this file type.

                            </div>

                          );

                        }
                        return (

                          // eslint-disable-next-line @next/next/no-img-element -- maintain lightbox srcset + eager load without reliable dimensions for next/image

                          <img

                            className={styles.lightboxImage}
                            src={imageSrc}
                            srcSet={imageSrcSet}
                            sizes="(min-width: 768px) 70vw, 90vw"

                            alt={current.alt}
                            loading="eager"

                            draggable={false}
                          />

                        );

                      })()}
                    </div>

                  </div>

                  {current.name ? (

                    <div className={styles.lightboxCaption}>{current.name}</div>

                  ) : null}
                </div>

              </div>

            );

          })()

        : null}
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
type FeedPollProps = {

  postId: string;

  poll: NonNullable<HomeFeedPost["poll"]>;

  formatCount: (value?: number | null) => string;

};

