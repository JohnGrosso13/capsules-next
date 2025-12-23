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
import { MemorySearchCta } from "@/components/memory/memory-search-cta";
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

const MEMORY_SEED_LIMIT = 24;

type MemorySeeds = {
  partyRecaps: MemoryUploadItem[];
  polls: MemoryUploadItem[];
  savedPosts: MemoryUploadItem[];
  uploads: MemoryUploadItem[];
  aiImages: MemoryUploadItem[];
  aiVideos: MemoryUploadItem[];
  pdfs: MemoryUploadItem[];
  powerpoints: MemoryUploadItem[];
  savedCreations: MemoryUploadItem[];
  assets: MemoryUploadItem[];
};

async function loadMemorySeeds(ownerId: string, origin: string | null): Promise<MemorySeeds> {
  // We reuse the uploads list for multiple carousels (uploads, PDFs, PPTs) to avoid extra queries.
  const uploadPromise = listMemories({
    ownerId,
    kind: "upload",
    origin,
    limit: MEMORY_SEED_LIMIT,
  });

  const [
    partyRecapsResult,
    pollsResult,
    savedPostsResult,
    uploadsResult,
    aiImagesResult,
    aiVideosResult,
    savedCreationsResult,
    assetsResult,
  ] = await Promise.allSettled([
    listMemories({ ownerId, kind: "party_summary", origin, limit: MEMORY_SEED_LIMIT }),
    listMemories({ ownerId, kind: "poll", origin, limit: MEMORY_SEED_LIMIT }),
    listMemories({ ownerId, kind: "post_memory", origin, limit: MEMORY_SEED_LIMIT }),
    uploadPromise,
    listMemories({ ownerId, kind: "composer_image", origin, limit: MEMORY_SEED_LIMIT }),
    listMemories({ ownerId, kind: "video", origin, limit: MEMORY_SEED_LIMIT }),
    listMemories({ ownerId, kind: "composer_creation", origin, limit: MEMORY_SEED_LIMIT }),
    listMemories({ ownerId, kind: null, origin, limit: MEMORY_SEED_LIMIT }),
  ]);

  const unpack = (result: PromiseSettledResult<unknown>): MemoryUploadItem[] =>
    result.status === "fulfilled" && Array.isArray(result.value)
      ? (result.value as MemoryUploadItem[])
      : [];

  const uploads = unpack(uploadsResult);

  return {
    partyRecaps: unpack(partyRecapsResult),
    polls: unpack(pollsResult),
    savedPosts: unpack(savedPostsResult),
    uploads,
    aiImages: unpack(aiImagesResult),
    aiVideos: unpack(aiVideosResult),
    pdfs: uploads,
    powerpoints: uploads,
    savedCreations: unpack(savedCreationsResult),
    assets: unpack(assetsResult),
  };
}

export default async function MemoryPage() {
  const [session, origin] = await Promise.all([ensureUserSession(), resolveRequestOrigin()]);
  const seeds = await loadMemorySeeds(session.supabaseUserId, origin);

  return (
    <AppPage activeNav="memory" showDiscoveryRightRail>
      <section className={styles.wrapper}>
        <header className={styles.hero}>
          <h1>Memory</h1>
          <p>Upload files, media, and documents. Your assistant will recall them instantly.</p>
        </header>
        <MemorySearchCta />
        <PartyRecapsCarousel initialItems={seeds.partyRecaps} />
        <PollsCarousel initialItems={seeds.polls} />
        <PostMemoriesCarousel initialItems={seeds.savedPosts} />
        <UploadsCarousel initialItems={seeds.uploads} pageSize={MEMORY_SEED_LIMIT} />
        <AiImagesCarousel initialItems={seeds.aiImages} pageSize={MEMORY_SEED_LIMIT} />
        <AiVideosCarousel initialItems={seeds.aiVideos} pageSize={MEMORY_SEED_LIMIT} />
        <PowerpointsCarousel initialItems={seeds.powerpoints} pageSize={MEMORY_SEED_LIMIT} />
        <PdfsCarousel initialItems={seeds.pdfs} pageSize={MEMORY_SEED_LIMIT} />
        <SavedCreationsCarousel initialItems={seeds.savedCreations} pageSize={MEMORY_SEED_LIMIT} />
        <CapsuleAssetsCarousel initialItems={seeds.assets} pageSize={MEMORY_SEED_LIMIT} />
      </section>
    </AppPage>
  );
}
