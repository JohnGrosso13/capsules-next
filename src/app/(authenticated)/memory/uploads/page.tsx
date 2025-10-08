import type { Metadata } from "next";

import { AppPage } from "@/components/app-page";

import styles from "./uploads.module.css";
import { UploadsGallery } from "@/components/memory/uploads-gallery";

export const metadata: Metadata = {
  title: "Uploads - Memory",
  description: "Browse all of your uploaded memories.",
  robots: { index: false },
};

export const runtime = "nodejs";

export default function MemoryUploadsPage() {
  return (
    <AppPage activeNav="memory" showPrompter={false}>
      <section className={styles.wrapper}>
        <header className={styles.hero}>
          <h1>Uploads</h1>
          <p>All of your uploaded images and videos in one place. Use the Memory page for quick access and uploads.</p>
        </header>
        <UploadsGallery />
      </section>
    </AppPage>
  );
}

