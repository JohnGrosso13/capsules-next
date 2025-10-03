import type { Metadata } from "next";
import Image from "next/image";
import { auth } from "@clerk/nextjs/server";

import { AppPage } from "@/components/app-page";
import { listMemories } from "@/lib/supabase/memories";

import styles from "./memory.module.css";

type Memory = {
  id: string;
  kind: string;
  mediaUrl: string | null;
  title: string | null;
  description: string | null;
  created_at: string;
};

export const metadata: Metadata = {
  title: "Memory - Capsules",
  description: "Your uploads and generated media.",
  robots: { index: false },
};

export const runtime = "nodejs";

export default async function MemoryPage() {
  const { userId } = await auth();

  const rawItems = userId ? await listMemories({ ownerId: userId }) : [];
  const items: Memory[] = Array.isArray(rawItems)
    ? rawItems.map((entry) => {
        const record = entry as Record<string, unknown>;
        return {
          id: String(record.id ?? ""),
          kind: String(record.kind ?? "memory"),
          mediaUrl:
            typeof record.mediaUrl === "string"
              ? record.mediaUrl
              : typeof record.media_url === "string"
                ? record.media_url
                : null,
          title: typeof record.title === "string" ? record.title : null,
          description:
            typeof record.description === "string" ? record.description : null,
          created_at: String(record.created_at ?? new Date().toISOString()),
        };
      })
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
                {m.mediaUrl ? (
                  <Image
                    className={styles.thumb}
                    alt={m.title || "Memory"}
                    src={m.mediaUrl}
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
