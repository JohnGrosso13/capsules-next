"use client";

/* eslint-disable @next/next/no-img-element */

import React from "react";
import styles from "./home.module.css";

import { AppShell } from "./app-shell";
import { PromoRow } from "./promo-row";

type Post = {
  id: string;
  user_name?: string | null;
  user_avatar?: string | null;
  content?: string | null;
  media_url?: string | null;
  mediaUrl?: string | null;
  created_at?: string;
  owner_user_id?: string | null;
  ownerUserId?: string | null;
  owner_user_key?: string | null;
  ownerKey?: string | null;
  likes?: number | null;
  comments?: number | null;
  shares?: number | null;
};

const fallbackPosts: Post[] = [
  {
    id: "sample-feed",
    user_name: "Capsules AI",
    content:
      "Ask your Capsule AI to design posts, polls, and shopping drops for your community.",
    media_url: "/globe.svg",
    created_at: null,
    likes: 128,
    comments: 14,
    shares: 6,
  },
];


function normalizeMediaUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const lowered = trimmed.toLowerCase();
  if (lowered === "null" || lowered === "undefined") return null;
  return trimmed;
}



function formatCount(value?: number | null): string {
  const count = typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : 0;
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  if (count >= 1_000) return `${(count / 1_000).toFixed(1).replace(/\.0$/, "")}K`;
  return String(count);
}

function likeIcon(count?: number | null): string {
  const value = typeof count === "number" ? count : 0;
  if (value >= 500) return "🔥";
  if (value >= 100) return "💖";
  if (value > 0) return "❤️";
  return "♡";
}

function commentIcon(count?: number | null): string {
  const value = typeof count === "number" ? count : 0;
  if (value >= 120) return "🗣️";
  if (value >= 40) return "💬";
  if (value > 0) return "🗨️";
  return "💭";
}

function shareIcon(count?: number | null): string {
  const value = typeof count === "number" ? count : 0;
  if (value >= 90) return "🚀";
  if (value >= 30) return "📣";
  if (value > 0) return "🔁";
  return "↗️";
}

type Props = {
  showPromoRow?: boolean;
  showPrompter?: boolean;
};

export function HomeSignedIn({ showPromoRow = true, showPrompter = true }: Props) {
  const [posts, setPosts] = React.useState<Post[]>(fallbackPosts);
  const [activeFriendTarget, setActiveFriendTarget] = React.useState<string | null>(null);
  const [friendActionPending, setFriendActionPending] = React.useState<string | null>(null);
  const [friendMessage, setFriendMessage] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!friendMessage) return;
    const timer = window.setTimeout(() => setFriendMessage(null), 4000);
    return () => window.clearTimeout(timer);
  }, [friendMessage]);



  const refreshGeneration = React.useRef(0);

  const refreshPosts = React.useCallback(
    async (signal?: AbortSignal) => {
      const requestToken = ++refreshGeneration.current;
      try {
        const response = await fetch("/api/posts?limit=30", { signal });
        if (!response.ok) {
          throw new Error(`Feed request failed (${response.status})`);
        }
        const data = (await response.json().catch(() => null)) as { posts?: unknown };
        const arr = Array.isArray(data?.posts) ? data.posts : [];
        if (!arr.length) {
          if (refreshGeneration.current === requestToken) {
            setPosts(fallbackPosts);
          }
          return;
        }
        const normalized: Post[] = arr.map((raw: unknown) => {
          const record = raw as Record<string, unknown>;
          const media =
            normalizeMediaUrl(record["mediaUrl"]) ??
            normalizeMediaUrl(record["media_url"]) ??
            null;
          const createdAt =
            typeof record["created_at"] === "string"
              ? (record["created_at"] as string)
              : typeof record["ts"] === "string"
              ? (record["ts"] as string)
              : null;
          const ownerId =
            typeof record["ownerUserId"] === "string"
              ? (record["ownerUserId"] as string)
              : typeof record["owner_user_id"] === "string"
              ? (record["owner_user_id"] as string)
              : null;
          const ownerKey =
            typeof record["ownerKey"] === "string"
              ? (record["ownerKey"] as string)
              : typeof record["owner_user_key"] === "string"
              ? (record["owner_user_key"] as string)
              : typeof record["userKey"] === "string"
              ? (record["userKey"] as string)
              : null;
          const likes =
            typeof record["likes"] === "number"
              ? (record["likes"] as number)
              : typeof record["likes_count"] === "number"
              ? (record["likes_count"] as number)
              : typeof record["reactions_count"] === "number"
              ? (record["reactions_count"] as number)
              : 0;
          const comments =
            typeof record["comments"] === "number"
              ? (record["comments"] as number)
              : typeof record["comments_count"] === "number"
              ? (record["comments_count"] as number)
              : 0;
          const shares =
            typeof record["shares"] === "number"
              ? (record["shares"] as number)
              : typeof record["share_count"] === "number"
              ? (record["share_count"] as number)
              : 0;
          return {
            id: String(record["id"] ?? crypto.randomUUID()),
            user_name:
              typeof record["user_name"] === "string"
                ? (record["user_name"] as string)
                : typeof record["userName"] === "string"
                ? (record["userName"] as string)
                : "Capsules AI",
            user_avatar:
              typeof record["user_avatar"] === "string"
                ? (record["user_avatar"] as string)
                : typeof record["userAvatar"] === "string"
                ? (record["userAvatar"] as string)
                : null,
            content: typeof record["content"] === "string" ? (record["content"] as string) : null,
            media_url: media,
            mediaUrl: media,
            created_at: createdAt,
            owner_user_id: ownerId,
            ownerUserId: ownerId,
            owner_user_key: ownerKey,
            ownerKey: ownerKey,
            likes,
            comments,
            shares,
          };
        });
        if (refreshGeneration.current === requestToken) {
          setPosts(normalized.length ? normalized : fallbackPosts);
        }
      } catch (error) {
        if (
          signal?.aborted ||
          (error instanceof DOMException && error.name === "AbortError")
        ) {
          return;
        }
        console.error("Posts refresh failed", error);
      }
    },
    [setPosts],
  );

  React.useEffect(() => {
    const controller = new AbortController();
    void refreshPosts(controller.signal);
    return () => controller.abort();
  }, [refreshPosts]);

  React.useEffect(() => {
    const handleRefresh = (_event: Event) => {
      void refreshPosts();
    };
    window.addEventListener("posts:refresh", handleRefresh);
    return () => {
      window.removeEventListener("posts:refresh", handleRefresh);
    };
  }, [refreshPosts]);

  const timeAgo = React.useCallback((iso?: string) => {
    if (!iso) return "just now";
    const then = new Date(iso).getTime();
    const now = Date.now();
    const seconds = Math.max(1, Math.floor((now - then) / 1000));
    if (seconds < 60) return `${seconds} second${seconds === 1 ? "" : "s"} ago`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
    const days = Math.floor(hours / 24);
    if (days < 7) return `${days} day${days === 1 ? "" : "s"} ago`;
    const weeks = Math.floor(days / 7);
    if (weeks < 5) return `${weeks} week${weeks === 1 ? "" : "s"} ago`;
    const months = Math.floor(days / 30);
    if (months < 12) return `${months} month${months === 1 ? "" : "s"} ago`;
    const years = Math.floor(days / 365);
    return `${years} year${years === 1 ? "" : "s"} ago`;
  }, []);

  const exactTime = React.useCallback((iso?: string) => {
    if (!iso) return "";
    try {
      const date = new Date(iso);
      return date.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" } as Intl.DateTimeFormatOptions);
    } catch {
      return iso;
    }
  }, []);

  function handleDelete(id: string) {
    fetch(`/api/posts/${encodeURIComponent(id)}`, { method: "DELETE" }).catch(() => undefined);
    setPosts((prev) => prev.filter((p) => p.id !== id));
  }

  const buildFriendTarget = React.useCallback((post: Post) => {
    const userId = post.owner_user_id ?? post.ownerUserId ?? null;
    const userKey = post.owner_user_key ?? post.ownerKey ?? null;
    if (!userId && !userKey) return null;
    const target: Record<string, unknown> = {};
    if (userId) target.userId = userId;
    if (userKey) target.userKey = userKey;
    if (post.user_name) target.name = post.user_name;
    if (post.user_avatar) target.avatar = post.user_avatar;
    return target;
  }, []);

  const handleFriendRequest = React.useCallback(async (post: Post, identifier: string) => {
    const target = buildFriendTarget(post);
    if (!target) {
      setFriendMessage("That profile isn't ready for requests yet.");
      return;
    }
    setFriendActionPending(identifier);
    try {
      const res = await fetch("/api/friends/update", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "request", target }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        const message =
          (data && typeof data.message === "string" && data.message) ||
          (data && typeof data.error === "string" && data.error) ||
          "Could not send that friend request.";
        throw new Error(message);
      }
      setFriendMessage(`Friend request sent to ${post.user_name || "this member"}.`);
      setActiveFriendTarget(null);
    } catch (error) {
      console.error("Post friend request error", error);
      setFriendMessage(
        error instanceof Error && error.message ? error.message : "Couldn't send that friend request.",
      );
    } finally {
      setFriendActionPending(null);
    }
  }, [buildFriendTarget]);

  return (
    <AppShell
      activeNav="home"
      showPrompter={showPrompter}
      promoSlot={showPromoRow ? <PromoRow /> : null}
    >
      <section className={styles.feed}>
        {friendMessage ? <div className={styles.postFriendNotice}>{friendMessage}</div> : null}
        {posts.map((p) => {
          const media = normalizeMediaUrl(p.media_url) ?? normalizeMediaUrl(p.mediaUrl) ?? null;
          const identifier = p.owner_user_id ?? p.ownerUserId ?? p.owner_user_key ?? p.ownerKey ?? `${p.id}`;
          const canTarget = Boolean(p.owner_user_id ?? p.ownerUserId ?? p.owner_user_key ?? p.ownerKey);
          const isFriendOptionOpen = activeFriendTarget === identifier;
          const isFriendActionPending = friendActionPending === identifier;
          const likeCount = typeof p.likes === "number" ? Math.max(0, p.likes) : 0;
          const commentCount = typeof p.comments === "number" ? Math.max(0, p.comments) : 0;
          const shareCount = typeof p.shares === "number" ? Math.max(0, p.shares) : 0;
          const actionItems = [
            { key: "like", label: "Like", count: likeCount, icon: likeIcon(likeCount) },
            { key: "comment", label: "Comment", count: commentCount, icon: commentIcon(commentCount) },
            { key: "share", label: "Share", count: shareCount, icon: shareIcon(shareCount) },
          ];
          return (
            <article key={p.id} className={styles.card}>
              <header className={styles.cardHead}>

                <div className={styles.userMeta}>

                  <span className={styles.avatarWrap} aria-hidden>

                    {p.user_avatar ? (

                      <img className={styles.avatarImg} src={p.user_avatar} alt="" loading="lazy" />

                    ) : (

                      <span className={styles.avatar} />

                    )}

                  </span>

                  {canTarget ? (

                    <button

                      type="button"

                      className={`${styles.userNameButton} ${styles.userName}`.trim()}

                      onClick={() => setActiveFriendTarget(isFriendOptionOpen ? null : identifier)}

                      aria-expanded={isFriendOptionOpen}

                    >

                      {p.user_name || "Capsules AI"}

                    </button>

                  ) : (

                    <div className={styles.userName}>{p.user_name || "Capsules AI"}</div>

                  )}

                  <span className={styles.separator} aria-hidden>{"\u2022"}</span>

                  <time

                    className={styles.timestamp}

                    title={exactTime(p.created_at)}

                    dateTime={p.created_at ?? undefined}

                  >

                    {timeAgo(p.created_at)}

                  </time>

                </div>

                <div className={styles.cardControls}>

                  {canTarget ? (

                    <button

                      type="button"

                      className={styles.iconBtn}

                      onClick={() => handleFriendRequest(p, identifier)}

                      disabled={!canTarget || isFriendActionPending}

                      aria-label="Add friend shortcut"

                      title="Add friend"

                    >

                      {isFriendActionPending ? "…" : "🤝"}

                    </button>

                  ) : null}

                  <button

                    type="button"

                    className={styles.iconBtn}

                    aria-label="Post options"

                    aria-expanded={isFriendOptionOpen}

                    onClick={() => setActiveFriendTarget(isFriendOptionOpen ? null : identifier)}

                  >

                    ⋯

                  </button>

                  <button

                    type="button"

                    className={`${styles.iconBtn} ${styles.iconBtnDelete}`.trim()}

                    onClick={() => handleDelete(p.id)}

                    aria-label="Delete post"

                    title="Delete post"

                  >

                    🗑

                  </button>

                </div>

              </header>

              {isFriendOptionOpen ? (
                <div className={styles.postFriendActions}>
                  <button
                    type="button"
                    className={styles.postFriendButton}
                    onClick={() => handleFriendRequest(p, identifier)}
                    disabled={!canTarget || isFriendActionPending}
                    aria-busy={isFriendActionPending}
                  >
                    {isFriendActionPending ? "Sending..." : "Add friend"}
                  </button>
                </div>
              ) : null}
              <div className={styles.cardBody}>
                {p.content ? <div className={styles.postText}>{p.content}</div> : null}
              </div>
              {media ? <img className={styles.media} src={media} alt="Post media" /> : null}
              <footer className={styles.actionBar}>

                {actionItems.map((action) => (

                  <button

                    key={action.key}

                    className={styles.actionBtn}

                    type="button"

                    data-variant={action.key}

                    aria-label={`${action.label} (${formatCount(action.count)} so far)`}

                  >

                    <span className={styles.actionMeta}>

                      <span className={styles.actionIcon} aria-hidden>
                        {action.key === "like" ? (
                          <span className="msr">favorite</span>
                        ) : action.key === "comment" ? (
                          <span className="msr">mode_comment</span>
                        ) : (
                          <span className="msr">ios_share</span>
                        )}
                      </span>

                      <span className={styles.actionLabel}>{action.label}</span>

                    </span>

                    <span className={styles.actionCount}>{formatCount(action.count)}</span>

                  </button>

                ))}

              </footer>



            </article>
          );
        })}
      </section>
    </AppShell>
  );
}

