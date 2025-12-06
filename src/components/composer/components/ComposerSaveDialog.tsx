"use client";

import * as React from "react";
import { X } from "@phosphor-icons/react/dist/ssr";

import styles from "../styles";

type ComposerSaveDialogProps = {
  open: boolean;
  saving: boolean;
  title: string;
  description: string;
  error?: string | null;
  onTitleChange(value: string): void;
  onDescriptionChange(value: string): void;
  onClose(): void;
  onConfirm(): void;
};

export function ComposerSaveDialog({
  open,
  saving,
  title,
  description,
  error,
  onTitleChange,
  onDescriptionChange,
  onClose,
  onConfirm,
}: ComposerSaveDialogProps) {
  if (!open) return null;

  return (
    <div
      className={styles.saveDialogOverlay}
      role="dialog"
      aria-modal="true"
      aria-labelledby="composer-save-dialog-title"
      onClick={onClose}
    >
      <div
        className={styles.saveDialog}
        onClick={(event) => event.stopPropagation()}
      >
        <div className={styles.saveDialogHeader}>
          <h3 id="composer-save-dialog-title">Save to Memory</h3>
          <button
            type="button"
            className={styles.saveDialogClose}
            onClick={onClose}
            aria-label="Close save dialog"
            disabled={saving}
          >
            <X size={16} weight="bold" />
          </button>
        </div>
        <div className={styles.saveDialogBody}>
          <label className={styles.saveDialogLabel} htmlFor="composer-save-title">
            Title
          </label>
          <input
            id="composer-save-title"
            className={styles.saveDialogInput}
            value={title}
            onChange={(event) => onTitleChange(event.target.value)}
            placeholder="Describe this creation"
            disabled={saving}
          />
          <label className={styles.saveDialogLabel} htmlFor="composer-save-description">
            Description
          </label>
          <textarea
            id="composer-save-description"
            className={styles.saveDialogTextarea}
            value={description}
            onChange={(event) => onDescriptionChange(event.target.value)}
            rows={4}
            placeholder="Capsule uses this description for recall."
            disabled={saving}
          />
          {error ? (
            <p className={styles.saveDialogError} role="alert">
              {error}
            </p>
          ) : null}
        </div>
        <div className={styles.saveDialogActions}>
          <button
            type="button"
            className={styles.saveDialogSecondary}
            onClick={onClose}
            disabled={saving}
          >
            Cancel
          </button>
          <button
            type="button"
            className={styles.saveDialogPrimary}
            onClick={onConfirm}
            disabled={saving}
          >
            {saving ? "Saving..." : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}
