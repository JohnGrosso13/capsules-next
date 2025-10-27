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
  if (!open || !url) return null;
  const isImage = typeof mime === "string" && mime.startsWith("image/");
  const isVideo = typeof mime === "string" && mime.startsWith("video/");
  return (
    <div className={styles.previewModal} role="dialog" aria-modal="true" aria-label={name ?? "Attachment preview"}>
      <button className={styles.previewClose} aria-label="Close preview" onClick={onClose}>
        ×
      </button>
      <div className={styles.previewInner}>
        {isImage ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt={name ?? "Attachment"} className={styles.previewMedia} />
        ) : isVideo ? (
          // eslint-disable-next-line jsx-a11y/media-has-caption
          <video src={url} controls className={styles.previewMedia} />
        ) : (
          <a href={url} target="_blank" rel="noreferrer" className={styles.previewDownload}>
            Open {name ?? "attachment"}
          </a>
        )}
      </div>
    </div>
  );
}

