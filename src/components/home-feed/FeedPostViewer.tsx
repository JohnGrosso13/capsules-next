"use client";

import Link from "next/link";
import * as React from "react";
import {
  Brain,
  CaretLeft,
  CaretRight,
  HourglassHigh,
  PaperPlaneTilt,
  ShareNetwork,
  X,
} from "@phosphor-icons/react/dist/ssr";
import type Hls from "hls.js";

import styles from "@/components/home-feed.module.css";
import { FeedCardActions } from "@/components/home-feed/feed-card-actions";
import type { HomeFeedPost } from "@/hooks/useHomeFeed";
import type { LightboxImageItem } from "@/components/home-feed/feed-media-gallery";
import type { CommentThreadState, CommentSubmitPayload } from "@/components/comments/types";
import { safeRandomUUID } from "@/lib/random";
import { buildProfileHref } from "@/lib/profile/routes";
import { canRenderInlineImage } from "@/lib/media";

const HLS_MIME_HINTS = [
  "application/vnd.apple.mpegurl",
  "application/x-mpegurl",
  "application/mpegurl",
];

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
    const url = new URL(trimmed, typeof window === "undefined" ? "http://localhost" : window.location.href);
    if (url.pathname.toLowerCase().includes(".m3u8")) return true;
    const formatParam = url.searchParams.get("format");
    if (formatParam && formatParam.toLowerCase() === "m3u8") return true;
  } catch {
    /* ignore */
  }
  return false;
}

function looksLikeHlsSource(
  mimeType: string | null | undefined,
  url: string | null | undefined,
): boolean {
  return isHlsMimeType(mimeType) || isHlsUrl(url);
}

type FeedPostViewerFriendControls = {
  canTarget: boolean;
  pending: boolean;
  followState: "following" | "not_following" | null;
  onRequest?: (() => void) | null;
  onRemove?: (() => void) | null;
  onFollow?: (() => void) | null;
  onUnfollow?: (() => void) | null;
};

type FeedPostViewerProps = {
  attachment: LightboxImageItem | null;
  attachments: LightboxImageItem[];
  post: HomeFeedPost | null;
  onClose(): void;
  onNavigateAttachment(step: number, options?: { loop?: boolean }): boolean;
  onNavigatePost(step: number): void;
  canNavigatePrevPost: boolean;
  canNavigateNextPost: boolean;
  formatCount(value?: number | null): string;
  timeAgo(value?: string | null): string;
  exactTime(value?: string | null): string;
  commentThread: CommentThreadState;
  commentSubmitting: boolean;
  loadComments(postId: string): Promise<void>;
  submitComment(payload: CommentSubmitPayload): Promise<void>;
  likePending: boolean;
  onToggleLike(postId: string): void;
  remembered: boolean;
  memoryPending: boolean;
  canRemember: boolean;
  onToggleMemory(post: HomeFeedPost, desired: boolean): Promise<unknown> | unknown;
  friendControls?: FeedPostViewerFriendControls | null;
};

export function FeedPostViewer({
  attachment,
  attachments,
  post,
  onClose,
  onNavigateAttachment,
  onNavigatePost,
  canNavigatePrevPost,
  canNavigateNextPost,
  formatCount,
  timeAgo,
  exactTime,
  commentThread,
  commentSubmitting,
  loadComments,
  submitComment,
  likePending,
  onToggleLike,
  remembered,
  memoryPending,
  canRemember,
  onToggleMemory,
  friendControls,
}: FeedPostViewerProps) {
  const draftComposerRef = React.useRef<HTMLTextAreaElement | null>(null);
  const videoRef = React.useRef<HTMLVideoElement | null>(null);
  const hlsRef = React.useRef<Hls | null>(null);
  const [commentDraft, setCommentDraft] = React.useState("");
  const [commentError, setCommentError] = React.useState<string | null>(null);
  const isVideoAttachment = attachment?.kind === "video";
  const isHlsSource = React.useMemo(
    () => (isVideoAttachment ? looksLikeHlsSource(attachment?.mimeType, attachment?.fullUrl) : false),
    [attachment?.fullUrl, attachment?.mimeType, isVideoAttachment],
  );

  const hasMultipleAttachments = attachments.length > 1;
  const activeAttachmentIndex = React.useMemo(() => {
    if (!attachment) return 0;
    const matchIndex = attachments.findIndex((item) => item.id === attachment.id);
    return matchIndex === -1 ? 0 : matchIndex;
  }, [attachment, attachments]);
  const commentCount = commentThread.comments.length
    ? commentThread.comments.length
    : typeof post?.comments === "number"
      ? Math.max(0, post.comments)
      : 0;
  const likeCount = typeof post?.likes === "number" ? Math.max(0, post.likes) : 0;
  const shareCount = typeof post?.shares === "number" ? Math.max(0, post.shares) : 0;
  const viewerLiked = Boolean(post?.viewerLiked ?? post?.viewer_liked ?? false);

  const resolvedUserId =
    post?.owner_user_id ??
    post?.ownerUserId ??
    post?.author_user_id ??
    post?.authorUserId ??
    null;
  const profileHref = resolvedUserId ? buildProfileHref({ userId: resolvedUserId }) : null;
  const authorAvatar = post?.user_avatar ?? post?.userAvatar ?? null;
  const authorName = post?.user_name ?? post?.userName ?? "Assistant";
  const dialogLabel = authorName ? `${authorName}'s post` : "Post viewer";
  const memoryButtonDisabled = memoryPending || !canRemember || !post;
  const followButtonState = friendControls?.followState ?? null;
  const followButtonDisabled =
    !friendControls ||
    friendControls.pending ||
    !friendControls.canTarget ||
    (followButtonState === "following"
      ? !friendControls.onUnfollow
      : followButtonState === "not_following"
        ? !friendControls.onFollow
        : true);
  const addFriendDisabled =
    !friendControls ||
    friendControls.pending ||
    !friendControls.canTarget ||
    !friendControls.onRequest;
  const removeFriendDisabled =
    !friendControls ||
    friendControls.pending ||
    !friendControls.canTarget ||
    !friendControls.onRemove;

  React.useEffect(() => {
    if (!post?.id) return;
    if (commentThread.status !== "idle") return;
    void loadComments(post.id).catch(() => {
      /* handled via thread error state */
    });
  }, [commentThread.status, loadComments, post?.id]);

  React.useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        const advanced = onNavigateAttachment(1, { loop: false });
        if (!advanced) {
          onNavigatePost(1);
        }
      } else if (event.key === "ArrowLeft") {
        event.preventDefault();
        const advanced = onNavigateAttachment(-1, { loop: false });
        if (!advanced) {
          onNavigatePost(-1);
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose, onNavigateAttachment, onNavigatePost]);

  React.useEffect(() => {
    const node = videoRef.current;
    if (!node || !isVideoAttachment) {
      const existing = hlsRef.current;
      if (existing) {
        existing.destroy();
        hlsRef.current = null;
      }
      return undefined;
    }

    const teardown = () => {
      const existing = hlsRef.current;
      if (existing) {
        existing.destroy();
        hlsRef.current = null;
      }
    };

    if (!isHlsSource || !attachment?.fullUrl) {
      teardown();
      return undefined;
    }

    const nativeSupport =
      node.canPlayType("application/vnd.apple.mpegurl") ||
      node.canPlayType("application/x-mpegurl");
    if (nativeSupport === "probably" || nativeSupport === "maybe") {
      teardown();
      node.src = attachment.fullUrl;
      node.load();
      return () => {
        if (node.src === attachment.fullUrl) {
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
        const HlsConstructor = mod.default;
        if (!HlsConstructor || !HlsConstructor.isSupported()) {
          node.src = attachment.fullUrl;
          node.load();
          return;
        }
        const instance = new HlsConstructor({ enableWorker: true, backBufferLength: 90 });
        hlsRef.current = instance;
        instance.attachMedia(node);
        instance.on(HlsConstructor.Events.MEDIA_ATTACHED, () => {
          if (!cancelled) {
            instance.loadSource(attachment.fullUrl ?? "");
          }
        });
        instance.on(HlsConstructor.Events.ERROR, (_event, data) => {
          if (!data || !data.fatal) return;
          if (data.type === HlsConstructor.ErrorTypes.NETWORK_ERROR) {
            instance.startLoad();
          } else if (data.type === HlsConstructor.ErrorTypes.MEDIA_ERROR) {
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
          node.src = attachment.fullUrl ?? "";
          node.load();
        }
      }
    })();

    return () => {
      cancelled = true;
      teardown();
    };
  }, [attachment?.fullUrl, isHlsSource, isVideoAttachment]);

  const handleSubmitComment = React.useCallback(
    async (event?: React.FormEvent<HTMLFormElement>) => {
      if (event) {
        event.preventDefault();
      }
      if (!post?.id) return;
      const trimmed = commentDraft.trim();
      if (!trimmed.length || commentSubmitting) return;
      setCommentError(null);
      try {
        await submitComment({
          clientId: safeRandomUUID(),
          postId: post.id,
          content: trimmed,
          attachments: [],
          ts: new Date().toISOString(),
        });
        setCommentDraft("");
        draftComposerRef.current?.focus();
      } catch (error) {
        setCommentError(error instanceof Error ? error.message : "Failed to submit comment.");
      }
    },
    [commentDraft, commentSubmitting, post?.id, submitComment],
  );

  const handleOverlayClick = React.useCallback(() => {
    onClose();
  }, [onClose]);

  const handleShellClick = React.useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    event.stopPropagation();
  }, []);

  const handleCloseButtonClick = React.useCallback(
    (event: React.MouseEvent<HTMLButtonElement>) => {
      event.preventDefault();
      event.stopPropagation();
      onClose();
    },
    [onClose],
  );

  const handleMemoryToggle = React.useCallback(() => {
    if (!post || memoryPending || !canRemember) return;
    const desired = !remembered;
    try {
      void onToggleMemory(post, desired);
    } catch (error) {
      console.error("Memory toggle failed", error);
    }
  }, [canRemember, memoryPending, onToggleMemory, post, remembered]);

  const handleFollowClick = React.useCallback(() => {
    if (!friendControls) return;
    if (friendControls.followState === "following") {
      friendControls.onUnfollow?.();
    } else if (friendControls.followState === "not_following") {
      friendControls.onFollow?.();
    }
  }, [friendControls]);

  const renderMedia = () => {
    if (!attachment) {
      return (
        <div className={styles.lightboxFallback} role="status">
          No preview available for this post.
        </div>
      );
    }

    const hasDimensions =
      typeof attachment.width === "number" &&
      Number.isFinite(attachment.width) &&
      typeof attachment.height === "number" &&
      Number.isFinite(attachment.height) &&
      attachment.width > 0 &&
      attachment.height > 0;
    const widthValue = hasDimensions ? (attachment.width as number) : null;
    const heightValue = hasDimensions ? (attachment.height as number) : null;
    const rawAspectRatio =
      typeof attachment.aspectRatio === "number" && Number.isFinite(attachment.aspectRatio)
        ? attachment.aspectRatio
        : widthValue && heightValue
          ? widthValue / heightValue
          : null;
    const orientation =
      rawAspectRatio && rawAspectRatio > 0
        ? rawAspectRatio > 1.05
          ? "landscape"
          : rawAspectRatio < 0.95
            ? "portrait"
            : "square"
        : null;

    if (attachment.kind === "video") {
      const poster =
        attachment.thumbnailUrl && attachment.thumbnailUrl !== attachment.fullUrl
          ? attachment.thumbnailUrl
          : attachment.displayUrl ?? undefined;
      return (
        <div className={styles.lightboxMedia} data-orientation={orientation ?? undefined}>
          <video
            ref={videoRef}
            className={styles.lightboxVideo}
            data-hls={isHlsSource ? "true" : undefined}
            src={!isHlsSource ? attachment.fullUrl : undefined}
            controls
            playsInline
            preload="auto"
            poster={poster}
          >
            {!isHlsSource ? (
              <source src={attachment.fullUrl} type={attachment.mimeType ?? undefined} />
            ) : null}
            Your browser does not support embedded video.
          </video>
        </div>
      );
    }

    const renderable = canRenderInlineImage(attachment.mimeType, attachment.fullUrl);
    const fallbackSrc =
      [attachment.thumbnailUrl, attachment.displayUrl].find(
        (src) => typeof src === "string" && src && src !== attachment.fullUrl,
      ) ?? null;
    const imageSrc = renderable ? attachment.fullUrl : fallbackSrc;
    const imageSrcSet = renderable
      ? attachment.fullSrcSet ?? attachment.displaySrcSet ?? undefined
      : attachment.displaySrcSet ?? attachment.fullSrcSet ?? undefined;

    return (
      <div className={styles.lightboxMedia} data-orientation={orientation ?? undefined}>
        {imageSrc ? (
          // eslint-disable-next-line @next/next/no-img-element -- maintains eager load behavior
          <img
            className={styles.lightboxImage}
            src={imageSrc}
            srcSet={imageSrcSet}
            sizes="(min-width: 768px) 60vw, 90vw"
            alt={attachment.alt}
            loading="eager"
            draggable={false}
          />
        ) : (
          <div className={styles.lightboxFallback} role="status">
            Preview unavailable for this file type.
          </div>
        )}
      </div>
    );
  };

  const actionItems = [
    {
      key: "like" as const,
      label: viewerLiked ? "Liked" : "Like",
      icon: null,
      count: likeCount,
      active: viewerLiked,
      pending: likePending,
      handler: (event: React.MouseEvent<HTMLButtonElement>) => {
        event.preventDefault();
        event.stopPropagation();
        if (post) {
          onToggleLike(post.id);
        }
      },
    },
    {
      key: "share" as const,
      label: "Share",
      icon: <ShareNetwork weight="duotone" />,
      count: shareCount,
    },
  ];

  const commentHeaderLabel =
    commentThread.status === "loading" ? "Loading comments…" : `Comments (${formatCount(commentCount)})`;

  return (
    <div
      className={styles.postViewerOverlay}
      role="dialog"
      aria-modal="true"
      aria-label={dialogLabel}
      onClick={handleOverlayClick}
    >
      <div className={styles.postViewerShell} onClick={handleShellClick}>
        <button
          type="button"
          className={styles.postViewerClose}
          aria-label="Close post viewer"
          onClick={handleCloseButtonClick}
        >
          <X weight="bold" />
        </button>

        <div className={styles.postViewerStage}>
          {canNavigatePrevPost ? (
            <button
              type="button"
              className={styles.postViewerPostNav}
              data-direction="prev"
              aria-label="Previous post"
              onClick={() => onNavigatePost(-1)}
            >
              <CaretLeft weight="bold" size={28} />
            </button>
          ) : null}

          {renderMedia()}

          {hasMultipleAttachments ? (
            <div className={styles.postViewerAttachmentNav}>
              <button
                type="button"
                aria-label="Previous attachment"
                onClick={() => onNavigateAttachment(-1)}
              >
                <CaretLeft weight="bold" size={24} />
              </button>
              <span>
                {attachments.length ? activeAttachmentIndex + 1 : 0} / {attachments.length}
              </span>
              <button
                type="button"
                aria-label="Next attachment"
                onClick={() => onNavigateAttachment(1)}
              >
                <CaretRight weight="bold" size={24} />
              </button>
            </div>
          ) : null}

          {canNavigateNextPost ? (
            <button
              type="button"
              className={styles.postViewerPostNav}
              data-direction="next"
              aria-label="Next post"
              onClick={() => onNavigatePost(1)}
            >
              <CaretRight weight="bold" size={28} />
            </button>
          ) : null}

          {attachment?.name ? <div className={styles.postViewerCaption}>{attachment.name}</div> : null}
        </div>

        <aside className={styles.postViewerSidebar}>
          <header className={styles.postViewerHeader}>
            <div className={styles.postViewerAuthor}>
              <div className={styles.postViewerAvatar} aria-hidden={!profileHref}>
                {profileHref ? (
                  <Link href={profileHref} aria-label="View profile">
                    {authorAvatar ? (
                      // eslint-disable-next-line @next/next/no-img-element -- avatar decorative
                      <img src={authorAvatar} alt="" />
                    ) : (
                      authorName.slice(0, 2).toUpperCase()
                    )}
                  </Link>
                ) : authorAvatar ? (
                  // eslint-disable-next-line @next/next/no-img-element -- avatar decorative
                  <img src={authorAvatar} alt="" />
                ) : (
                  authorName.slice(0, 2).toUpperCase()
                )}
              </div>
              <div className={styles.postViewerMeta}>
                {profileHref ? (
                  <Link href={profileHref}>{authorName}</Link>
                ) : (
                  <span>{authorName}</span>
                )}
                {post?.created_at ? (
                  <time title={exactTime(post.created_at)} dateTime={post.created_at}>
                    {timeAgo(post.created_at)}
                  </time>
                ) : null}
              </div>
            </div>
            <div className={styles.postViewerControls}>
              <button
                type="button"
                className={styles.postViewerControlBtn}
                data-variant="memory"
                aria-pressed={remembered}
                aria-label={remembered ? "Remove from memories" : "Remember this post"}
                onClick={handleMemoryToggle}
                disabled={memoryButtonDisabled}
              >
                {memoryPending ? <HourglassHigh weight="duotone" /> : <Brain weight="duotone" />}
              </button>
              {followButtonState ? (
                <button
                  type="button"
                  className={styles.postViewerControlBtn}
                  data-variant="follow"
                  aria-label={followButtonState === "following" ? "Unfollow member" : "Follow member"}
                  onClick={handleFollowClick}
                  disabled={followButtonDisabled}
                >
                  {followButtonState === "following" ? "Following" : "Follow"}
                </button>
              ) : null}
              {friendControls?.onRequest ? (
                <button
                  type="button"
                  className={styles.postViewerControlBtn}
                  data-variant="friend"
                  aria-label="Send friend request"
                  onClick={() => friendControls.onRequest?.()}
                  disabled={addFriendDisabled}
                >
                  Add Friend
                </button>
              ) : null}
              {friendControls?.onRemove ? (
                <button
                  type="button"
                  className={styles.postViewerControlBtn}
                  data-variant="danger"
                  aria-label="Remove friend"
                  onClick={() => friendControls.onRemove?.()}
                  disabled={removeFriendDisabled}
                >
                  Remove
                </button>
              ) : null}
            </div>
          </header>

          {post?.content ? <div className={styles.postViewerContent}>{post.content}</div> : null}

          <FeedCardActions actions={actionItems} formatCount={formatCount} />

          <div className={styles.postViewerCommentsHeader}>
            <strong>{commentHeaderLabel}</strong>
            {post?.id ? (
              <button type="button" onClick={() => loadComments(post.id)}>
                Refresh
              </button>
            ) : null}
          </div>

          <div className={styles.postViewerComments} data-status={commentThread.status}>
            {commentThread.status === "loading" ? (
              <div className={styles.postViewerCommentSkeleton}>Loading comments…</div>
            ) : null}

            {commentThread.status === "error" ? (
              <div className={styles.postViewerCommentError} role="status">
                <p>{commentThread.error ?? "Failed to load comments."}</p>
                {post?.id ? (
                  <button type="button" onClick={() => loadComments(post.id)}>
                    Try again
                  </button>
                ) : null}
              </div>
            ) : null}

            {commentThread.comments.map((comment) => {
              const initials = (() => {
                const name = (comment.userName ?? "").trim();
                if (!name) return "??";
                const parts = name.split(/\s+/);
                return (
                  (parts[0]?.[0] ?? "").toUpperCase() + (parts[parts.length - 1]?.[0] ?? "").toUpperCase()
                );
              })();
              const commentProfileHref = comment.userId ? buildProfileHref({ userId: comment.userId }) : null;
              return (
                <article
                  key={comment.id}
                  className={styles.postViewerComment}
                  data-pending={comment.pending ? "true" : undefined}
                >
                  <div className={styles.postViewerCommentAvatar}>
                    {commentProfileHref ? (
                      <Link href={commentProfileHref} aria-label="View commenter profile">
                        {comment.userAvatar ? (
                          // eslint-disable-next-line @next/next/no-img-element -- decorative avatar
                          <img src={comment.userAvatar} alt="" />
                        ) : (
                          initials
                        )}
                      </Link>
                    ) : comment.userAvatar ? (
                      // eslint-disable-next-line @next/next/no-img-element -- decorative avatar
                      <img src={comment.userAvatar} alt="" />
                    ) : (
                      initials
                    )}
                  </div>
                  <div className={styles.postViewerCommentBody}>
                    <div className={styles.postViewerCommentMeta}>
                      <span>{comment.userName ?? "Member"}</span>
                      <time title={exactTime(comment.ts)} dateTime={comment.ts}>
                        {timeAgo(comment.ts)}
                      </time>
                    </div>
                    {comment.content ? (
                      <p className={styles.postViewerCommentText}>{comment.content}</p>
                    ) : null}
                    {comment.error ? (
                      <p className={styles.postViewerCommentError}>{comment.error}</p>
                    ) : null}
                  </div>
                </article>
              );
            })}

            {!commentThread.comments.length && commentThread.status !== "loading" ? (
              <div className={styles.postViewerCommentEmpty} role="status">
                No comments yet. Start the conversation!
              </div>
            ) : null}
          </div>

          <form className={styles.postViewerComposer} onSubmit={handleSubmitComment}>
            <textarea
              id="post-viewer-comment"
              ref={draftComposerRef}
              value={commentDraft}
              onChange={(event) => setCommentDraft(event.target.value)}
              aria-label="Write a comment"
              placeholder="Write a comment..."
              rows={3}
              disabled={!post}
            />
            {commentError ? <p className={styles.postViewerComposerError}>{commentError}</p> : null}
            <div className={styles.postViewerComposerActions}>
              <button
                type="submit"
                className={styles.postViewerComposerSubmit}
                disabled={!post || !commentDraft.trim().length || commentSubmitting}
              >
                <PaperPlaneTilt weight="fill" />
                <span>{commentSubmitting ? "Posting..." : "Post"}</span>
              </button>
            </div>
          </form>
        </aside>
      </div>
    </div>
  );
}
