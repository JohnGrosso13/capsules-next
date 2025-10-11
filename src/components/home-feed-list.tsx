"use client";

import * as React from "react";
import Image from "next/image";

import styles from "./home.module.css";
import {
  Brain,
  Heart,
  ChatCircle,
  ShareNetwork,
  DotsThreeCircleVertical,
  Trash,
  HourglassHigh,
} from "@phosphor-icons/react/dist/ssr";
import { PostMenu } from "@/components/posts/PostMenu";
import { normalizeMediaUrl } from "@/lib/media";
import type { HomeFeedPost } from "@/hooks/useHomeFeed";
import { resolveToAbsoluteUrl } from "@/lib/url";
import {
  buildImageVariants,
  pickBestDisplayVariant,
  pickBestFullVariant,
} from "@/lib/cloudflare/images";
import type { CloudflareImageVariantSet } from "@/lib/cloudflare/images";
import {
  buildLocalImageVariants,
  containsCloudflareResize,
  shouldBypassCloudflareImages,
} from "@/lib/cloudflare/runtime";

type LazyImageProps = React.ComponentProps<typeof Image>;

const LazyImage = React.forwardRef<HTMLImageElement, LazyImageProps>(
  ({ loading, alt, ...rest }, ref) => (
    <Image ref={ref} loading={loading ?? "lazy"} alt={alt} {...rest} />
  ),
);

LazyImage.displayName = "LazyImage";

type ActionKey = "like" | "comment" | "share";

function shouldRebuildVariantsForEnvironment(
  variants: CloudflareImageVariantSet | null | undefined,
  cloudflareEnabled: boolean,
): boolean {
  if (!cloudflareEnabled) return true;
  if (!variants) return true;
  if (containsCloudflareResize(variants.feed)) return true;
  if (containsCloudflareResize(variants.full)) return true;
  if (containsCloudflareResize(variants.thumb)) return true;
  return false;
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
}: HomeFeedListProps) {
  const [lightbox, setLightbox] = React.useState<{
    postId: string;
    index: number;
    items: Array<{
      id: string;
      kind: "image" | "video";
      fullUrl: string;
      fullSrcSet?: string | null;
      displayUrl: string;
      displaySrcSet?: string | null;
      name: string | null;
      alt: string;
      mimeType: string | null;
    }>;
  } | null>(null);

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
  const displayedPosts = showSkeletons ? [] : posts.slice(0, visibleLimit || posts.length);
  const skeletons = React.useMemo(
    () =>
      Array.from({ length: 4 }, (_, index) => (
        <article
          key={`skeleton-${index}`}
          className={`${styles.card} ${styles.skeletonCard}`.trim()}
          aria-hidden="true"
        >
          <div className={styles.skeletonBackdrop} />
          <header className={`${styles.cardHead} ${styles.skeletonHead}`.trim()}>
            <span className={`${styles.avatarWrap} ${styles.skeletonAvatar}`.trim()} />
            <div className={styles.skeletonHeaderMeta}>
              <span className={`${styles.skeletonLine} ${styles.skeletonLineWide}`.trim()} />
              <span className={`${styles.skeletonLine} ${styles.skeletonLineShort}`.trim()} />
            </div>
            <span className={`${styles.iconBtn} ${styles.skeletonIconBtn}`.trim()} />
          </header>
          <div className={`${styles.cardBody} ${styles.skeletonBody}`.trim()}>
            <span className={`${styles.skeletonLine} ${styles.skeletonLineWide}`.trim()} />
            <span className={`${styles.skeletonLine} ${styles.skeletonLineMedium}`.trim()} />
            <span className={`${styles.skeletonLine} ${styles.skeletonLineShort}`.trim()} />
          </div>
          <div className={`${styles.mediaGallery} ${styles.skeletonMedia}`.trim()}>
            <span className={styles.skeletonTile} />
            <span className={styles.skeletonTile} />
            <span className={styles.skeletonTile} />
          </div>
          <footer className={`${styles.actionBar} ${styles.skeletonActions}`.trim()}>
            <span className={`${styles.skeletonPill} ${styles.skeletonPillWide}`.trim()} />
            <span className={`${styles.skeletonPill} ${styles.skeletonPillMedium}`.trim()} />
            <span className={`${styles.skeletonPill} ${styles.skeletonPillMedium}`.trim()} />
          </footer>
        </article>
      )),
    [],
  );

  const shouldShowSentinel = !showSkeletons && displayedPosts.length < posts.length;
  const cloudflareEnabled = React.useMemo(() => !shouldBypassCloudflareImages(), []);
  const currentOrigin = React.useMemo(
    () => (typeof window !== "undefined" ? window.location.origin : undefined),
    [],
  );

  const closeLightbox = React.useCallback(() => {
    setLightbox(null);
  }, []);

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
      {displayedPosts.map((post) => {
        let media = normalizeMediaUrl(post.mediaUrl);
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
        const likeCount = typeof post.likes === "number" ? Math.max(0, post.likes) : 0;
        const commentCount = typeof post.comments === "number" ? Math.max(0, post.comments) : 0;
        const shareCount = typeof post.shares === "number" ? Math.max(0, post.shares) : 0;
        const viewerLiked = Boolean(post.viewerLiked ?? post.viewer_liked ?? false);
        const remembered = Boolean(post.viewerRemembered ?? post.viewer_remembered ?? false);
        const isLikePending = Boolean(likePending[post.id]);
        const isMemoryPending = Boolean(memoryPending[post.id]);
        const handleMemoryToggle = () => {
          if (isMemoryPending || !canRemember) return;
          const desired = !remembered;
          try {
            const result = onToggleMemory(post, desired);
            if (result && typeof (result as Promise<unknown>).then === "function") {
              (result as Promise<unknown>).catch((error) => {
                console.error("Memory toggle error", error);
              });
            }
          } catch (error) {
            console.error("Memory toggle error", error);
          }
        };
        const actionItems: Array<{
          key: ActionKey;
          label: string;
          icon: React.ReactNode;
          count: number;
          active?: boolean;
          pending?: boolean;
          handler?: () => void;
        }> = [
          {
            key: "like",
            label: viewerLiked ? "Liked" : "Like",
            icon: null,
            count: likeCount,
            active: viewerLiked,
            pending: isLikePending,
            handler: () => onToggleLike(post.id),
          },
          {
            key: "comment",
            label: "Comment",
            icon: <ChatCircle weight="duotone" />,
            count: commentCount,
          },
          {
            key: "share",
            label: "Share",
            icon: <ShareNetwork weight="duotone" />,
            count: shareCount,
          },
        ];
        const attachmentsList = Array.isArray(post.attachments)
          ? post.attachments.filter(
              (attachment): attachment is NonNullable<HomeFeedPost["attachments"]>[number] =>
                Boolean(attachment && attachment.url),
            )
          : [];
        const inferAttachmentKind = (
          mime: string | null | undefined,
          url: string,
          storageKey?: string | null,
          thumbnailUrl?: string | null,
        ): "image" | "video" | "file" => {
          const loweredMime = mime?.toLowerCase() ?? "";
          if (loweredMime.startsWith("image/")) return "image";
          if (loweredMime.startsWith("video/")) return "video";

          const mediaSources = [url, storageKey ?? null, thumbnailUrl ?? null].map((value) =>
            typeof value === "string" ? value.toLowerCase() : "",
          );

          const hasMatch = (pattern: RegExp) => mediaSources.some((source) => pattern.test(source));

          if (hasMatch(/\.(mp4|webm|mov|m4v|avi|ogv|ogg|mkv)(\?|#|$)/)) return "video";
          if (hasMatch(/\.(png|jpe?g|gif|webp|avif|svg|heic|heif)(\?|#|$)/)) return "image";
          return "file";
        };
        const seenMedia = new Set<string>();
        const galleryItems: Array<{
          id: string;
          originalUrl: string;
          displayUrl: string;
          displaySrcSet: string | null;
          fullUrl: string;
          fullSrcSet: string | null;
          kind: "image" | "video";
          name: string | null;
          thumbnailUrl: string | null;
          mimeType: string | null;
        }> = [];
        const fileAttachments: Array<{
          id: string;
          url: string;
          name: string | null;
          mimeType: string | null;
        }> = [];
        const pushMedia = (item: {
          id: string;
          originalUrl: string;
          displayUrl: string;
          displaySrcSet: string | null;
          fullUrl: string;
          fullSrcSet: string | null;
          kind: "image" | "video";
          name: string | null;
          thumbnailUrl: string | null;
          mimeType: string | null;
        }) => {
          if (!item.originalUrl || seenMedia.has(item.originalUrl)) return;
          seenMedia.add(item.originalUrl);
          galleryItems.push(item);
        };

        if (media) {
          const inferred = inferAttachmentKind(null, media) === "video" ? "video" : "image";
          const absoluteMedia = resolveToAbsoluteUrl(media) ?? media;
          const variants =
            inferred === "image"
              ? cloudflareEnabled
                ? buildImageVariants(media, {
                    thumbnailUrl: media,
                    origin: currentOrigin ?? null,
                  })
                : buildLocalImageVariants(media, media)
              : null;
          const displayUrl =
            inferred === "image"
              ? (pickBestDisplayVariant(variants) ?? absoluteMedia)
              : absoluteMedia;
          const fullUrl =
            inferred === "image" ? (pickBestFullVariant(variants) ?? absoluteMedia) : absoluteMedia;
          const displaySrcSet =
            cloudflareEnabled && inferred === "image" ? (variants?.feedSrcset ?? null) : null;
          const fullSrcSet =
            cloudflareEnabled && inferred === "image"
              ? (variants?.fullSrcset ?? variants?.feedSrcset ?? null)
              : null;
          pushMedia({
            id: `${post.id}-primary`,
            originalUrl: variants?.original ?? absoluteMedia,
            displayUrl,
            displaySrcSet,
            fullUrl,
            fullSrcSet,
            kind: inferred,
            name: null,
            thumbnailUrl: inferred === "image" ? (variants?.thumb ?? absoluteMedia) : absoluteMedia,
            mimeType: null,
          });
        }

        attachmentsList.forEach((attachment, index) => {
          if (!attachment || !attachment.url) return;
          const kind = inferAttachmentKind(
            attachment.mimeType ?? null,
            attachment.url,
            attachment.storageKey ?? null,
            attachment.thumbnailUrl ?? null,
          );
          const baseId = attachment.id || `${post.id}-att-${index}`;
          if (kind === "image" || kind === "video") {
            let variants = attachment.variants ?? null;
            if (
              kind === "image" &&
              shouldRebuildVariantsForEnvironment(variants, cloudflareEnabled)
            ) {
              variants = cloudflareEnabled
                ? buildImageVariants(attachment.url, {
                    thumbnailUrl: attachment.thumbnailUrl ?? null,
                    origin: currentOrigin ?? null,
                  })
                : buildLocalImageVariants(attachment.url, attachment.thumbnailUrl ?? null);
            }
            const absoluteOriginal = resolveToAbsoluteUrl(attachment.url) ?? attachment.url;
            const absoluteThumb = resolveToAbsoluteUrl(attachment.thumbnailUrl ?? null);
            const displayCandidate =
              kind === "image"
                ? (pickBestDisplayVariant(variants) ?? absoluteThumb ?? absoluteOriginal)
                : absoluteOriginal;
            const fullCandidate =
              kind === "image"
                ? (pickBestFullVariant(variants) ?? absoluteOriginal)
                : absoluteOriginal;
            const displaySrcSet =
              cloudflareEnabled && kind === "image" ? (variants?.feedSrcset ?? null) : null;
            const fullSrcSet =
              cloudflareEnabled && kind === "image"
                ? (variants?.fullSrcset ?? variants?.feedSrcset ?? null)
                : null;
            pushMedia({
              id: baseId,
              originalUrl: variants?.original ?? absoluteOriginal,
              displayUrl: displayCandidate,
              displaySrcSet,
              fullUrl: fullCandidate,
              fullSrcSet,
              kind,
              name: attachment.name ?? null,
              thumbnailUrl:
                kind === "image"
                  ? (variants?.thumb ?? absoluteThumb ?? absoluteOriginal)
                  : (absoluteThumb ?? attachment.thumbnailUrl ?? null),
              mimeType: attachment.mimeType ?? null,
            });
          } else {
            if (fileAttachments.some((file) => file.url === attachment.url)) return;
            let fallbackName = attachment.name ?? null;
            if (!fallbackName) {
              try {
                const tail = decodeURIComponent(attachment.url.split("/").pop() ?? "");
                const clean = tail.split("?")[0];
                fallbackName = clean || tail || "Attachment";
              } catch {
                fallbackName = "Attachment";
              }
            }
            fileAttachments.push({
              id: baseId,
              url: attachment.url,
              name: fallbackName,
              mimeType: attachment.mimeType ?? null,
            });
          }
        });

        if (!media && galleryItems.length) {
          const primaryMedia = galleryItems[0] ?? null;
          if (primaryMedia) {
            media = primaryMedia.thumbnailUrl ?? primaryMedia.displayUrl ?? primaryMedia.fullUrl;
          }
        }
        const isCardRefreshing = isRefreshing && hasFetched;

        return (
          <article
            key={post.id}
            className={`${styles.card}${isCardRefreshing ? " " + styles.cardRefreshing : ""}`}
            data-refreshing={isCardRefreshing ? "true" : undefined}
            aria-busy={isCardRefreshing ? true : undefined}
          >
            <header className={styles.cardHead}>
              <div className={styles.userMeta}>
                <span className={styles.avatarWrap} aria-hidden>
                  {post.user_avatar ? (
                    <LazyImage
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

                {canTarget ? (
                  <button
                    type="button"
                    className={`${styles.userNameButton} ${styles.userName}`.trim()}
                    onClick={() => onToggleFriendTarget(isFriendOptionOpen ? null : menuIdentifier)}
                    aria-expanded={isFriendOptionOpen}
                  >
                    {post.user_name || "Capsules AI"}
                  </button>
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
                  disabled={isMemoryPending || !canRemember}
                  aria-pressed={remembered ? true : undefined}
                  aria-label={
                    isMemoryPending
                      ? "Saving to memory..."
                      : remembered
                        ? "Remembered"
                        : "Save to Memory"
                  }
                  title={
                    canRemember ? (remembered ? "Remembered" : "Save to Memory") : "Sign in to save"
                  }
                >
                  {isMemoryPending ? (
                    <HourglassHigh weight="duotone" />
                  ) : (
                    <Brain weight="duotone" />
                  )}
                </button>

                <PostMenu
                  canTarget={canTarget}
                  pending={isFriendActionPending}
                  open={isFriendOptionOpen}
                  onOpenChange={(next) => onToggleFriendTarget(next ? menuIdentifier : null)}
                  onAddFriend={() => onFriendRequest(post, menuIdentifier)}
                  onRemoveFriend={() => onRemoveFriend(post, menuIdentifier)}
                  renderTrigger={({ ref, toggle, open: menuOpen, pending: menuPending }) => (
                    <button
                      type="button"
                      className={styles.iconBtn}
                      aria-label="Post options"
                      aria-haspopup="menu"
                      aria-expanded={menuOpen}
                      onClick={toggle}
                      disabled={menuPending}
                      ref={ref}
                    >
                      <DotsThreeCircleVertical weight="duotone" />
                    </button>
                  )}
                />

                <button
                  type="button"
                  className={`${styles.iconBtn} ${styles.iconBtnDelete}`.trim()}
                  onClick={() => onDelete(post.id)}
                  aria-label="Delete post"
                  title="Delete post"
                >
                  <Trash weight="duotone" />
                </button>
              </div>
            </header>

            <div className={styles.cardBody}>
              {post.content ? <div className={styles.postText}>{post.content}</div> : null}
            </div>

            {galleryItems.length ? (
              <div className={styles.mediaGallery} data-count={galleryItems.length}>
                {(() => {
                  const imageItems = galleryItems.filter((entry) => entry.kind === "image");
                  const lightboxLookup = new Map<string, number>(
                    imageItems.map((entry, idx) => [entry.id, idx]),
                  );
                  const mappedLightboxItems = imageItems.map((entry) => ({
                    id: entry.id,
                    kind: entry.kind,
                    fullUrl: entry.fullUrl,
                    fullSrcSet: entry.fullSrcSet,
                    displayUrl: entry.displayUrl,
                    displaySrcSet: entry.displaySrcSet,
                    name: entry.name,
                    alt: entry.name ?? "Post attachment",
                    mimeType: entry.mimeType,
                  }));

                  return galleryItems.map((item) => {
                    if (item.kind === "video") {
                      return (
                        <div key={item.id} className={styles.mediaWrapper} data-kind="video">
                          <video
                            className={`${styles.media} ${styles.mediaVideo}`.trim()}
                            controls
                            playsInline
                            preload="metadata"
                            poster={item.thumbnailUrl ?? undefined}
                          >
                            <source src={item.fullUrl} type={item.mimeType ?? undefined} />
                            Your browser does not support the video tag.
                          </video>
                        </div>
                      );
                    }

                    const imageIndex = lightboxLookup.get(item.id) ?? 0;

                    return (
                      <button
                        key={item.id}
                        type="button"
                        className={`${styles.mediaButton} ${styles.mediaImageButton}`.trim()}
                        onClick={() => {
                          if (!mappedLightboxItems.length) return;
                          setLightbox({
                            postId: post.id,
                            index: imageIndex,
                            items: mappedLightboxItems,
                          });
                        }}
                        aria-label={item.name ? `View ${item.name}` : "View attachment"}
                      >
                        <LazyImage
                          className={`${styles.media} ${styles.mediaImage}`.trim()}
                          src={item.displayUrl}
                          alt={item.name ?? "Post attachment"}
                          width={1080}
                          height={1080}
                          sizes="(max-width: 640px) 100vw, 720px"
                          loading="lazy"
                          unoptimized
                        />
                      </button>
                    );
                  });
                })()}
              </div>
            ) : null}

            {fileAttachments.length ? (
              <ul className={styles.attachmentList}>
                {fileAttachments.map((file) => (
                  <li key={file.id} className={styles.attachmentListItem}>
                    <a
                      href={file.url}
                      className={styles.attachmentLink}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <span className={styles.attachmentFileName}>{file.name ?? "Attachment"}</span>
                    </a>
                  </li>
                ))}
              </ul>
            ) : null}

            <footer className={styles.actionBar}>
              {actionItems.map((action) => {
                const isLike = action.key === "like";
                return (
                  <button
                    key={action.key}
                    className={styles.actionBtn}
                    type="button"
                    data-variant={action.key}
                    data-active={action.active ? "true" : "false"}
                    aria-label={`${action.label} (${formatCount(action.count)} so far)`}
                    onClick={isLike ? action.handler : undefined}
                    disabled={isLike ? action.pending : false}
                    aria-pressed={isLike ? action.active : undefined}
                    aria-busy={isLike && action.pending ? true : undefined}
                  >
                    <span className={styles.actionMeta}>
                      <span className={styles.actionIcon} aria-hidden>
                        {action.key === "like" ? (
                          <Heart weight={action.active ? "fill" : "duotone"} />
                        ) : (
                          action.icon
                        )}
                      </span>
                      <span className={styles.actionLabel}>{action.label}</span>
                    </span>
                    <span className={styles.actionCount}>{formatCount(action.count)}</span>
                  </button>
                );
              })}
            </footer>
          </article>
        );
      })}

      {shouldShowSentinel ? (
        <div ref={sentinelRef} className={styles.feedSentinel} aria-hidden />
      ) : null}

      {lightbox
        ? (() => {
            const current = lightbox.items[lightbox.index] ?? null;
            if (!current) return null;
            const hasMultiple = lightbox.items.length > 1;
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
                    {"\u00d7"}
                  </button>
                  {hasMultiple ? (
                    <>
                      <button
                        type="button"
                        className={`${styles.lightboxNav} ${styles.lightboxNavPrev}`.trim()}
                        onClick={() => navigateLightbox(-1)}
                        aria-label="Previous attachment"
                      >
                        â€¹
                      </button>
                      <button
                        type="button"
                        className={`${styles.lightboxNav} ${styles.lightboxNavNext}`.trim()}
                        onClick={() => navigateLightbox(1)}
                        aria-label="Next attachment"
                      >
                        â€º
                      </button>
                    </>
                  ) : null}
                  <div className={styles.lightboxBody}>
                    <div className={styles.lightboxMedia}>
                      {current.kind === "video" ? (
                        <video className={styles.lightboxVideo} controls playsInline preload="auto">
                          <source src={current.fullUrl} type={current.mimeType ?? undefined} />
                          Your browser does not support embedded video.
                        </video>
                      ) : (
                        /* eslint-disable-next-line @next/next/no-img-element -- maintain lightbox srcset + eager load without reliable dimensions for next/image */
                        <img
                          className={styles.lightboxImage}
                          src={current.fullUrl}
                          srcSet={current.fullSrcSet ?? current.displaySrcSet ?? undefined}
                          sizes="(min-width: 768px) 70vw, 90vw"
                          alt={current.alt}
                          loading="eager"
                          draggable={false}
                        />
                      )}
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
    </>
  );
}
