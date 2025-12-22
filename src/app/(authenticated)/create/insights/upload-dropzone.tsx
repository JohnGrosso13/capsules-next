"use client";

import type { ChangeEvent, DragEvent, ClipboardEvent } from "react";
import { useRef, useState } from "react";

import styles from "./insights.page.module.css";

type UploadDropzoneProps = {
  inputId?: string;
  variant?: "panel" | "button";
};

export function UploadDropzone({ inputId = "personal-coach-upload", variant = "panel" }: UploadDropzoneProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [isDragActive, setIsDragActive] = useState(false);
  const [selectedFileName, setSelectedFileName] = useState<string | null>(null);

  const assignFilesToInput = (files: FileList | null | undefined) => {
    if (!files || files.length === 0 || !inputRef.current) return;
    const firstFile = files.item(0);
    if (!firstFile) return;
    const dt = new DataTransfer();
    dt.items.add(firstFile);
    inputRef.current.files = dt.files;
    setSelectedFileName(firstFile.name);
  };

  const handleDragOver = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragActive(true);
  };

  const handleDragLeave = (event: DragEvent<HTMLDivElement>) => {
    const nextTarget = event.relatedTarget as Node | null;
    if (nextTarget && event.currentTarget.contains(nextTarget)) {
      return;
    }
    setIsDragActive(false);
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragActive(false);
    assignFilesToInput(event.dataTransfer?.files);
  };

  const handlePaste = (event: ClipboardEvent<HTMLDivElement>) => {
    assignFilesToInput(event.clipboardData?.files);
  };

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    assignFilesToInput(event.target.files);
  };

  const isButton = variant === "button";

  return (
    <div
      className={`${styles.uploadDropzone} ${isButton ? styles.uploadButton : ""}`}
      data-active={isDragActive ? "true" : undefined}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onPaste={handlePaste}
      tabIndex={0}
      role="button"
      aria-label="Upload a video clip"
    >
      <input
        ref={inputRef}
        id={inputId}
        type="file"
        accept="video/mp4,video/quicktime,video/x-m4v"
        className={styles.uploadInput}
        aria-describedby={`${inputId}-hint`}
        onChange={handleChange}
      />
      <div className={styles.uploadDropzoneBody}>
        <div className={styles.uploadIcon} aria-hidden="true">
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path
              d="M12 4v12m0-12 4 4m-4-4-4 4"
              stroke="currentColor"
              strokeWidth="1.7"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path
              d="M5 14.4V17a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-2.6"
              stroke="currentColor"
              strokeWidth="1.7"
              strokeLinecap="round"
              strokeLinejoin="round"
              opacity="0.85"
            />
          </svg>
        </div>
        {isButton ? (
          <>
            <div className={styles.uploadButtonLabel}>{selectedFileName ?? "Upload Clip"}</div>
            <div id={`${inputId}-hint`} className={styles.uploadHint}>
              MP4 / MOV, up to 1GB
            </div>
          </>
        ) : (
          <>
            <div className={styles.uploadHeadline}>
              <span className={styles.uploadEmphasis}>Drag &amp; Drop Video</span> Here or{" "}
              <span className={styles.uploadLink}>Browse Files</span>
            </div>
            <div id={`${inputId}-hint`} className={styles.uploadHint}>
              Supports MP4, MOV, up to 1GB
            </div>
            {selectedFileName ? (
              <div className={styles.uploadFileName} aria-live="polite">
                Selected: {selectedFileName}
              </div>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}
