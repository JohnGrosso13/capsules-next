import type { Metadata } from "next";

import { AppPage } from "@/components/app-page";

import styles from "./memory.module.css";

export const metadata: Metadata = {
  title: "Memory - Capsules",
  description: "Your uploads and generated media.",
  robots: { index: false },
};

export const runtime = "nodejs";

export default function MemoryPage() {
  return (
    <AppPage activeNav="memory" showPrompter={false}>
      <section className={styles.wrapper}>
        <header className={styles.hero}>
          <h1>Memory</h1>
          <p>Channel Memory will live here soon.</p>
        </header>
        <div className={styles.placeholder}>
          <p>We are getting things ready. In the meantime, explore your connections from the left rail.</p>
        </div>
      </section>
    </AppPage>
  );
}
