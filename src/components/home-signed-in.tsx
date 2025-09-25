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
};

const fallbackPosts: Post[] = [
  {
    id: "sample-feed",
    user_name: "Capsules AI",
    content:
      "Ask your Capsule AI to design posts, polls, and shopping drops for your community.",
    media_url: "/globe.svg",
  },
];

type Props = {
  showPromoRow?: boolean;
  showPrompter?: boolean;
};

export function HomeSignedIn({ showPromoRow = true, showPrompter = true }: Props) {
  const [posts, setPosts] = React.useState<Post[]>(fallbackPosts);

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
          return {
            id: String(record["id"] ?? crypto.randomUUID()),
            user_name:
              typeof record["user_name"] === "string"
                ? (record["user_name"] as string)
                : typeof record["userName"] === "string"
                ? (record["userName"] as string)
                : "Capsules",
            user_avatar:
              typeof record["user_avatar"] === "string"
                ? (record["user_avatar"] as string)
                : typeof record["userAvatar"] === "string"
                ? (record["userAvatar"] as string)
                : null,
            content: typeof record["content"] === "string" ? (record["content"] as string) : null,
            media_url: media,
            created_at: typeof record["created_at"] === "string" ? (record["created_at"] as string) : undefined,
          };
        });
        setPosts(normalized);
      })
      .catch(() => setPosts(fallbackPosts));
  }, []);

  const timeAgo = React.useCallback((iso?: string) => {
    if (!iso) return "";
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

  function handleDelete(id: string) {
    fetch(`/api/posts/${encodeURIComponent(id)}`, { method: "DELETE" }).catch(() => undefined);
    setPosts((prev) => prev.filter((p) => p.id !== id));
  }

  return (
    <AppShell
      activeNav="home"
      showPrompter={showPrompter}
      promoSlot={showPromoRow ? <PromoRow /> : null}
    >
      <section className={styles.feed}>
        {posts.map((p) => {
          const media = p.media_url ?? p.mediaUrl ?? null;
          return (
            <article key={p.id} className={styles.card}>
              <header className={styles.cardHead}>
                <div className={styles.userMeta}>
                  <div className={styles.userName}>{p.user_name || "Capsules"}</div>
                  <div className={styles.timestamp}>{timeAgo(p.created_at)}</div>
                </div>
              </header>
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

