"use client";

import * as React from "react";
import { DownloadSimple, FileText } from "@phosphor-icons/react/dist/ssr";

import styles from "./uploads-carousel.module.css";
import type { DisplayMemoryUpload } from "./uploads-types";
import { getUploadExtension, isImage, isVideo } from "./upload-helpers";

function formatCreatedAt(createdAt: string | null | undefined) {
  if (!createdAt) return null;
  const date = new Date(createdAt);
  if (Number.isNaN(date.getTime())) return null;
  try {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(date);
  } catch {
    return date.toLocaleString();
  }
}

type MemoryUploadDetailDialogProps = {
  item: DisplayMemoryUpload | null;
  onClose: () => void;
  poll?: {
    question: string;
    options: { label: string; votes: number }[];
    totalVotes: number;
  } | null;
};

export function MemoryUploadDetailDialog({ item, onClose, poll }: MemoryUploadDetailDialogProps) {
  const closeButtonRef = React.useRef<HTMLButtonElement>(null);
  const headingId = React.useId();
  const descriptionId = React.useId();

  React.useEffect(() => {
    if (!item) return undefined;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    const { body } = document;
    const originalOverflow = body.style.overflow;
    body.style.overflow = "hidden";

    const id = window.setTimeout(() => {
      closeButtonRef.current?.focus();
    }, 0);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.clearTimeout(id);
      body.style.overflow = originalOverflow;
    };
  }, [item, onClose]);

  if (!item) return null;

  const title = item.title?.trim() || item.description?.trim() || "Upload";
  const desc = item.description?.trim() || null;
  const mime = item.media_type || null;
  const extension = getUploadExtension(item);
  const videoLike = isVideo(mime, extension);
  const imageLike = isImage(mime, extension);
  const fileUrl = item.fullUrl || item.displayUrl || item.media_url || null;
  const createdAt = formatCreatedAt(item.created_at);
  const hasPoll = Boolean(poll?.options?.length);

  const pollOptionsWithPct =
    poll?.options?.map((option) => {
      const pct =
        poll.totalVotes && poll.totalVotes > 0
          ? Math.round((option.votes / poll.totalVotes) * 100)
          : 0;
      return { ...option, pct };
    }) ?? [];

  return (
    <div className={styles.detailOverlay} role="presentation" onClick={onClose}>
      <div
        className={styles.detailPanel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={headingId}
        aria-describedby={descriptionId}
        onClick={(event) => event.stopPropagation()}
      >
        <div className={styles.detailHeader}>
          <button
            ref={closeButtonRef}
            type="button"
            className={styles.detailClose}
            onClick={onClose}
          >
            Close
          </button>
        </div>

        <div className={styles.detailMedia}>
          {videoLike && fileUrl ? (
            <video className={styles.detailVideo} src={fileUrl} preload="metadata" controls />
          ) : imageLike && fileUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img className={styles.detailImg} src={fileUrl} alt={title} loading="lazy" />
          ) : (
            <div className={styles.detailFilePreview} aria-hidden>
              <div className={styles.detailFileIcon}>
                <FileText size={52} weight="duotone" />
              </div>
              <div className={styles.detailFileExt}>{extension ?? mime ?? "File"}</div>
              {fileUrl ? (
                <a
                  className={styles.detailDownload}
                  href={fileUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <DownloadSimple size={16} weight="bold" />
                  <span>Download</span>
                </a>
              ) : null}
            </div>
          )}
        </div>

        <div className={styles.detailBody}>
          <h3 id={headingId} className={styles.detailTitle}>
            {title}
          </h3>
          {!poll ? (
            desc ? (
              <p id={descriptionId} className={styles.detailDescription}>
                {desc}
              </p>
            ) : (
              <span id={descriptionId} className={styles.detailDescriptionMuted}>
                No description provided.
              </span>
            )
          ) : null}
          {hasPoll ? (
            <div className={styles.pollDetail}>
              <div className={styles.pollDetailHeading}>Poll results</div>
              <ul className={styles.pollDetailList}>
                {pollOptionsWithPct.map((option) => (
                  <li key={option.label} className={styles.pollDetailItem}>
                    <span className={styles.pollDetailLabel}>{option.label}</span>
                    <span className={styles.pollDetailPct}>{option.pct}%</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {createdAt ? <div className={styles.detailTimestamp}>Saved {createdAt}</div> : null}
        </div>
      </div>
    </div>
  );
}
