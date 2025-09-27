"use client";

/* eslint-disable @next/next/no-img-element */

import * as React from "react";

import styles from "./home.module.css";
import { MaterialSymbol, type MaterialSymbolName } from "./material-symbol";
import { normalizeMediaUrl } from "@/lib/media";
import type { HomeFeedPost } from "@/hooks/useHomeFeed";

type ActionKey = "like" | "comment" | "share";

type HomeFeedListProps = {
  posts: HomeFeedPost[];
  likePending: Record<string, boolean>;
  activeFriendTarget: string | null;
  friendActionPending: string | null;
  onToggleLike(postId: string): void;
  onFriendRequest(post: HomeFeedPost, identifier: string): void;
  onDelete(postId: string): void;
  onToggleFriendTarget(identifier: string | null): void;
  formatCount(value?: number | null): string;
  timeAgo(iso?: string | null): string;
  exactTime(iso?: string | null): string;
};

export function HomeFeedList({
  posts,
  likePending,
  activeFriendTarget,
  friendActionPending,
  onToggleLike,
  onFriendRequest,
  onDelete,
  onToggleFriendTarget,
  formatCount,
  timeAgo,
  exactTime,
}: HomeFeedListProps) {
  return (
    <>
      {posts.map((post) => {
        const media = normalizeMediaUrl(post.media_url) ?? normalizeMediaUrl(post.mediaUrl) ?? null;
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
        const isLikePending = Boolean(likePending[post.id]);
        const actionItems: Array<{
          key: ActionKey;
          label: string;
          icon: MaterialSymbolName;
          count: number;
          active?: boolean;
          pending?: boolean;
          handler?: () => void;
        }> = [
          {
            key: "like",
            label: viewerLiked ? "Liked" : "Like",
            icon: "favorite",
            count: likeCount,
            active: viewerLiked,
            pending: isLikePending,
            handler: () => onToggleLike(post.id),
          },
          { key: "comment", label: "Comment", icon: "mode_comment", count: commentCount },
          { key: "share", label: "Share", icon: "ios_share", count: shareCount },
        ];

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
                {canTarget ? (
                  <button
                    type="button"
                    className={styles.iconBtn}
                    onClick={() => onFriendRequest(post, identifier)}
                    disabled={!canTarget || isFriendActionPending}
                    aria-label="Add friend shortcut"
                    title="Add friend"
                  >
                    <MaterialSymbol name={isFriendActionPending ? "hourglass_top" : "person_add"} />
                  </button>
                ) : null}

                <button
                  type="button"
                  className={styles.iconBtn}
                  aria-label="Post options"
                  aria-expanded={isFriendOptionOpen}
                  onClick={() => onToggleFriendTarget(isFriendOptionOpen ? null : identifier)}
                >
                  <MaterialSymbol name="more_horiz" />
                </button>

                <button
                  type="button"
                  className={`${styles.iconBtn} ${styles.iconBtnDelete}`.trim()}
                  onClick={() => onDelete(post.id)}
                  aria-label="Delete post"
                  title="Delete post"
                >
                  <MaterialSymbol name="delete" />
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

            {media ? <img className={styles.media} src={media} alt="Post media" /> : null}

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
                        <MaterialSymbol
                          name={action.icon}
                          filled={Boolean(action.key === "like" && action.active)}
                        />
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
