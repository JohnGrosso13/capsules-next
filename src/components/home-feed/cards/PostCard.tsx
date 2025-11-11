"use client";

import Link from "next/link";
import * as React from "react";
import {
  Brain,
  ChatCircle,
  ShareNetwork,
  DotsThreeCircleVertical,
  Trash,
  HourglassHigh,
} from "@phosphor-icons/react/dist/ssr";

import styles from "@/components/home-feed.module.css";
import type { HomeFeedPost } from "@/hooks/useHomeFeed";
import { normalizeMediaUrl } from "@/lib/media";
import { FeedLazyImage } from "@/components/home-feed/feed-lazy-image";
import { FeedMediaGallery, type LightboxImageItem } from "@/components/home-feed/feed-media-gallery";
import { CommentsPreview } from "@/components/home-feed/comments-preview";
import { FeedCardActions, type FeedCardAction } from "@/components/home-feed/feed-card-actions";
import { buildProfileHref } from "@/lib/profile/routes";
import { buildPostMediaCollections, type PostMediaCollections } from "@/components/home-feed/utils";
import {
  DocumentAttachmentCard,
  buildDocumentCardData,
  type DocumentCardData,
} from "@/components/documents/document-card";
import { PostMenu } from "@/components/posts/PostMenu";
import type { CommentThreadState } from "@/components/comments/types";
import { FeedPoll } from "@/components/home-feed/cards/FeedPoll";

type FriendMenuConfig = {
  canTarget: boolean;
  isOpen: boolean;
  isPending: boolean;
  onToggle(open: boolean): void;
  onRequest(): void;
  onRemove(): void;
  followState?: "following" | "not_following";
  onFollow?: (() => void) | null;
  onUnfollow?: (() => void) | null;
};

type PostCardProps = {
  /** When set to "preview", hides bottom action row to avoid conflicts inside Composer preview. */
  variant?: "full" | "preview";
  post: HomeFeedPost;
  viewerIdentifiers: Set<string>;
  likePending: boolean;
  memoryPending: boolean;
  remembered: boolean;
  canRemember: boolean;
  friendMenu: FriendMenuConfig;
  cloudflareEnabled: boolean;
  currentOrigin: string | null;
  formatCount: (value?: number | null) => string;
  timeAgo: (iso?: string | null) => string;
  exactTime: (iso?: string | null) => string;
  commentCount: number;
  commentThread?: CommentThreadState | null;
  onRequestComments?: (postId: string) => void | Promise<void>;
  isRefreshing: boolean;
  documentSummaryPending: Record<string, boolean>;
  onToggleLike(postId: string): void;
  onToggleMemory(post: HomeFeedPost, desired: boolean): Promise<unknown> | boolean | void;
  onDelete(postId: string): void;
  onOpenLightbox(payload: { postId: string; index: number; items: LightboxImageItem[] }): void;
  onAskDocument(doc: DocumentCardData): void;
  onSummarizeDocument(doc: DocumentCardData): void;
  onCommentClick(post: HomeFeedPost, anchor: HTMLElement): void;
};

export function PostCard({
  post,
  viewerIdentifiers,
  likePending,
  memoryPending,
  remembered,
  canRemember,
  friendMenu,
  cloudflareEnabled,
  currentOrigin,
  formatCount,
  timeAgo,
  exactTime,
  commentCount,
  commentThread,
  onRequestComments,
  isRefreshing,
  documentSummaryPending,
  onToggleLike,
  onToggleMemory,
  onDelete,
  onOpenLightbox,
  onAskDocument,
  onSummarizeDocument,
  onCommentClick,
  variant = "full",
}: PostCardProps) {
  const articleRef = React.useRef<HTMLElement | null>(null);
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

  const ownerIdentifierSet = React.useMemo(() => {
    const values = [
      resolvedUserId,
      resolvedUserKey,
      post.owner_user_id,
      post.ownerUserId,
      post.author_user_id,
      post.authorUserId,
      post.owner_user_key,
      post.ownerKey,
      post.author_user_key,
      post.authorUserKey,
    ].filter((value): value is string => typeof value === "string" && value.trim().length > 0);
    return new Set(values.map((value) => value.trim()));
  }, [post, resolvedUserId, resolvedUserKey]);

  const profileHref = React.useMemo(
    () => buildProfileHref({ userId: resolvedUserId, userKey: resolvedUserKey }),
    [resolvedUserId, resolvedUserKey],
  );

  const viewerOwnsPost = React.useMemo(() => {
    if (!ownerIdentifierSet.size || !viewerIdentifiers.size) return false;
    for (const identifier of viewerIdentifiers.values()) {
      if (ownerIdentifierSet.has(identifier)) return true;
    }
    return false;
  }, [ownerIdentifierSet, viewerIdentifiers]);

  const avatarNode = (
    <span className={styles.avatarWrap} aria-hidden>
      {post.user_avatar ? (
        <FeedLazyImage
          className={styles.avatarImg}
          src={post.user_avatar}
          alt=""
          width={44}
          height={44}
          sizes="44px"
          loading="lazy"
          unoptimized
        />
      ) : (
        <span className={styles.avatar} />
      )}
    </span>
  );

  const likeCount = typeof post.likes === "number" ? Math.max(0, post.likes) : 0;
  const shareCount = typeof post.shares === "number" ? Math.max(0, post.shares) : 0;
  const viewerLiked = Boolean(post.viewerLiked ?? post.viewer_liked ?? false);

  const mediaCollections: PostMediaCollections = React.useMemo(
    () =>
      buildPostMediaCollections({
        post,
        initialMedia: normalizeMediaUrl(post.mediaUrl),
        cloudflareEnabled,
        currentOrigin,
      }),
    [post, cloudflareEnabled, currentOrigin],
  );

  const { galleryItems, fileAttachments } = mediaCollections;

  const documentCards = React.useMemo(
    () =>
      fileAttachments.map((file) =>
        buildDocumentCardData({
          id: file.id,
          url: file.url,
          name: file.name,
          mimeType: file.mimeType,
          meta: file.meta ?? null,
          uploadSessionId: file.uploadSessionId ?? null,
        }),
      ),
    [fileAttachments],
  );

  const handleMemoryToggle = React.useCallback(() => {
    if (memoryPending || !canRemember) return;
    const desired = !remembered;
    try {
      const outcome = onToggleMemory(post, desired);
      void Promise.resolve(outcome).catch((error) => {
        console.error("Memory toggle error", error);
      });
    } catch (error) {
      console.error("Memory toggle error", error);
    }
  }, [memoryPending, canRemember, onToggleMemory, post, remembered]);

  const actionItems: FeedCardAction[] = React.useMemo(
    () => [
      {
        key: "like",
        label: viewerLiked ? "Liked" : "Like",
        icon: null,
        count: likeCount,
        active: viewerLiked,
        pending: likePending,
        handler: (event) => {
          event.preventDefault();
          event.stopPropagation();
          onToggleLike(post.id);
        },
      },
      {
        key: "comment",
        label: "Comment",
        icon: <ChatCircle weight="duotone" />,
        count: commentCount,
        handler: (event) => {
          event.preventDefault();
          event.stopPropagation();
          onCommentClick(post, event.currentTarget);
        },
      },
      {
        key: "share",
        label: "Share",
        icon: <ShareNetwork weight="duotone" />,
        count: shareCount,
      },
    ],
    [viewerLiked, likeCount, likePending, onToggleLike, post, commentCount, onCommentClick, shareCount],
  );

  return (
    <article
      className={styles.card}
      ref={articleRef}
      data-variant={variant}
      data-post-id={post.id}
      data-refreshing={isRefreshing ? "true" : undefined}
      aria-busy={isRefreshing ? true : undefined}
    >
      <header className={styles.cardHead}>
        <div className={styles.userMeta}>
          {profileHref ? (
            <Link href={profileHref} className={styles.avatarLink} aria-label="View profile">
              {avatarNode}
            </Link>
          ) : (
            avatarNode
          )}

          {profileHref ? (
            <Link href={profileHref} className={styles.userName}>
              {post.user_name || "Capsules AI"}
            </Link>
          ) : (
            <div className={styles.userName}>{post.user_name || "Capsules AI"}</div>
          )}

          <span className={styles.separator} aria-hidden>
            {"\u2022"}
          </span>

          <time
            className={styles.timestamp}
            title={exactTime(post.created_at)}
            dateTime={post.created_at ?? undefined}
          >
            {timeAgo(post.created_at)}
          </time>
        </div>

        <div className={styles.cardControls}>
          <button
            type="button"
            className={styles.iconBtn}
            data-variant="memory"
            data-active={remembered ? "true" : "false"}
            onClick={handleMemoryToggle}
            disabled={memoryPending || !canRemember}
            aria-pressed={remembered ? true : undefined}
          >
            {memoryPending ? <HourglassHigh weight="duotone" /> : <Brain weight="duotone" />}
          </button>

          <PostMenu
            canTarget={friendMenu.canTarget}
            pending={friendMenu.isPending}
            open={friendMenu.isOpen}
            onOpenChange={(next) => friendMenu.onToggle(next)}
            onAddFriend={friendMenu.onRequest}
            onRemoveFriend={friendMenu.onRemove}
            {...(friendMenu.followState
              ? {
                  followState: friendMenu.followState,
                  onFollow: friendMenu.onFollow ?? null,
                  onUnfollow: friendMenu.onUnfollow ?? null,
                }
              : {})}
            renderTrigger={({ ref, toggle, open, pending }) => (
              <button
                type="button"
                className={styles.iconBtn}
                aria-label="Post options"
                aria-haspopup="menu"
                aria-expanded={open}
                onClick={toggle}
                disabled={pending}
                ref={ref}
              >
                <DotsThreeCircleVertical weight="duotone" />
              </button>
            )}
          />

          {viewerOwnsPost ? (
            <button
              type="button"
              className={styles.iconBtn}
              data-variant="danger"
              onClick={() => onDelete(post.id)}
              aria-label="Delete post"
              title="Delete post"
            >
              <Trash weight="duotone" />
            </button>
          ) : null}
        </div>
      </header>

      <div className={styles.cardBody}>
        {post.content ? <div className={styles.postText}>{post.content}</div> : null}
        {post.poll ? <FeedPoll postId={post.id} poll={post.poll} formatCount={formatCount} /> : null}
      </div>

      {galleryItems.length ? (
        <FeedMediaGallery
          postId={post.id}
          items={galleryItems}
          onOpenLightbox={onOpenLightbox}
        />
      ) : null}

      {documentCards.length ? (
        <div className={styles.documentGrid}>
          {documentCards.map((doc) => (
            <DocumentAttachmentCard
              key={doc.id}
              doc={doc}
              formatCount={formatCount}
              onAsk={() => onAskDocument(doc)}
              onSummarize={() => onSummarizeDocument(doc)}
              summarizePending={Boolean(documentSummaryPending[doc.id])}
            />
          ))}
        </div>
      ) : null}

      {/* Inline comments preview (first 2–3) */}
      {variant === "full" ? (
        <CommentsPreview
          postId={post.id}
          thread={commentThread ?? null}
          loadComments={(id) => Promise.resolve(onRequestComments?.(id))}
          timeAgo={timeAgo}
          exactTime={exactTime}
          onOpenFull={async () => {
            const anchor =
              articleRef.current ??
              (typeof document !== "undefined" ? document.body ?? null : null);
            if (!anchor) return;
            onCommentClick(post, anchor);
          }}
        />
      ) : null}

      {variant === "full" ? <FeedCardActions actions={actionItems} formatCount={formatCount} /> : null}
    </article>
  );
}
