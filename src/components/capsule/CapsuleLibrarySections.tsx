"use client";

import * as React from "react";
import Image from "next/image";

import { FeedSurface } from "@/components/feed-surface";
import {
  DocumentAttachmentCard,
  buildDocumentCardData,
  type DocumentAttachmentSource,
  type DocumentCardData,
} from "@/components/documents/document-card";
import feedStyles from "@/components/home-feed.module.css";
import capTheme from "@/app/(authenticated)/capsule/capsule.module.css";
import type { CapsuleLibraryItem } from "@/hooks/useCapsuleLibrary";

export type CapsuleLibrarySectionProps = {
  items: CapsuleLibraryItem[];
  loading: boolean;
  error: string | null;
  onRetry(): void;
};

export type CapsuleFilesSectionProps = CapsuleLibrarySectionProps & {
  formatCount(value?: number | null): string;
  onAsk(doc: DocumentCardData): void;
};

export function CapsuleLibraryState({
  message,
  onRetry,
}: {
  message: string;
  onRetry?: () => void;
}) {
  return (
    <FeedSurface variant="capsule">
      <div className={capTheme.libraryState}>
        <p>{message}</p>
        {onRetry ? (
          <button type="button" className={capTheme.heroAction} onClick={onRetry}>
            Try again
          </button>
        ) : null}
      </div>
    </FeedSurface>
  );
}

export function CapsuleMediaSection({ items, loading, error, onRetry }: CapsuleLibrarySectionProps) {
  if (loading) return <CapsuleLibraryState message="Loading media..." />;
  if (error) return <CapsuleLibraryState message={error} onRetry={onRetry} />;
  if (!items.length) return <CapsuleLibraryState message="No media shared yet." />;

  return (
    <FeedSurface variant="capsule">
      <div className={feedStyles.mediaGallery} data-count={items.length}>
        {items.map((item) => {
          const mime = item.mimeType?.toLowerCase() ?? "";
          const isVideo = mime.startsWith("video/");
          const isImage = mime.startsWith("image/");
          const thumbnail = item.thumbnailUrl ?? (isImage ? item.url : null);
          return (
            <div key={item.id} className={feedStyles.mediaWrapper} data-kind={isVideo ? "video" : "image"}>
              {isVideo ? (
                <video
                  className={feedStyles.media}
                  data-kind="video"
                  controls
                  playsInline
                  preload="metadata"
                  poster={thumbnail ?? undefined}
                >
                  <source src={item.url} type={item.mimeType ?? undefined} />
                  Your browser does not support the video tag.
                </video>
              ) : (
                <a
                  href={item.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={feedStyles.mediaButton}
                  data-kind="image"
                >
                  <Image
                    className={feedStyles.media}
                    src={thumbnail ?? item.url}
                    alt={item.title ?? "Capsule media"}
                    width={1080}
                    height={1080}
                    sizes="(max-width: 640px) 100vw, 720px"
                    loading="lazy"
                    unoptimized
                  />
                </a>
              )}
            </div>
          );
        })}
      </div>
    </FeedSurface>
  );
}

export function CapsuleFilesSection({
  items,
  loading,
  error,
  onRetry,
  formatCount,
  onAsk,
}: CapsuleFilesSectionProps) {
  if (loading) return <CapsuleLibraryState message="Loading files..." />;
  if (error) return <CapsuleLibraryState message={error} onRetry={onRetry} />;
  if (!items.length) return <CapsuleLibraryState message="No files shared yet." />;

  const documents = items.map((item) => {
    const meta = item.meta ?? null;
    const uploadSessionId = (() => {
      if (!meta || typeof meta !== "object") return null;
      const record = meta as Record<string, unknown>;
      for (const key of ["upload_session_id", "session_id"]) {
        const value = record[key];
        if (typeof value === "string" && value.trim().length) return value.trim();
      }
      return null;
    })();
    const source: DocumentAttachmentSource = {
      id: item.id,
      url: item.url,
      name: item.title ?? null,
      mimeType: item.mimeType ?? null,
      meta,
      uploadSessionId,
    };
    return buildDocumentCardData(source);
  });

  return (
    <FeedSurface variant="capsule">
      <div className={feedStyles.documentGrid}>
        {documents.map((doc) => (
          <DocumentAttachmentCard
            key={doc.id}
            doc={doc}
            formatCount={formatCount}
            onAsk={() => onAsk(doc)}
          />
        ))}
      </div>
    </FeedSurface>
  );
}
