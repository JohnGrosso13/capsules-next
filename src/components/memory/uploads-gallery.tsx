"use client";
import * as React from "react";

import styles from "./uploads-gallery.module.css";
import { Button, ButtonLink } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowLeft, FileText } from "@phosphor-icons/react/dist/ssr";
import { shouldBypassCloudflareImages } from "@/lib/cloudflare/runtime";

import { computeDisplayUploads } from "./process-uploads";
import { useMemoryUploads } from "./use-memory-uploads";
import type { DisplayMemoryUpload } from "./uploads-types";
import { getUploadExtension, isImage, isVideo } from "./upload-helpers";
import { isAiVideoMemory, isPdfMemory, isPowerpointMemory } from "./uploads-carousel";

type MemoryTab = {
  value: string;
  label: string;
  kind: string | null;
  filter?: (item: DisplayMemoryUpload) => boolean;
  usesMedia?: boolean;
  emptyLoading: string;
  emptyNone: string;
};

const MEMORY_TABS: MemoryTab[] = [
  {
    value: "uploads",
    label: "Uploads",
    kind: "upload",
    emptyLoading: "Loading your uploads...",
    emptyNone: "No uploads yet. Add one from the Memory page.",
  },
  {
    value: "ai-images",
    label: "AI Images",
    kind: "composer_image",
    emptyLoading: "Loading your AI images...",
    emptyNone: "No AI images yet. Generate an image in the composer to see it here.",
  },
  {
    value: "ai-videos",
    label: "AI Videos",
    kind: "video",
    filter: isAiVideoMemory,
    emptyLoading: "Loading your AI videos...",
    emptyNone: "No AI videos yet. Generate a video in the AI composer to see it here.",
  },
  {
    value: "pdfs",
    label: "PDFs",
    kind: "upload",
    filter: isPdfMemory,
    emptyLoading: "Loading your PDFs...",
    emptyNone: "No PDFs yet. Generate or upload a PDF to see it here.",
  },
  {
    value: "powerpoints",
    label: "Powerpoints",
    kind: "upload",
    filter: isPowerpointMemory,
    emptyLoading: "Loading your Powerpoints...",
    emptyNone: "No Powerpoints yet. Generate a PPTX in Composer to see it here.",
  },
  {
    value: "polls",
    label: "Polls",
    kind: "poll",
    usesMedia: false,
    emptyLoading: "Loading your polls...",
    emptyNone: "No polls saved yet. Save a poll to Memory to see it here.",
  },
  {
    value: "party-recaps",
    label: "Party Recaps",
    kind: "party_summary",
    usesMedia: false,
    emptyLoading: "Loading your party recaps...",
    emptyNone: "No party recaps yet. Enable summaries in a live party to generate one.",
  },
  {
    value: "saved-creations",
    label: "Saved Creations",
    kind: "composer_creation",
    emptyLoading: "Loading your saved creations...",
    emptyNone: "No creations saved yet. Generate something in the composer and tap Save.",
  },
  {
    value: "saved-posts",
    label: "Saved Posts",
    kind: "post_memory",
    usesMedia: false,
    emptyLoading: "Loading your saved posts...",
    emptyNone: "No saved posts yet. Tap the Memory icon on a post to save it.",
  },
];

export function resolveInitialTab(value: string | null | undefined): string {
  if (!value) return MEMORY_TABS[0]?.value ?? "uploads";
  const normalized = value.toLowerCase();
  return MEMORY_TABS.some((tab) => tab.value === normalized)
    ? normalized
    : MEMORY_TABS[0]?.value ?? "uploads";
}

type UploadsGalleryProps = {
  initialTab?: string | null;
};

export function UploadsGallery({ initialTab }: UploadsGalleryProps) {
  const [activeTab, setActiveTab] = React.useState<string>(() => resolveInitialTab(initialTab));
  const tab = React.useMemo<MemoryTab>(() => {
    const resolved = MEMORY_TABS.find((entry) => entry.value === activeTab);
    return (
      resolved ?? {
        value: "uploads",
        label: "Uploads",
        kind: "upload",
        emptyLoading: "Loading your uploads...",
        emptyNone: "No uploads yet. Add one from the Memory page.",
      }
    );
  }, [activeTab]);

  React.useEffect(() => {
    setActiveTab(resolveInitialTab(initialTab));
  }, [initialTab]);

  const { user, items, loading, loadingMore, error, refresh, hasMore, loadMore } = useMemoryUploads(
    tab.kind,
    { enablePaging: true, pageSize: 48 },
  );

  const cloudflareEnabled = React.useMemo(() => !shouldBypassCloudflareImages(), []);
  const currentOrigin = React.useMemo(
    () => (typeof window !== "undefined" ? window.location.origin : null),
    [],
  );

  const processedItems = React.useMemo(
    () =>
      tab.usesMedia === false
        ? (items.map((item) => ({
            ...item,
            displayUrl: item.media_url ?? "",
            fullUrl: item.media_url ?? "",
          })) as DisplayMemoryUpload[])
        : computeDisplayUploads(items, { origin: currentOrigin, cloudflareEnabled }),
    [cloudflareEnabled, currentOrigin, items, tab.usesMedia],
  );

  const filteredItems = React.useMemo(
    () => (tab.filter ? processedItems.filter(tab.filter) : processedItems),
    [processedItems, tab],
  );

  const renderCard = (item: DisplayMemoryUpload) => {
    const url = item.displayUrl || item.media_url || "";
    const fullUrl = item.fullUrl || url;
    const mime = item.media_type || null;
    const title = item.title?.trim() || item.description?.trim() || "Upload";
    const desc = item.description?.trim() || null;
    const extension = getUploadExtension(item);
    const imageLike = isImage(mime, extension);
    const videoLike = isVideo(mime, extension);
    const metaType = mime ?? extension ?? null;

    return (
      <article key={item.id} className={styles.card}>
        <div className={styles.media}>
          {videoLike && fullUrl ? (
            <video className={styles.video} src={fullUrl} preload="metadata" controls />
          ) : imageLike && url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img className={styles.img} src={url} alt={title} loading="lazy" />
          ) : (
            <div className={styles.filePreview} aria-hidden>
              <div className={styles.filePreviewIcon}>
                <FileText size={32} weight="duotone" />
              </div>
              <span className={styles.filePreviewExt}>{extension ?? (mime ?? "FILE")}</span>
            </div>
          )}
        </div>
        <div className={styles.meta}>
          <h4 className={styles.title}>{title}</h4>
          {desc ? <p className={styles.description}>{desc}</p> : null}
          {metaType ? <span className={styles.metaDetail}>{metaType}</span> : null}
        </div>
      </article>
    );
  };

  if (!user) {
    return <div className={styles.empty}>Sign in to view your uploaded memories.</div>;
  }

  return (
    <section className={styles.root}>
      <div className={styles.actions}>
        <ButtonLink
          variant="ghost"
          size="icon"
          href="/memory"
          leftIcon={<ArrowLeft size={18} weight="bold" />}
          aria-label="Back to Memory"
        >
          Back to Memory
        </ButtonLink>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => {
            void refresh();
          }}
          disabled={loading || loadingMore}
        >
          {loading ? "Refreshing..." : "Refresh"}
        </Button>
      </div>

      {error ? <p className={styles.status}>{error}</p> : null}

      <Tabs value={tab.value} onValueChange={setActiveTab} variant="outline">
        <TabsList className={styles.tabList}>
          {MEMORY_TABS.map((entry) => (
            <TabsTrigger key={entry.value} value={entry.value}>
              {entry.label}
            </TabsTrigger>
          ))}
        </TabsList>
        {MEMORY_TABS.map((entry) => (
          <TabsContent key={entry.value} value={entry.value} className={styles.tabContent}>
            {entry.value === tab.value && loading && !filteredItems.length ? (
              <div className={styles.empty}>{entry.emptyLoading}</div>
            ) : entry.value === tab.value && !filteredItems.length ? (
              <div className={styles.empty}>{entry.emptyNone}</div>
            ) : (
              <div className={styles.grid}>
                {(entry.value === tab.value ? filteredItems : []).map((item) => renderCard(item))}
              </div>
            )}
            {entry.value === tab.value && hasMore ? (
              <div className={styles.loadMoreRow}>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    void loadMore();
                  }}
                  loading={loadingMore}
                >
                  {loadingMore ? "Loading..." : "Load more"}
                </Button>
              </div>
            ) : null}
          </TabsContent>
        ))}
      </Tabs>
    </section>
  );
}
