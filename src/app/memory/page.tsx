import type { Metadata } from "next";
import Link from "next/link";
import { auth } from "@clerk/nextjs/server";

import { listMemories } from "@/lib/supabase/memories";
import { HeaderAuth } from "@/components/header-auth";

import styles from "./memory.module.css";

type Memory = {
  id: string;
  kind: string;
  media_url: string | null;
  title: string | null;
  description: string | null;
  created_at: string;
};

export const metadata: Metadata = {
  title: "Memory - Capsules",
  description: "Your uploads and generated media.",
  robots: { index: false },
};

export default async function MemoryPage() {
  const { userId } = await auth();

  let items: Memory[] = [];
  if (userId) {
    items = (await listMemories({ ownerId: userId })) as unknown as Memory[];
  }

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
            <Link href="/capsule" className={styles.navLink}>Capsule</Link>
            <span className={`${styles.navLink} ${styles.navLinkActive}`}>Memory</span>
          </nav>
          <div className={styles.headerActions}>
            <Link href="/settings" className={styles.secondaryAction}>Settings</Link>
            <Link href="/create" className={styles.primaryCta}>Launch Capsule</Link>
            <HeaderAuth />
          </div>
        </div>
      </header>

      <main className={styles.main}>
        {!userId && (
          <div className={styles.empty}>Sign in to view your memory.</div>
        )}
        {userId && items.length === 0 && (
          <div className={styles.empty}>No memory items yet.</div>
        )}
        {userId && items.length > 0 && (
          <div className={styles.grid}>
            {items.map((m) => (
              <article key={m.id} className={styles.card}>
                {m.media_url && (
                  <img className={styles.thumb} alt={m.title || "Memory"} src={m.media_url} />
                )}
                <div className={styles.meta}>
                  <strong>{m.title || m.kind}</strong>
                  {m.description ? <p>{m.description}</p> : null}
                </div>
              </article>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

