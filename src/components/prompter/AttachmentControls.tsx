"use client";

import * as React from "react";
import styles from "./prompter.module.css";
import type { LocalAttachment } from "@/hooks/useAttachmentUpload";

export function AttachmentControls({
  fileInputRef,
  uploading,
  attachment,
  onAttachClick,
  onFileChange,
  onRemove,
}: {
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  uploading: boolean;
  attachment: LocalAttachment | null;
  onAttachClick: () => void;
  onFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onRemove: () => void;
}) {
  return (
    <div className={styles.attachGroup}>
      <button
        type="button"
        className={styles.attachButton}
        onClick={onAttachClick}
        disabled={uploading}
        aria-label="Attach a file"
      >
        <span className={styles.attachIcon} aria-hidden>
          +
        </span>
        <span className={styles.attachLabel}>Attach</span>
      </button>
      <input
        ref={fileInputRef}
        type="file"
        accept="*/*"
        className={styles.attachInput}
        onChange={onFileChange}
      />
      {attachment ? (
        <span
          className={styles.attachmentChip}
          data-status={attachment.status}
          title={
            attachment.status === "error" ? (attachment.error ?? "Upload failed") : attachment.name
          }
        >
          <span className={styles.attachmentName}>{attachment.name}</span>
          {attachment.status === "uploading" ? (
            <span className={styles.attachmentStatus}>Uploading...</span>
          ) : attachment.status === "error" ? (
            <span className={styles.attachmentStatusError}>
              {attachment.error ?? "Upload failed"}
            </span>
          ) : (
            <span className={styles.attachmentStatus}>Attached</span>
          )}
          <button
            type="button"
            className={styles.attachmentRemove}
            onClick={onRemove}
            aria-label="Remove attachment"
          >
            x
          </button>
        </span>
      ) : null}
    </div>
  );
}
