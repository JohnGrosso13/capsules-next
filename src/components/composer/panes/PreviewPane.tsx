"use client";

import * as React from "react";

import styles from "../styles";
import { PreviewColumn } from "../components/PreviewColumn";

import type { FeedPreviewController } from "../features/feed-preview/useFeedPreview";

export type PreviewPaneProps = {
  summaryPreviewContent: React.ReactNode;
  previewState: FeedPreviewController["previewState"];
};

export function PreviewPane({
  summaryPreviewContent,
  previewState,
}: PreviewPaneProps) {
  if (summaryPreviewContent) {
    return <>{summaryPreviewContent}</>;
  }

  return (
    <PreviewColumn hideHeader>
      <div
        id="composer-preview-pane"
        className={styles.previewCanvas}
        data-kind={previewState.kind}
        data-empty={previewState.empty ? "true" : undefined}
      >
        <p className={styles.previewPaneTitle}>Preview</p>
        <div className={styles.previewStage}>{previewState.body}</div>
        {previewState.helper ? (
          <p className={styles.previewHelper}>{previewState.helper}</p>
        ) : null}
      </div>
    </PreviewColumn>
  );
}
