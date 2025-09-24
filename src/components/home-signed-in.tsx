"use client";

import React from "react";
import Link from "next/link";
import styles from "./home.module.css";
import { PromoRow } from "./promo-row";
import { AiPrompterStage } from "./ai-prompter-stage";

type Post = {
  id: string;
  user_name?: string | null;
  user_avatar?: string | null;
  content?: string | null;
  media_url?: string | null;
  mediaUrl?: string | null;
  created_at?: string;
};

type Friend = { name: string; avatar?: string | null };

const fallbackPosts: Post[] = [
  {
    id: "sample-feed",
    user_name: "Capsules AI",
    content:
      "Ask your Capsule AI to design posts, polls, and shopping drops for your community.",
    media_url: "/globe.svg",
  },
];

const fallbackFriends: Friend[] = [
  { name: "Capsules Team" },
  { name: "Memory Bot" },
  { name: "Dream Studio" },
];

type Props = {
  showPrompter?: boolean;
  showPromoRow?: boolean;
  showFeed?: boolean;
  showRail?: boolean;
  className?: string;
};

export function HomeSignedIn({
  showPrompter = true,
  showPromoRow = true,
  showFeed = true,
  showRail = true,
  className = "",
}: Props) {
  const [posts, setPosts] = React.useState<Post[]>([]);
  const [friends, setFriends] = React.useState<Friend[]>(fallbackFriends);

  function timeAgo(iso?: string) {
    if (!iso) return "";
    const then = new Date(iso).getTime();
    const now = Date.now();
    const s = Math.max(1, Math.floor((now - then) / 1000));
    if (s < 60) return `${s} second${s === 1 ? "" : "s"} ago`;
    const m = Math.floor(s / 60);
    if (m < 60) return `${m} minute${m === 1 ? "" : "s"} ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h} hour${h === 1 ? "" : "s"} ago`;
    const d = Math.floor(h / 24);
    if (d < 7) return `${d} day${d === 1 ? "" : "s"} ago`;
    const w = Math.floor(d / 7);
    if (w < 5) return `${w} week${w === 1 ? "" : "s"} ago`;
    const mon = Math.floor(d / 30);
    if (mon < 12) return `${mon} month${mon === 1 ? "" : "s"} ago`;
    const y = Math.floor(d / 365);
    return `${y} year${y === 1 ? "" : "s"} ago`;
  }

  async function handleDelete(id: string) {
    try {
      await fetch(`/api/posts/${encodeURIComponent(id)}`, { method: "DELETE" });
    } catch {
      // ignore network errors; fall back to local removal
    } finally {
      setPosts((prev) => prev.filter((p) => p.id !== id));
    }
  }

  React.useEffect(() => {
    fetch("/api/posts?limit=30")
      .then((r) => r.json())
      .then((d) => {
        const arr = Array.isArray(d.posts) ? d.posts : [];
        const normalized: Post[] = arr.map((raw: unknown) => {
          const p = raw as Record<string, unknown>;
          const media =
            typeof p.mediaUrl === "string"
              ? (p.mediaUrl as string)
              : typeof p.media_url === "string"
              ? (p.media_url as string)
              : null;
          return {
            id: String(p.id ?? crypto.randomUUID()),
            user_name:
              typeof p.user_name === "string"
                ? (p.user_name as string)
                : typeof p.userName === "string"
                ? (p.userName as string)
                : "Capsules",
            user_avatar:
              typeof p.user_avatar === "string"
                ? (p.user_avatar as string)
                : typeof p.userAvatar === "string"
                ? (p.userAvatar as string)
                : null,
            content: typeof p.content === "string" ? (p.content as string) : null,
            media_url: media,
            created_at:
              typeof p.created_at === "string" ? (p.created_at as string) : undefined,
          };
        });
        setPosts(normalized.length ? normalized : fallbackPosts);
      })
      .catch(() => setPosts(fallbackPosts));

    fetch("/api/friends/sync", { method: "POST" })
      .then((r) => r.json())
      .then((d) => {
        const arr = Array.isArray(d.friends) ? d.friends : [];
        const mapped: Friend[] = arr.map((raw: unknown) => {
          const f = raw as Record<string, unknown>;
          return {
            name: String((f as any).name ?? (f as any).userName ?? "Friend"),
            avatar:
              typeof (f as any).avatar === "string"
                ? ((f as any).avatar as string)
                : typeof (f as any).userAvatar === "string"
                ? ((f as any).userAvatar as string)
                : null,
          };
        });
        setFriends(mapped.length ? mapped : fallbackFriends);
      })
      .catch(() => setFriends(fallbackFriends));
  }, []);

  const connectionTiles = React.useMemo(
    () => [
      {
        key: "friends",
        title: "Friends",
        description: "Manage the people in your capsule.",
        href: "/friends?tab=friends",
        icon: "👥",
        badge: friends.length || undefined,
        primary: true,
      },
      {
        key: "chats",
        title: "Chats",
        description: "Jump back into conversations or start one.",
        href: "/friends?tab=chats",
        icon: "💬",
      },
      {
        key: "requests",
        title: "Requests",
        description: "Approve or invite new members in seconds.",
        href: "/friends?tab=requests",
        icon: "✨",
      },
    ],
    [friends.length],
  );

  return (
    <div className={`${styles.page} ${className}`.trim()}>
      {showPrompter ? <AiPrompterStage /> : null}

      <div className={styles.layout}>
        {showPromoRow ? (
          <div className={styles.promoRowSpace}>
            <PromoRow />
          </div>
        ) : null}

        {showRail ? (
          <aside className={styles.rail}>
            <div className={styles.connectionTiles}>
              {connectionTiles.map((tile) => (
                <Link
                  key={tile.key}
                  href={tile.href}
                  className={`${styles.connectionTile} ${tile.primary ? styles.connectionTilePrimary : ""}`.trim()}
                >
                  <div className={styles.connectionTileHeader}>
                    <div className={styles.connectionTileMeta}>
                      <span className={styles.connectionTileIcon} aria-hidden>
                        {tile.icon}
                      </span>
                      <span className={styles.connectionTileTitle}>{tile.title}</span>
                    </div>
                    {tile.badge ? <span className={styles.connectionTileBadge}>{tile.badge}</span> : null}
                  </div>
                  <p className={styles.connectionTileDescription}>{tile.description}</p>
                </Link>
              ))}
            </div>
          </aside>
        ) : null}

        {showFeed ? (
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
                  {media ? (
                    <img className={styles.media} src={media} alt="Post media" />
                  ) : null}
                  <footer className={styles.actionBar}>
                    <button className={styles.actionBtn} type="button">Like</button>
                    <button className={styles.actionBtn} type="button">Comment</button>
                    <button className={styles.actionBtn} type="button">Share</button>
                    <button className={`${styles.actionBtn} ${styles.delete}`} type="button" onClick={() => handleDelete(p.id)}>Delete</button>
                  </footer>
                </article>
              );
            })}
          </section>
        ) : null}
      </div>
    </div>
  );
}
