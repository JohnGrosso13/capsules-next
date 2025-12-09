import type { Metadata } from "next";

import { AppPage } from "@/components/app-page";
import {
  AiVideosCarousel,
  PdfsCarousel,
  PowerpointsCarousel,
  UploadsCarousel,
} from "@/components/memory/uploads-carousel";
import {
  AiImagesCarousel,
  CapsuleAssetsCarousel,
  SavedCreationsCarousel,
} from "@/components/memory/asset-carousel";
import { PartyRecapsCarousel } from "@/components/memory/party-recaps-carousel";
import { PollsCarousel } from "@/components/memory/polls-carousel";
import { PostMemoriesCarousel } from "@/components/memory/post-memories-carousel";
import type { MemoryUploadItem } from "@/components/memory/uploads-types";
import { ensureUserSession, resolveRequestOrigin } from "@/server/actions/session";
import { listMemories } from "@/server/memories/service";

import styles from "./memory.module.css";

export const metadata: Metadata = {
  title: "Memory - Capsules",
  description: "Your uploaded files, docs, and generated media.",
  robots: { index: false },
};

export const runtime = "nodejs";

const MEMORY_PAGE_LIMIT = 48;
const MEMORY_FETCH_TIMEOUT_MS = 5000;

async function loadMemoryPageData(): Promise<{
  uploads: MemoryUploadItem[];
  aiImages: MemoryUploadItem[];
  aiVideos: MemoryUploadItem[];
  partyRecaps: MemoryUploadItem[];
  polls: MemoryUploadItem[];
  postMemories: MemoryUploadItem[];
  creations: MemoryUploadItem[];
}> {
  const session = await ensureUserSession();
  const origin = await resolveRequestOrigin();
  const baseParams = {
    ownerId: session.supabaseUserId,
    origin,
    limit: MEMORY_PAGE_LIMIT,
  };

  const fetchKind = async (kind: string) => {
    try {
      const timer = new Promise<"timeout">((resolve) =>
        setTimeout(() => resolve("timeout"), MEMORY_FETCH_TIMEOUT_MS),
      );
      const result = (await Promise.race([
        listMemories({ ...baseParams, kind }),
        timer,
      ])) as MemoryUploadItem[] | "timeout";
      if (result === "timeout") return [] as MemoryUploadItem[];
      return result;
    } catch (error) {
      console.warn("memory page preload failed", kind, error);
      return [] as MemoryUploadItem[];
    }
  };

  const [uploads, aiImages, aiVideos, partyRecaps, polls, postMemories, creations] =
    await Promise.all([
      fetchKind("upload"),
      fetchKind("composer_image"),
      fetchKind("video"),
      fetchKind("party_summary"),
      fetchKind("poll"),
      fetchKind("post_memory"),
      fetchKind("composer_creation"),
    ]);

  return {
    uploads,
    aiImages,
    aiVideos,
    partyRecaps,
    polls,
    postMemories,
    creations,
  };
}

export default async function MemoryPage() {
  const data = await loadMemoryPageData();

  return (
    <AppPage activeNav="memory" showDiscoveryRightRail>
      <section className={styles.wrapper}>
        <header className={styles.hero}>
          <h1>Memory</h1>
          <p>Upload files, media, and documents. Capsule AI will recall them instantly.</p>
        </header>
        <PartyRecapsCarousel initialItems={data.partyRecaps} />
        <PollsCarousel initialItems={data.polls} />
        <PostMemoriesCarousel initialItems={data.postMemories} />
        <UploadsCarousel initialItems={data.uploads} />
        <AiImagesCarousel initialItems={data.aiImages} />
        <AiVideosCarousel initialItems={data.aiVideos} />
        <PowerpointsCarousel initialItems={data.uploads} />
        <PdfsCarousel initialItems={data.uploads} />
        <SavedCreationsCarousel initialItems={data.creations} />
        <CapsuleAssetsCarousel />
      </section>
    </AppPage>
  );
}
