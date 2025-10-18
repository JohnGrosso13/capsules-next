"use client";

import * as React from "react";
import { X } from "@phosphor-icons/react/dist/ssr";

import styles from "./uploads-carousel.module.css";
import type { DisplayMemoryUpload } from "./uploads-types";

function isVideo(mime: string | null | undefined) {
  return typeof mime === "string" && mime.startsWith("video/");
}

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
};

export function MemoryUploadDetailDialog({ item, onClose }: MemoryUploadDetailDialogProps) {
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
  const createdAt = formatCreatedAt(item.created_at);

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
        <button
          ref={closeButtonRef}
          type="button"
          className={styles.detailClose}
          onClick={onClose}
          aria-label="Close upload details"
        >
          <X size={18} weight="bold" />
        </button>

        <div className={styles.detailMedia}>
          {isVideo(mime) ? (
            <video
              className={styles.detailVideo}
              src={item.fullUrl || item.displayUrl}
              preload="metadata"
              controls
            />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              className={styles.detailImg}
              src={item.fullUrl || item.displayUrl}
              alt={title}
              loading="lazy"
            />
          )}
        </div>

        <div className={styles.detailBody}>
          <h3 id={headingId} className={styles.detailTitle}>
            {title}
          </h3>
          {desc ? (
            <p id={descriptionId} className={styles.detailDescription}>
              {desc}
            </p>
          ) : (
            <span id={descriptionId} className={styles.detailDescriptionMuted}>
              No description provided.
            </span>
          )}
          {createdAt ? <div className={styles.detailTimestamp}>Saved {createdAt}</div> : null}
        </div>
      </div>
    </div>
  );
}
