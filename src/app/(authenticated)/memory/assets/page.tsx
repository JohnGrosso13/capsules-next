import type { Metadata } from "next";

import { AppPage } from "@/components/app-page";
import { CapsuleAssetsGallery } from "@/components/memory/capsule-assets-gallery";

import styles from "../memory.module.css";

export const metadata: Metadata = {
  title: "Capsule Assets - Capsules",
  description: "Browse every banner, tile, and logo generated for your capsules.",
  robots: { index: false },
};

type CapsuleAssetsPageProps = {
  searchParams?: Record<string, string | string[] | undefined>;
};

function resolveTabParam(searchParams: CapsuleAssetsPageProps["searchParams"]): string | null {
  if (!searchParams) return null;
  const value = searchParams.tab;
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }
  return typeof value === "string" ? value : null;
}

export default function CapsuleAssetsPage({ searchParams }: CapsuleAssetsPageProps) {
  const initialTab = resolveTabParam(searchParams);

  return (
    <AppPage activeNav="memory" showDiscoveryRightRail>
      <section className={styles.wrapper}>
        <header className={styles.hero}>
          <h1>Capsule Assets</h1>
          <p>Explore every banner, tile, and logo you have saved across capsules and profiles.</p>
        </header>
        <CapsuleAssetsGallery initialTab={initialTab} />
      </section>
    </AppPage>
  );
}
