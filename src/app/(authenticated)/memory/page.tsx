import type { Metadata } from "next";

import { AppPage } from "@/components/app-page";

import styles from "./memory.module.css";
import { UploadsCarousel } from "@/components/memory/uploads-carousel";
import { BannersCarousel } from "@/components/memory/banners-carousel";

export const metadata: Metadata = {
  title: "Memory - Capsules",
  description: "Your uploads and generated media.",
  robots: { index: false },
};

export const runtime = "nodejs";

export default function MemoryPage() {
  return (
    <AppPage activeNav="memory" showDiscoveryRightRail>
      <section className={styles.wrapper}>
        <header className={styles.hero}>
          <h1>Memory</h1>
          <p>Upload images and videos - instantly recalled with natural language.</p>
        </header>
        <UploadsCarousel />
        <BannersCarousel />
      </section>
    </AppPage>
  );
}

