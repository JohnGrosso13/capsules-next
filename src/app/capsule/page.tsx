import type { Metadata } from "next";
import Link from "next/link";

import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { HeaderAuth } from "@/components/header-auth";

import styles from "./capsule.module.css";

type Post = {
  id: string;
  kind: string;
  content: string;
  media_url: string | null;
  user_name: string | null;
  user_avatar: string | null;
  created_at: string;
};

export const metadata: Metadata = {
  title: "Capsule - Capsules",
  description: "Your capsule feed built with Next.js + Clerk.",
};

async function loadRecentPosts(): Promise<Post[]> {
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from("posts")
    .select("id, kind, content, media_url, user_name, user_avatar, created_at")
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(20);
  if (error || !data) return [];
  return data as unknown as Post[];
}

export default async function CapsulePage() {
  const posts = await loadRecentPosts();

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div className={styles.headerInner}>
          <Link href="/" className={styles.brand} aria-label="Capsules home">
            <span className={styles.brandMark} aria-hidden="true" />
            <span className={styles.brandName}>Capsules</span>
          </Link>
          <nav className={styles.nav} aria-label="Primary navigation">
            <Link href="/" className={styles.navLink}>Home</Link>
            <Link href="/create" className={styles.navLink}>Create</Link>
            <span className={`${styles.navLink} ${styles.navLinkActive}`}>Capsule</span>
            <Link href="/memory" className={styles.navLink}>Memory</Link>
          </nav>
          <div className={styles.headerActions}>
            <Link href="/settings" className={styles.secondaryAction}>Settings</Link>
            <Link href="/create" className={styles.primaryCta}>Launch Capsule</Link>
            <HeaderAuth />
          </div>
        </div>
      </header>

      <main className={styles.main}>
        <section className={styles.feed} aria-label="Feed">
          {posts.length === 0 && (
            <div className={styles.card}>No posts yet. Try creating one from the Create page.</div>
          )}
          {posts.map((p) => (
            <article key={p.id} className={styles.post}>
              {p.media_url ? (
                <img src={p.media_url} alt="Post media" className={styles.postMedia} />
              ) : null}
              <div className={styles.postBody}>
                {p.user_name ? (
                  <div className={styles.postMeta}>{p.user_name}</div>
                ) : null}
                <h3 className={styles.postTitle}>{p.kind?.toUpperCase() || "POST"}</h3>
                <p>{p.content}</p>
              </div>
            </article>
          ))}
        </section>

        <aside className={styles.rail} aria-label="Right rail">
          <div className={styles.card}>
            <strong>Friends</strong>
            <div className={styles.friendsList}>
              <span>Coming soon</span>
            </div>
          </div>
        </aside>
      </main>
    </div>
  );
}

