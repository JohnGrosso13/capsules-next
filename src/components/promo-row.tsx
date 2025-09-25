"use client";

/* eslint-disable @next/next/no-img-element */

import React from "react";
import Link from "next/link";
import styles from "./promo-row.module.css";

type Post = { id: string; media_url?: string | null; content?: string | null };
type Friend = { name: string; avatar?: string | null };

const fallbackMedia: Post[] = [
  { id: "media-1", media_url: "/globe.svg", content: "Discover Capsule Launches" },
  { id: "media-2", media_url: "/window.svg", content: "Design inspiration from Capsules" },
];

const fallbackFriends: Friend[] = [
  { name: "Capsules Team" },
  { name: "Memory Bot" },
  { name: "Dream Studio" },
];

export function PromoRow() {
  const [mediaPosts, setMediaPosts] = React.useState<Post[]>([]);
  const [friends, setFriends] = React.useState<Friend[]>([]);

  React.useEffect(() => {
    // fetch latest media posts
    fetch("/api/posts?limit=20")
      .then((r) => r.json() as Promise<{ posts?: unknown[] }>)
      .then((d) => {
        const arr = Array.isArray(d.posts) ? d.posts : [];
        const posts: Post[] = arr
          .map((p) => p as Record<string, unknown>)
          .filter((p) => typeof p.mediaUrl === "string" || typeof p.media_url === "string")
          .map((p) => ({ id: String(p.id ?? crypto.randomUUID()), media_url: (p.mediaUrl as string) || (p.media_url as string), content: (p.content as string) ?? null }));
        const filled = posts.slice(0, 2);
        setMediaPosts(filled.length ? filled : fallbackMedia);
      })
      .catch(() => setMediaPosts(fallbackMedia));

    // fetch friends recommendations (using friends sync endpoint as a list source)
    fetch("/api/friends/sync", { method: "POST" })
      .then((r) => r.json() as Promise<{ friends?: unknown[] }>)
      .then((d) => {
        const arr = Array.isArray(d.friends) ? d.friends : [];
        const list: Friend[] = arr
          .map((f) => f as Record<string, unknown>)
          .map((f) => ({ name: String(f.name ?? f.userName ?? "Friend"), avatar: (f.avatar as string) || (f.userAvatar as string) || null }));
        const trimmed = list.slice(0, 6);
        setFriends(trimmed.length ? trimmed : fallbackFriends);
      })
      .catch(() => setFriends(fallbackFriends));
  }, []);

  const recCapsules = [
    { name: "Creators Guild" },
    { name: "Indie Devs" },
    { name: "Design Brush" },
  ];

  const p1 = mediaPosts[0];
  const p2 = mediaPosts[1];

  return (
    <div className={styles.row}>
      <div className={styles.tile}>
        <div className={styles.head}><span>From your feed</span><span className={styles.small}>Post</span></div>
        <div className={styles.short}>
          {p1?.media_url ? (
            <img className={styles.media} src={p1.media_url} alt="Post media" />
          ) : (
            <div className={styles.media} />
          )}
        </div>
        <div className={styles.small}>{p1?.content || "Recently added media"}</div>
      </div>
      <div className={styles.tile}>
        <div className={styles.head}><span>Trending image</span><span className={styles.small}>Post</span></div>
        <div className={styles.short}>
          {p2?.media_url ? (
            <img className={styles.media} src={p2.media_url} alt="Post media" />
          ) : (
            <div className={styles.media} />
          )}
        </div>
        <div className={styles.small}>{p2?.content || "Popular across capsules"}</div>
      </div>
      <div className={styles.tile}>
        <div className={styles.head}><span>People to follow</span><span className={styles.small}>Friends</span></div>
        <div className={styles.short}>
          <div className={styles.avatars}>
            {friends.slice(0, 3).map((f, i) => (
              <span key={i} className={styles.avatar} title={f.name} />
            ))}
          </div>
        </div>
        <div className={styles.small}>Discover creators like you</div>
      </div>
      <div className={styles.tile}>
        <div className={styles.head}><span>Recommended Capsules</span><span className={styles.small}>Discover</span></div>
        <div className={styles.short}>
          <div className={styles.chips}>
            {recCapsules.map((c, i) => (
              <Link key={i} href="/capsule" className={styles.ghost}>{c.name}</Link>
            ))}
          </div>
        </div>
        <div className={styles.small}>Spaces trending this week</div>
      </div>
    </div>
  );
}

