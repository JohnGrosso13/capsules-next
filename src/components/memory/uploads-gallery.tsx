"use client";
import * as React from "react";

import styles from "./uploads-gallery.module.css";
import { Button, ButtonLink } from "@/components/ui/button";
import { ArrowLeft } from "@phosphor-icons/react/dist/ssr";
import { shouldBypassCloudflareImages } from "@/lib/cloudflare/runtime";

import { computeDisplayUploads } from "./process-uploads";
import { useMemoryUploads } from "./use-memory-uploads";
import type { DisplayMemoryUpload } from "./uploads-types";

function isVideo(mime: string | null | undefined) {
  return typeof mime === "string" && mime.startsWith("video/");
}

export function UploadsGallery() {
  const { user, items, loading, error, refresh } = useMemoryUploads();
  const cloudflareEnabled = React.useMemo(() => !shouldBypassCloudflareImages(), []);
  const currentOrigin = React.useMemo(
    () => (typeof window !== "undefined" ? window.location.origin : null),
    [],
  );

  const processedItems = React.useMemo(
    () => computeDisplayUploads(items, { origin: currentOrigin, cloudflareEnabled }),
    [cloudflareEnabled, currentOrigin, items],
  );

  const renderCard = (item: DisplayMemoryUpload) => {
    const url = item.displayUrl || item.media_url || "";
    const mime = item.media_type || null;
    const title = item.title?.trim() || item.description?.trim() || "Upload";
    const desc = item.description?.trim() || null;
    return (
      <article key={item.id} className={styles.card}>
        <div className={styles.media}>
          {isVideo(mime) ? (
            <video className={styles.video} src={item.fullUrl || url} preload="metadata" controls />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img className={styles.img} src={url} alt={title} loading="lazy" />
          )}
        </div>
        <div className={styles.meta}>
          <h4 className={styles.title}>{title}</h4>
          {desc ? <p className={styles.description}>{desc}</p> : null}
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
          disabled={loading}
        >
          {loading ? "Refreshing..." : "Refresh"}
        </Button>
      </div>

      {error ? <p className={styles.status}>{error}</p> : null}

      {loading && !processedItems.length ? (
        <div className={styles.empty}>Loading uploads...</div>
      ) : !processedItems.length ? (
        <div className={styles.empty}>No uploads yet. Add one from the Memory page.</div>
      ) : (
        <div className={styles.grid}>{processedItems.map((item) => renderCard(item))}</div>
      )}
    </section>
  );
}
