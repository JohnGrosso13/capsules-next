"use client";

import * as React from "react";
import { X } from "@phosphor-icons/react/dist/ssr";

import styles from "../styles";

type ComposerMobilePreviewProps = {
  open: boolean;
  onClose(): void;
  closeButtonRef?: React.RefObject<HTMLButtonElement | null>;
  content: React.ReactNode;
};

export function ComposerMobilePreview({
  open,
  onClose,
  closeButtonRef,
  content,
}: ComposerMobilePreviewProps) {
  if (!open) return null;

  return (
    <>
      <div className={styles.mobilePreviewBackdrop} onClick={onClose} />
      <div
        id="composer-mobile-preview"
        className={styles.mobilePreviewOverlay}
        role="dialog"
        aria-modal="true"
        aria-labelledby="composer-mobile-preview-title"
        onClick={onClose}
      >
        <div
          className={styles.mobilePreviewDialog}
          role="document"
          onClick={(event) => event.stopPropagation()}
        >
          <div className={styles.mobilePreviewHeader}>
            <span
              className={styles.mobileSheetTitle}
              id="composer-mobile-preview-title"
            >
              Preview
            </span>
            <button
              type="button"
              className={styles.mobilePreviewClose}
              onClick={onClose}
              ref={closeButtonRef}
              aria-label="Close preview"
            >
              <X size={16} weight="bold" />
            </button>
          </div>
          <div className={styles.mobilePreviewContent}>{content}</div>
        </div>
      </div>
    </>
  );
}
