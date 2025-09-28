"use client";

/* eslint-disable @next/next/no-img-element */

import * as React from "react";

import styles from "./home.module.css";
import { Brain, Heart, ChatCircle, ShareNetwork, DotsThree, Trash, HourglassHigh } from "@phosphor-icons/react/dist/ssr";
import { normalizeMediaUrl } from "@/lib/media";
import type { HomeFeedPost } from "@/hooks/useHomeFeed";

type ActionKey = "like" | "comment" | "share";

type HomeFeedListProps = {
  posts: HomeFeedPost[];
  likePending: Record<string, boolean>;
  memoryPending: Record<string, boolean>;
  activeFriendTarget: string | null;
  friendActionPending: string | null;
  onToggleLike(postId: string): void;
  onToggleMemory(post: HomeFeedPost, desired: boolean): Promise<boolean | void> | boolean | void;
  onFriendRequest(post: HomeFeedPost, identifier: string): void;
  onDelete(postId: string): void;
  onToggleFriendTarget(identifier: string | null): void;
  formatCount(value?: number | null): string;
  timeAgo(iso?: string | null): string;
  exactTime(iso?: string | null): string;
  canRemember: boolean;
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
  formatCount,
  timeAgo,
  exactTime,
  canRemember,
}: HomeFeedListProps) {
  return (
    <>
      {posts.map((post) => {
        let media = normalizeMediaUrl(post.media_url) ?? normalizeMediaUrl(post.mediaUrl) ?? null;
        const identifier =
          post.owner_user_id ??
          post.ownerUserId ??
          post.owner_user_key ??
          post.ownerKey ??
          `${post.id}`;
        const canTarget = Boolean(
          post.owner_user_id ?? post.ownerUserId ?? post.owner_user_key ?? post.ownerKey,
        );
        const isFriendOptionOpen = activeFriendTarget === identifier;
        const isFriendActionPending = friendActionPending === identifier;
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
          { key: "comment", label: "Comment", icon: <ChatCircle weight="duotone" />, count: commentCount },
          { key: "share", label: "Share", icon: <ShareNetwork weight="duotone" />, count: shareCount },
        ];
        const attachmentsList = Array.isArray(post.attachments)
          ? post.attachments.filter((attachment): attachment is NonNullable<HomeFeedPost["attachments"]>[number] =>
              Boolean(attachment && attachment.url),
            )
          : [];
        const inferAttachmentKind = (
          mime: string | null | undefined,
          url: string,
        ): "image" | "video" | "file" => {
          const loweredMime = mime?.toLowerCase() ?? "";
          if (loweredMime.startsWith("image/")) return "image";
          if (loweredMime.startsWith("video/")) return "video";
          const lowerUrl = url.toLowerCase();
          if (/\.(mp4|webm|mov|m4v|avi|ogv|ogg|mkv)(\?|#|$)/.test(lowerUrl)) return "video";
          if (/\.(png|jpe?g|gif|webp|avif|svg|heic|heif)(\?|#|$)/.test(lowerUrl)) return "image";
          return "file";
        };
        const seenMedia = new Set<string>();
        const galleryItems: Array<{
          id: string;
          url: string;
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
          url: string;
          kind: "image" | "video";
          name: string | null;
          thumbnailUrl: string | null;
          mimeType: string | null;
        }) => {
          if (!item.url || seenMedia.has(item.url)) return;
          seenMedia.add(item.url);
          galleryItems.push(item);
        };

        if (media) {
          const inferred = inferAttachmentKind(null, media) === "video" ? "video" : "image";
          pushMedia({
            id: `${post.id}-primary`,
            url: media,
            kind: inferred,
            name: null,
            thumbnailUrl: media,
            mimeType: null,
          });
        }

        attachmentsList.forEach((attachment, index) => {
          if (!attachment || !attachment.url) return;
          const kind = inferAttachmentKind(attachment.mimeType ?? null, attachment.url);
          const baseId = attachment.id || `${post.id}-att-${index}`;
          if (kind === "image" || kind === "video") {
            pushMedia({
              id: baseId,
              url: attachment.url,
              kind,
              name: attachment.name ?? null,
              thumbnailUrl: attachment.thumbnailUrl ?? null,
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
            media = primaryMedia.thumbnailUrl ?? primaryMedia.url;
          }
        }
        return (
          <article key={post.id} className={styles.card}>
            <header className={styles.cardHead}>
              <div className={styles.userMeta}>
                <span className={styles.avatarWrap} aria-hidden>
                  {post.user_avatar ? (
                    <img
                      className={styles.avatarImg}
                      src={post.user_avatar}
                      alt=""
                      loading="lazy"
                    />
                  ) : (
                    <span className={styles.avatar} />
                  )}
                </span>

                {canTarget ? (
                  <button
                    type="button"
                    className={`${styles.userNameButton} ${styles.userName}`.trim()}
                    onClick={() => onToggleFriendTarget(isFriendOptionOpen ? null : identifier)}
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
                    canRemember
                      ? remembered
                        ? "Remembered"
                        : "Save to Memory"
                      : "Sign in to save"
                  }
                >
                  {isMemoryPending ? (
                    <HourglassHigh weight="duotone" />
                  ) : (
                    <Brain weight="duotone" />
                  )}
                </button>

                <button
                  type="button"
                  className={styles.iconBtn}
                  aria-label="Post options"
                  aria-expanded={isFriendOptionOpen}
                  onClick={() => onToggleFriendTarget(isFriendOptionOpen ? null : identifier)}
                >
                  <DotsThree weight="duotone" />
                </button>

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

            {isFriendOptionOpen ? (
              <div className={styles.postFriendActions}>
                <button
                  type="button"
                  className={styles.postFriendButton}
                  onClick={() => onFriendRequest(post, identifier)}
                  disabled={!canTarget || isFriendActionPending}
                  aria-busy={isFriendActionPending}
                >
                  {isFriendActionPending ? "Sending..." : "Add friend"}
                </button>
              </div>
            ) : null}

            <div className={styles.cardBody}>
              {post.content ? <div className={styles.postText}>{post.content}</div> : null}
            </div>

            {galleryItems.length ? (
              <div className={styles.mediaGallery} data-count={galleryItems.length}>
                {galleryItems.map((item) =>
                  item.kind === "video" ? (
                    <video
                      key={item.id}
                      className={`${styles.media} ${styles.mediaVideo}`.trim()}
                      controls
                      playsInline
                      preload="metadata"
                      poster={item.thumbnailUrl ?? undefined}
                    >
                      <source src={item.url} type={item.mimeType ?? undefined} />
                      Your browser does not support the video tag.
                    </video>
                  ) : (
                    <img
                      key={item.id}
                      className={`${styles.media} ${styles.mediaImage}`.trim()}
                      src={item.url}
                      alt={item.name ?? "Post attachment"}
                      loading="lazy"
                    />
                  ),
                )}
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
                        {action.key === "like"
                          ? <Heart weight={action.active ? "fill" : "duotone"} />
                          : action.icon}
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
    </>
  );
}
