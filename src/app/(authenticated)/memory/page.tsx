import type { Metadata } from "next";
import Image from "next/image";
import { auth } from "@clerk/nextjs/server";

import { AppPage } from "@/components/app-page";
import { listMemories } from "@/lib/supabase/memories";

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

  const items: Memory[] = userId
    ? ((await listMemories({ ownerId: userId })) as unknown as Memory[])
    : [];

  return (
    <AppPage activeNav="memory" showPrompter={false}>
      <section className={styles.wrapper}>
        {!userId ? (
          <div className={styles.empty}>Sign in to view your memory.</div>
        ) : items.length === 0 ? (
          <div className={styles.empty}>No memory items yet.</div>
        ) : (
          <div className={styles.grid}>
            {items.map((m) => (
              <article key={m.id} className={styles.card}>
                {m.media_url ? (
                  <Image
                    className={styles.thumb}
                    alt={m.title || "Memory"}
                    src={m.media_url}
                    width={800}
                    height={450}
                    sizes="(max-width: 640px) 50vw, (max-width: 1200px) 25vw, 220px"
                    unoptimized
                  />
                ) : null}
                <div className={styles.meta}>
                  <strong>{m.title || m.kind}</strong>
                  {m.description ? <p>{m.description}</p> : null}
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </AppPage>
  );
}
