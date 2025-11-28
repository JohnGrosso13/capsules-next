import type { Metadata } from "next";

import { AppPage } from "@/components/app-page";

import styles from "./memory.module.css";
import { AiVideosCarousel, PdfsCarousel, UploadsCarousel } from "@/components/memory/uploads-carousel";
import {
  AiImagesCarousel,
  CapsuleAssetsCarousel,
  SavedCreationsCarousel,
} from "@/components/memory/asset-carousel";
import { PartyRecapsCarousel } from "@/components/memory/party-recaps-carousel";

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
        <PartyRecapsCarousel />
        <UploadsCarousel />
        <AiImagesCarousel />
        <AiVideosCarousel />
        <PdfsCarousel />
        <SavedCreationsCarousel />
        <CapsuleAssetsCarousel />
      </section>
    </AppPage>
  );
}
