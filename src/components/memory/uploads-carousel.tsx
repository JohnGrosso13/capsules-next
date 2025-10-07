"use client";

import * as React from "react";
import useEmblaCarousel from "embla-carousel-react";

import styles from "./uploads-carousel.module.css";
import { Button } from "@/components/ui/button";
import { buildMemoryEnvelope } from "@/lib/memory/envelope";
import { useCurrentUser } from "@/services/auth/client";
import { useAttachmentUpload } from "@/hooks/useAttachmentUpload";

type MemoryItem = {
  id: string;
  kind?: string | null;
  media_url?: string | null;
  media_type?: string | null;
  title?: string | null;
  description?: string | null;
  created_at?: string | null;
  meta?: Record<string, unknown> | null;
};

type ListResponse = {
  items?: MemoryItem[];
};

function isVideo(mime: string | null | undefined) {
  return typeof mime === "string" && mime.startsWith("video/");
}

export function UploadsCarousel() {
  const { user } = useCurrentUser();
  const envelope = React.useMemo(() => (user ? buildMemoryEnvelope(user) : null), [user]);

  const [items, setItems] = React.useState<MemoryItem[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const [emblaRef, emblaApi] = useEmblaCarousel({ align: "start", dragFree: true, loop: false });
  const scrollPrev = React.useCallback(() => emblaApi?.scrollPrev(), [emblaApi]);
  const scrollNext = React.useCallback(() => emblaApi?.scrollNext(), [emblaApi]);

  const {
    fileInputRef,
    attachment,
    readyAttachment,
    uploading,
    handleAttachClick,
    handleAttachmentSelect,
    clearAttachment,
  } = useAttachmentUpload();

  const refresh = React.useCallback(async () => {
    if (!envelope) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/memory/list", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user: envelope, kind: "upload" }),
      });
      if (!res.ok) throw new Error("Failed to fetch uploads");
      const json = (await res.json()) as ListResponse;
      setItems(Array.isArray(json.items) ? json.items : []);
    } catch (err) {
      setError((err as Error)?.message || "Failed to load");
    } finally {
      setLoading(false);
      // re-init sizing after load
      queueMicrotask(() => emblaApi?.reInit());
    }
  }, [emblaApi, envelope]);

  React.useEffect(() => {
    void refresh();
  }, [refresh]);

  const indexUploaded = React.useCallback(async () => {
    if (!envelope || !readyAttachment || !readyAttachment.url) return;
    try {
      const body = {
        user: envelope,
        item: {
          kind: "upload",
          media_url: readyAttachment.url,
          media_type: readyAttachment.mimeType,
          title: readyAttachment.name,
          description: null,
          meta: {
            upload_key: readyAttachment.key ?? undefined,
            upload_session_id: readyAttachment.sessionId ?? undefined,
            source: "upload",
          },
        },
      };
      const res = await fetch("/api/memory/upsert", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(await res.text().catch(() => "Index failed"));
      clearAttachment();
      await refresh();
    } catch (err) {
      setError((err as Error)?.message || "Upload indexing failed");
    }
  }, [clearAttachment, envelope, readyAttachment, refresh]);

  React.useEffect(() => {
    if (readyAttachment) {
      void indexUploaded();
    }
  }, [indexUploaded, readyAttachment]);

  const progressPct = attachment && attachment.progress > 0 ? Math.min(100, Math.max(0, Math.round(attachment.progress))) : 0;

  const renderCard = (item: MemoryItem) => {
    const url = item.media_url || "";
    const mime = item.media_type || null;
    const title = item.title?.trim() || item.description?.trim() || "Upload";
    const desc = item.description?.trim() || null;
    return (
      <div className={styles.card}>
        <div className={styles.media}>
          {isVideo(mime) ? (
            <video className={styles.video} src={url} controls preload="metadata" />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img className={styles.img} src={url} alt={title} />
          )}
        </div>
        <div className={styles.meta}>
          <h4 className={styles.metaTitle}>{title}</h4>
          {desc ? <p className={styles.metaDesc}>{desc}</p> : null}
        </div>
      </div>
    );
  };

  if (!user) {
    return (
      <div className={styles.root}>
        <div className={styles.header}>
          <h3 className={styles.title}>Uploads</h3>
        </div>
        <div className={styles.empty}>Sign in to upload and view your memories.</div>
      </div>
    );
  }

  return (
    <div className={styles.root}>
      <div className={styles.header}>
        <h3 className={styles.title}>Uploads</h3>
        <div className={styles.controls}>
          <Button variant="secondary" size="sm" onClick={scrollPrev} aria-label="Previous">
            ‹
          </Button>
          <Button variant="secondary" size="sm" onClick={scrollNext} aria-label="Next">
            ›
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,video/*"
            onChange={handleAttachmentSelect}
            hidden
          />
          <Button variant="secondary" size="sm" onClick={handleAttachClick} loading={uploading}>
            {uploading ? "Uploading..." : "Add Upload"}
          </Button>
        </div>
      </div>

      <div className={styles.statusRow}>
        {error ? <span role="status">{error}</span> : null}
        {uploading ? (
          <div className={styles.progressBar} aria-label="Upload progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progressPct} role="progressbar">
            <div className={styles.progressInner} style={{ ["--progress" as any]: `${progressPct}%` }} />
          </div>
        ) : null}
      </div>

      {loading ? (
        <div className={styles.empty}>Loading your uploads…</div>
      ) : items.length === 0 ? (
        <div className={styles.empty}>No uploads yet. Add your first image or video.</div>
      ) : (
        <div className={styles.viewport} ref={emblaRef}>
          <div className={styles.container}>
            {items.map((item) => (
              <div className={styles.slide} key={item.id}>
                {renderCard(item)}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
