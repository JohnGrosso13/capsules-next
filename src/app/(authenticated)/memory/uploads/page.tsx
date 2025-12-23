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

type MemoryUploadsPageProps = {
  searchParams?: Record<string, string | string[] | undefined>;
};

function resolveTabParam(searchParams: MemoryUploadsPageProps["searchParams"]): string | null {
  if (!searchParams) return null;
  const value = searchParams.tab;
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }
  return typeof value === "string" ? value : null;
}

export default function MemoryUploadsPage({ searchParams }: MemoryUploadsPageProps) {
  const initialTab = resolveTabParam(searchParams);

  return (
    <AppPage activeNav="memory" showPrompter={false} wideWithoutRightRail>
      <section className={styles.wrapper}>
        <header className={styles.hero}>
          <h1>Uploads</h1>
          <p>
            All of your uploads, AI creations, PDFs, and recaps in one place. Use the Memory page
            for quick access, uploads, and discovery.
          </p>
        </header>
        <UploadsGallery initialTab={initialTab} />
      </section>
    </AppPage>
  );
}
