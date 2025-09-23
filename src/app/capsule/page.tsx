import type { Metadata } from "next";
import Link from "next/link";

import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { HeaderAuth } from "@/components/header-auth";
import { LaunchCta } from "@/components/launch-cta";
import { SignedIn } from "@clerk/nextjs";

import styles from "./capsule.module.css";
import landing from "../landing.module.css";
import home from "@/components/home.module.css";

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
      <header className={landing.header}>
        <div className={landing.headerInner}>
          <Link href="/" className={landing.brand} aria-label="Capsules home">
            <span className={landing.brandMark} aria-hidden="true" />
            <span className={landing.brandName}>Capsules</span>
          </Link>
          <nav className={landing.nav} aria-label="Primary navigation">
            <Link href="/" className={landing.navLink}>Home</Link>
            <Link href="/create" className={landing.navLink}>Create</Link>
            <span className={`${landing.navLink} ${landing.navLinkActive}`}>Capsule</span>
            <Link href="/memory" className={landing.navLink}>Memory</Link>
          </nav>
          <div className={landing.headerActions}>
            {/* Profile */}
            <HeaderAuth />
            {/* Settings */}
            <SignedIn>
              <Link href="/settings" className={landing.iconButton} aria-label="Settings">
                <svg className={landing.iconGlyph} viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false">
                  <defs>
                    <linearGradient id="hdrGearGradCapsule" x1="0" y1="0" x2="24" y2="24" gradientUnits="userSpaceOnUse">
                      <stop offset="0" stopColor="#8b5cf6"/>
                      <stop offset="1" stopColor="#22d3ee"/>
                    </linearGradient>
                  </defs>
                  <g stroke="url(#hdrGearGradCapsule)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke">
                    <circle cx="12" cy="12" r="7.25" strokeDasharray="2.1 2.1"/>
                    <path d="M12 3.6v2.2M20.4 12h-2.2M12 20.4v-2.2M3.6 12h2.2"/>
                    <circle cx="12" cy="12" r="3.4"/>
                  </g>
                </svg>
              </Link>
            </SignedIn>
            {/* Launch */}
            <LaunchCta className={landing.primaryCta} hrefWhenSignedIn="/capsule" label="Launch Capsule" />
          </div>
        </div>
      </header>

      <main className={styles.main}>
        {/* AI Prompter at top spanning both columns */}
        <div className={styles.fullRow}>
          <section className={home.prompterStage} aria-label="AI Prompter">
            <div className={home.prompter}>
              <div className={home.promptBar}>
                <input className={home.input} placeholder={"Ask your Capsule AI to create anything…"} />
                <button className={home.genBtn} type="button">
                  <span aria-hidden>✨</span>
                  <span className={home.genLabel}>Generate</span>
                </button>
              </div>
              <div className={home.chips}>
                {['Make a post', 'Share a photo', 'Remix last image', 'Summarize my feed'].map((c) => (
                  <button key={c} className={home.chip} type="button">{c}</button>
                ))}
              </div>
            </div>
          </section>
        </div>

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
