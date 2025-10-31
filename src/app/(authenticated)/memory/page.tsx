import type { Metadata } from "next";

import { AppPage } from "@/components/app-page";

import styles from "./memory.module.css";
import { UploadsCarousel } from "@/components/memory/uploads-carousel";
import { CapsuleAssetsCarousel, ComposerCreationsCarousel } from "@/components/memory/asset-carousel";

export const metadata: Metadata = {
  title: "Memory - Capsules",
  description: "Your uploaded files, docs, and generated media.",
  robots: { index: false },
};

export const runtime = "nodejs";

export default function MemoryPage() {
  return (
    <AppPage activeNav="memory" showDiscoveryRightRail>
      <section className={styles.wrapper}>
        <header className={styles.hero}>
          <h1>Memory</h1>
          <p>Upload files, media, and documents. Capsule AI will recall them instantly.</p>
        </header>
        <UploadsCarousel />
        <ComposerCreationsCarousel />
        <CapsuleAssetsCarousel />
      </section>
    </AppPage>
  );
}
