"use client";

import * as React from "react";
import { Brain, X } from "@phosphor-icons/react/dist/ssr";

import styles from "../../ai-composer.module.css";

import type { LocalAttachment } from "@/hooks/useAttachmentUpload";

type AttachmentPanelProps = {
  attachment: LocalAttachment;
  kind: "image" | "video" | null;
  statusLabel: string | null;
  displayUrl: string | null;
  progressPct: number;
  loading: boolean;
  uploading: boolean;
  onRemove: () => void;
  onOpenViewer: () => void;
  caption?: string | null;
};

export function AttachmentPanel({
  attachment,
  kind,
  statusLabel,
  displayUrl,
  progressPct,
  loading,
  uploading,
  onRemove,
  onOpenViewer,
  caption,
}: AttachmentPanelProps) {
  const resolvedCaption =
    typeof caption === "string" ? caption.trim() || null : caption ?? null;
  const showMetaName = !resolvedCaption;

  return (
    <li className={`${styles.msgRow} ${styles.attachmentMessageRow}`} data-role="attachment">
      <div
        className={styles.attachmentCanvas}
        data-status={attachment.status}
        data-kind={kind ?? undefined}
      >
        <div className={styles.attachmentSurface}>
          {attachment.status === "uploading" ? (
            <div
              className={styles.attachmentLoading}
              role="progressbar"
              aria-label={
                attachment.phase === "finalizing"
                  ? "Finishing upload"
                  : `Uploading ${progressPct}%`
              }
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={progressPct}
            >
              <div className={styles.brainProgressWrapLarge}>
                <Brain className={styles.brainBaseLarge} size={56} weight="duotone" />
                <div className={styles.brainFillClipLarge} style={{ height: `${progressPct}%` }}>
                  <Brain className={styles.brainFillLarge} size={56} weight="fill" />
                </div>
              </div>
              <span className={styles.attachmentLoadingLabel}>{statusLabel ?? (attachment.phase === "finalizing" ? "Finishing upload..." : "Uploading...")}</span>
            </div>
          ) : null}

          {attachment.status === "ready" && displayUrl ? (
            <div
              className={styles.attachmentMedia}
              role="button"
              tabIndex={0}
              onClick={onOpenViewer}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " " || event.key === "Spacebar") {
                  event.preventDefault();
                  onOpenViewer();
                }
              }}
              aria-label="Open attachment preview"
            >
              {kind === "video" ? (
                <video
                  className={styles.attachmentMediaVideo}
                  src={displayUrl}
                  controls
                  preload="metadata"
                />
              ) : (
                /* eslint-disable-next-line @next/next/no-img-element -- need intrinsic sizing */
                <img
                  className={styles.attachmentMediaImage}
                  src={displayUrl}
                  alt={attachment.name}
                />
              )}
            </div>
          ) : null}

          {attachment.status === "error" ? (
            <div className={styles.attachmentError}>
              <Brain className={styles.attachmentErrorIcon} size={44} weight="duotone" />
              <span>{statusLabel ?? "Upload failed"}</span>
            </div>
          ) : null}

          <button
            type="button"
            className={styles.attachmentRemoveLarge}
            onClick={onRemove}
            disabled={loading || uploading}
            aria-label="Remove attachment"
          >
            <X size={16} weight="bold" />
          </button>
        </div>

        {showMetaName || statusLabel ? (
          <div className={styles.attachmentMetaBar}>
            {showMetaName ? (
              <span className={styles.attachmentMetaName} title={attachment.name}>
                {attachment.name}
              </span>
            ) : null}
            {statusLabel ? (
              <span
                className={styles.attachmentMetaStatus}
                data-state={attachment.status === "error" ? "error" : undefined}
              >
                {statusLabel}
              </span>
            ) : null}
          </div>
        ) : null}

        {resolvedCaption ? (
          <div className={styles.attachmentCaptionBlock}>
            <p className={styles.attachmentCaption}>{resolvedCaption}</p>
          </div>
        ) : null}
      </div>
    </li>
  );
}
