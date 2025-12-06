"use client";

import * as React from "react";
import styles from "../styles";

type ThemePreviewBannerProps = {
  summary: string;
  details?: string | null;
  onApply(): void;
  onCancel(): void;
};

export function ThemePreviewBanner({
  summary,
  details,
  onApply,
  onCancel,
}: ThemePreviewBannerProps) {
  return (
    <div className={styles.themePreviewBanner} role="status" aria-live="polite">
      <div className={styles.themePreviewCopy}>
        <p className={styles.themePreviewLabel}>Previewing theme</p>
        <p className={styles.themePreviewSummary}>{summary}</p>
        {details ? <p className={styles.themePreviewDetails}>{details}</p> : null}
      </div>
      <div className={styles.themePreviewActions}>
        <button type="button" className={styles.themePreviewApply} onClick={onApply}>
          Apply theme
        </button>
        <button type="button" className={styles.themePreviewCancel} onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}
