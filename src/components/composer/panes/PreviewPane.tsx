"use client";

import * as React from "react";

import styles from "../styles";
import { PreviewColumn } from "../components/PreviewColumn";

import type { FeedPreviewController } from "../features/feed-preview/useFeedPreview";

export type PreviewPaneProps = {
  summaryPreviewContent: React.ReactNode;
  previewState: FeedPreviewController["previewState"];
  previewPrimaryAction: FeedPreviewController["previewPrimaryAction"];
  previewSecondaryAction: FeedPreviewController["previewSecondaryAction"];
};

export function PreviewPane({
  summaryPreviewContent,
  previewState,
  previewPrimaryAction,
  previewSecondaryAction,
}: PreviewPaneProps) {
  if (summaryPreviewContent) {
    return <>{summaryPreviewContent}</>;
  }

  return (
    <PreviewColumn
      title="Preview"
      meta={<span className={styles.previewTypeBadge}>{previewState.label}</span>}
    >
      <div
        id="composer-preview-pane"
        className={styles.previewCanvas}
        data-kind={previewState.kind}
        data-empty={previewState.empty ? "true" : undefined}
      >
        <div className={styles.previewStage}>{previewState.body}</div>
        {previewState.helper ? (
          <p className={styles.previewHelper}>{previewState.helper}</p>
        ) : null}
        <div className={styles.previewActions}>
          <button
            type="button"
            className={styles.previewActionPrimary}
            onClick={previewPrimaryAction.onClick}
            disabled={previewPrimaryAction.disabled}
          >
            {previewPrimaryAction.label}
          </button>
          <button
            type="button"
            className={styles.previewActionSecondary}
            onClick={previewSecondaryAction.onClick}
            disabled={previewSecondaryAction.disabled}
          >
            {previewSecondaryAction.label}
          </button>
        </div>
      </div>
    </PreviewColumn>
  );
}
