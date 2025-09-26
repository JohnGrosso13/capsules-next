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
};

const fallbackPosts: Post[] = [
  {
    id: "sample-feed",
    user_name: "Capsules AI",
    content:
      "Ask your Capsule AI to design posts, polls, and shopping drops for your community.",
    media_url: "/globe.svg",
    created_at: null,
  },
];

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



  React.useEffect(() => {
    fetch("/api/posts?limit=30")
      .then((r) => r.json())
      .then((d) => {
        const arr = Array.isArray(d.posts) ? d.posts : [];
        if (!arr.length) {
          setPosts(fallbackPosts);
          return;
        }
        const normalized: Post[] = arr.map((raw: unknown) => {
          const record = raw as Record<string, unknown>;
          const media =
            typeof record["mediaUrl"] === "string"
              ? (record["mediaUrl"] as string)
              : typeof record["media_url"] === "string"
              ? (record["media_url"] as string)
              : null;
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
            created_at: createdAt,
            owner_user_id: ownerId,
            ownerUserId: ownerId,
            owner_user_key: ownerKey,
            ownerKey: ownerKey,
          };
        });
        setPosts(normalized);
      })
      .catch(() => setPosts(fallbackPosts));
  }, []);

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
          const media = p.media_url ?? p.mediaUrl ?? null;
          const identifier = p.owner_user_id ?? p.ownerUserId ?? p.owner_user_key ?? p.ownerKey ?? `${p.id}`;
          const canTarget = Boolean(p.owner_user_id ?? p.ownerUserId ?? p.owner_user_key ?? p.ownerKey);
          const isFriendOptionOpen = activeFriendTarget === identifier;
          const isFriendActionPending = friendActionPending === identifier;
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
                <button className={styles.actionBtn} type="button">Like</button>
                <button className={styles.actionBtn} type="button">Comment</button>
                <button className={styles.actionBtn} type="button">Share</button>
                <button
                  className={`${styles.actionBtn} ${styles.delete}`.trim()}
                  type="button"
                  onClick={() => handleDelete(p.id)}
                >
                  Delete
                </button>
              </footer>
            </article>
          );
        })}
      </section>
    </AppShell>
  );
}

