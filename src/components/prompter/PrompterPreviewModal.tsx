"use client";

import * as React from "react";
import styles from "./prompter.module.css";

type Props = {
  open: boolean;
  url: string | null;
  mime: string | null;
  name?: string | null;
  onClose: () => void;
};

export function PrompterPreviewModal({ open, url, mime, name, onClose }: Props) {
  const isOpen = Boolean(open && url);
  const isImage = typeof mime === "string" && mime.startsWith("image/");
  const isVideo = typeof mime === "string" && mime.startsWith("video/");

  React.useEffect(() => {
    if (!isOpen) return;
    function handleKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [isOpen, onClose]);

  if (!isOpen || !url) return null;

  return (
    <div
      className={styles.previewModal}
      role="dialog"
      aria-modal="true"
      aria-label={name ?? "Attachment preview"}
      onClick={(event) => {
        if (event.currentTarget === event.target) onClose();
      }}
    >
      <div className={styles.previewInner}>
        <button
          type="button"
          className={styles.previewClose}
          onClick={onClose}
          aria-label="Close attachment preview"
        >
          <span aria-hidden>&times;</span>
          <span className={styles.previewCloseLabel}>Close</span>
        </button>
        {isImage ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt={name ?? "Attachment"} className={styles.previewMedia} />
        ) : isVideo ? (
          <video
            src={url}
            controls
            className={styles.previewMedia}
            aria-label={name ? `${name} preview` : "Attachment preview"}
          />
        ) : (
          <a href={url} target="_blank" rel="noreferrer" className={styles.previewDownload}>
            Open {name ?? "attachment"}
          </a>
        )}
      </div>
    </div>
  );
}
