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
import { useCurrentUser } from "@/services/auth/client";
import type { LightboxImageItem } from "@/components/home-feed/feed-media-gallery";
import type {
  CommentAttachment,
  CommentModel,
  CommentThreadState,
  CommentSubmitPayload,
} from "@/components/comments/types";
import { EMPTY_THREAD_STATE } from "@/components/comments/types";
import { safeRandomUUID } from "@/lib/random";

const CommentPanel = dynamic(

  () => import("@/components/comments/CommentPanel").then((mod) => mod.CommentPanel),

  {

    ssr: false,

    loading: () => <div className={styles.commentPanelFallback}>Loading comments</div>,

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
function createEmptyThreadState(): CommentThreadState {

  return { status: "idle", comments: [], error: null };

}
function normalizeCommentFromApi(

  raw: Record<string, unknown>,

  fallbackPostId: string,

): CommentModel {

  const rawId = raw.id;

  const id =

    typeof rawId === "string" && rawId.trim().length ? rawId.trim() : safeRandomUUID();

  const postIdValue = raw.postId ?? raw.post_id ?? fallbackPostId;

  const postId =

    typeof postIdValue === "string" && postIdValue.trim().length

      ? postIdValue.trim()

      : fallbackPostId;

  const content =

    typeof raw.content === "string" ? raw.content : typeof raw.body === "string" ? raw.body : "";

  const userName =

    typeof raw.userName === "string"

      ? raw.userName

      : typeof raw.user_name === "string"

        ? raw.user_name

        : null;

  const userAvatar =

    typeof raw.userAvatar === "string"

      ? raw.userAvatar

      : typeof raw.user_avatar === "string"

        ? raw.user_avatar

        : null;

  const capsuleId =

    typeof raw.capsuleId === "string"

      ? raw.capsuleId

      : typeof raw.capsule_id === "string"

        ? raw.capsule_id

        : null;

  const tsValue = raw.ts ?? raw.created_at ?? new Date().toISOString();

  const ts = typeof tsValue === "string" && tsValue.trim().length ? tsValue : new Date().toISOString();

  const attachmentsRaw = Array.isArray((raw as { attachments?: unknown }).attachments)

    ? ((raw as { attachments?: unknown[] }).attachments as unknown[])

    : [];

  const attachments = attachmentsRaw

    .map((entry) => {

      if (!entry || typeof entry !== "object") return null;

      const record = entry as Record<string, unknown>;

      const attachmentId =

        typeof record.id === "string" && record.id.trim().length ? record.id.trim() : safeRandomUUID();

      const url =

        typeof record.url === "string" && record.url.trim().length ? record.url.trim() : null;

      if (!url) return null;

      const name =

        typeof record.name === "string" && record.name.trim().length

          ? record.name.trim()

          : null;

      const mimeType =

        typeof record.mimeType === "string"

          ? record.mimeType

          : typeof record.mime_type === "string"

            ? record.mime_type

            : null;

      const thumbnail =

        typeof record.thumbnailUrl === "string"

          ? record.thumbnailUrl

          : typeof record.thumbnail_url === "string"

            ? record.thumbnail_url

            : null;

      const sizeValue = record.size;

      const size =

        typeof sizeValue === "number" && Number.isFinite(sizeValue)

          ? sizeValue

          : typeof sizeValue === "string"

            ? Number.parseInt(sizeValue, 10) || null

            : null;

      const storageKey =

        typeof record.storageKey === "string"

          ? record.storageKey

          : typeof record.storage_key === "string"

            ? record.storage_key

            : null;

      const sessionId =

        typeof record.sessionId === "string"

          ? record.sessionId

          : typeof record.session_id === "string"

            ? record.session_id

            : null;

      const source =

        typeof record.source === "string" && record.source.trim().length

          ? record.source.trim()

          : null;

      const attachmentRecord: CommentAttachment = {

        id: attachmentId,

        url,

        name,

        mimeType,

        thumbnailUrl: thumbnail,

        size: size ?? null,

        storageKey,

        sessionId,

        source,

      };

      return attachmentRecord;

    })

    .filter((attachment): attachment is CommentAttachment => attachment !== null);

  return {

    id,

    postId,

    content,

    userName,

    userAvatar,

    capsuleId,

    ts,

    attachments,

    userId:

      typeof raw.userId === "string"

        ? raw.userId

        : typeof raw.user_id === "string"

          ? raw.user_id

          : null,

    pending: false,

    error: null,

  };

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

  const [lightbox, setLightbox] = React.useState<{

    postId: string;

    index: number;

    items: LightboxImageItem[];

  } | null>(null);

  const INITIAL_BATCH = 6;

  const BATCH_SIZE = 6;

  const [visibleCount, setVisibleCount] = React.useState(INITIAL_BATCH);

  const sentinelRef = React.useRef<HTMLDivElement | null>(null);

  const [commentThreads, setCommentThreads] = React.useState<Record<string, CommentThreadState>>({});

  const [commentSubmitting, setCommentSubmitting] = React.useState<Record<string, boolean>>({});

  const [activeComment, setActiveComment] = React.useState<{ postId: string } | null>(null);

  const commentAnchorRef = React.useRef<HTMLElement | null>(null);

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

  const closeLightbox = React.useCallback(() => {

    setLightbox(null);

  }, []);

  const handleOpenLightbox = React.useCallback(

    (payload: { postId: string; index: number; items: LightboxImageItem[] }) => {

      setLightbox(payload);

    },

    [],

  );

  const handleCloseButtonClick = React.useCallback(

    (event: React.MouseEvent<HTMLButtonElement>) => {

      event.preventDefault();

      event.stopPropagation();

      closeLightbox();

    },

    [closeLightbox],

  );

  const navigateLightbox = React.useCallback((step: number) => {

    setLightbox((prev) => {

      if (!prev || !prev.items.length) return prev;

      const total = prev.items.length;

      const nextIndex = (((prev.index + step) % total) + total) % total;

      return {

        ...prev,

        index: nextIndex,

      };

    });

  }, []);

  React.useEffect(() => {

    if (!lightbox) return undefined;

    const handleKeyDown = (event: KeyboardEvent) => {

      if (event.key === "Escape") {

        event.preventDefault();

        closeLightbox();

      } else if (event.key === "ArrowRight") {

        event.preventDefault();

        navigateLightbox(1);

      } else if (event.key === "ArrowLeft") {

        event.preventDefault();

        navigateLightbox(-1);

      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => window.removeEventListener("keydown", handleKeyDown);

  }, [lightbox, closeLightbox, navigateLightbox]);

  React.useEffect(() => {

    if (!lightbox) return undefined;

    const originalOverflow = document.body.style.overflow;

    document.body.style.overflow = "hidden";

    return () => {

      document.body.style.overflow = originalOverflow;

    };

  }, [lightbox]);

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



  const loadComments = React.useCallback(

    async (postId: string) => {

      setCommentThreads((previous) => {

        const prevState = previous[postId] ?? createEmptyThreadState();

        return {

          ...previous,

          [postId]: { ...prevState, status: "loading", error: null },

        };

      });

      try {

        const response = await fetch(`/api/comments?postId=${encodeURIComponent(postId)}`, {

          method: "GET",

          credentials: "include",

        });

        if (!response.ok) {

          const text = await response.text().catch(() => "");

          throw new Error(text || "Failed to load comments.");

        }
        const payload = (await response.json().catch(() => null)) as {

          comments?: unknown[];

        } | null;

        const comments = Array.isArray(payload?.comments)

          ? payload!.comments

              .map((entry) =>

                entry && typeof entry === "object"

                  ? normalizeCommentFromApi(entry as Record<string, unknown>, postId)

                  : null,

              )

              .filter((entry): entry is CommentModel => Boolean(entry))

          : [];

        setCommentThreads((previous) => ({

          ...previous,

          [postId]: { status: "loaded", comments, error: null },

        }));

      } catch (error) {

        const message = error instanceof Error ? error.message : "Failed to load comments.";

        setCommentThreads((previous) => {

          const prevState = previous[postId] ?? createEmptyThreadState();

          if (prevState.comments.length) {

            return {

              ...previous,

              [postId]: { status: "loaded", comments: prevState.comments, error: message },

            };

          }
          return {

            ...previous,

            [postId]: { status: "error", comments: [], error: message },

          };

        });

        throw error;

      }
    },

    [],

  );

  const handleHighlightPost = React.useCallback(

    (postId: string, options?: { focusComment?: boolean }) => {

      const hasPost = displayedPosts.some((entry) => entry.id === postId);

      if (!hasPost) return;

      if (typeof window !== "undefined") {

        const escapedId =

          typeof CSS !== "undefined" && typeof CSS.escape === "function"

            ? CSS.escape(postId)

            : postId.replace(/["'\\]/g, "\\$&");

        const card = document.querySelector<HTMLElement>(`[data-post-id="${escapedId}"]`);

        if (card) {

          card.scrollIntoView({ behavior: "smooth", block: "center" });

          card.setAttribute("data-summary-flash", "true");

          window.setTimeout(() => {

            card.removeAttribute("data-summary-flash");

          }, 2400);

        }
        if (options?.focusComment) {

          const anchor =

            (card?.querySelector<HTMLElement>('[data-action-key="comment"]') ?? card) ?? null;

          commentAnchorRef.current = anchor;

          setActiveComment({ postId });

          void loadComments(postId);

        }

      } else if (options?.focusComment) {

        setActiveComment({ postId });

        void loadComments(postId);

      }

    },

    [displayedPosts, loadComments, setActiveComment],

  );

  const {

    documentSummaryPending,

    feedSummaryPending,

    summarizeDocument,

    summarizeFeed,

  } = useFeedSummary({

    displayedPosts,

    timeAgo,

    onHighlightPost: handleHighlightPost,

  });

  const handleSummarizeFeed = React.useCallback(() => {

    void summarizeFeed();

  }, [summarizeFeed]);

  const submitComment = React.useCallback(

    async (payload: CommentSubmitPayload) => {

      const optimistic: CommentModel = {

        id: payload.clientId,

        postId: payload.postId,

        content: payload.content,

        userName:

          payload.userName ??

          currentUser?.name ??

          currentUser?.email ??

          "You",

        userAvatar: payload.userAvatar ?? currentUser?.avatarUrl ?? null,

        capsuleId: payload.capsuleId ?? null,

        ts: payload.ts,

        attachments: payload.attachments,

        userId: viewerUserId,

        pending: true,

        error: null,

      };

      setCommentThreads((previous) => {

        const prevState = previous[payload.postId] ?? createEmptyThreadState();

        return {

          ...previous,

          [payload.postId]: {

            status: "loaded",

            comments: [...prevState.comments, optimistic],

            error: null,

          },

        };

      });

      setCommentSubmitting((previous) => ({ ...previous, [payload.postId]: true }));

      try {

        const response = await fetch("/api/comments", {

          method: "POST",

          credentials: "include",

          headers: { "Content-Type": "application/json" },

          body: JSON.stringify({

            comment: {

              id: payload.clientId,

              postId: payload.postId,

              content: payload.content,

              attachments: payload.attachments,

              capsuleId: payload.capsuleId ?? null,

              capsule_id: payload.capsuleId ?? null,

              ts: payload.ts,

              userName:

                payload.userName ??

                currentUser?.name ??

                currentUser?.email ??

                null,

              userAvatar: payload.userAvatar ?? currentUser?.avatarUrl ?? null,

              source: "web",

            },

            user: viewerEnvelope,

          }),

        });

        if (!response.ok) {

          const text = await response.text().catch(() => "");

          throw new Error(text || "Failed to submit comment.");

        }
        const json = (await response.json().catch(() => null)) as { comment?: unknown } | null;

        const persisted =

          json?.comment && typeof json.comment === "object"

            ? normalizeCommentFromApi(json.comment as Record<string, unknown>, payload.postId)

            : { ...optimistic, pending: false };

        setCommentThreads((previous) => {

          const prevState = previous[payload.postId] ?? createEmptyThreadState();

          const comments = prevState.comments.map((entry) =>

            entry.id === payload.clientId ? { ...persisted, pending: false } : entry,

          );

          return {

            ...previous,

            [payload.postId]: { status: "loaded", comments, error: null },

          };

        });

      } catch (error) {

        const message = error instanceof Error ? error.message : "Failed to submit comment.";

        setCommentThreads((previous) => {

          const prevState = previous[payload.postId] ?? createEmptyThreadState();

          const comments = prevState.comments.filter((entry) => entry.id !== payload.clientId);

          return {

            ...previous,

            [payload.postId]: {

              status: "error",

              comments,

              error: message,

            },

          };

        });

        throw error;

      } finally {

        setCommentSubmitting((previous) => {

          const next = { ...previous };

          delete next[payload.postId];

          return next;

        });

      }
    },

    [currentUser?.avatarUrl, currentUser?.email, currentUser?.name, viewerEnvelope, viewerUserId],

  );

  const handleCommentButtonClick = React.useCallback((post: HomeFeedPost, target: HTMLElement) => {

    setActiveComment((previous) => {

      const next = previous?.postId === post.id ? null : { postId: post.id };

      commentAnchorRef.current = next ? target : null;

      return next;

    });

  }, []);

  const closeComments = React.useCallback(() => {

    setActiveComment(null);

    commentAnchorRef.current = null;

  }, []);



  React.useEffect(() => {

    if (!activeComment) return;

    if (posts.some((post) => post.id === activeComment.postId)) return;

    closeComments();

  }, [activeComment, closeComments, posts]);

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
            onOpenLightbox={handleOpenLightbox}
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

