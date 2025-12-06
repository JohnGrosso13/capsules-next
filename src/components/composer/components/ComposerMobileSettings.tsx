"use client";

import * as React from "react";
import styles from "../styles";
import type { ComposerFormState } from "../hooks/useComposerFormReducer";

type ComposerMobileSettingsProps = {
  privacy: ComposerFormState["privacy"];
  loading: boolean;
  canSave: boolean;
  saving: boolean;
  onPrivacyChange(value: ComposerFormState["privacy"]): void;
  onSave(): void;
};

export function ComposerMobileSettings({
  privacy,
  loading,
  canSave,
  saving,
  onPrivacyChange,
  onSave,
}: ComposerMobileSettingsProps) {
  return (
    <section className={styles.mobileSheetSection}>
      <header>
        <span className={styles.mobileSheetSectionTitle}>Settings</span>
      </header>
      <div className={styles.privacyGroup}>
        <span className={styles.privacyLabel}>Visibility</span>
        <select
          aria-label="Visibility"
          className={styles.privacySelect}
          value={privacy}
          onChange={(event) =>
            onPrivacyChange((event.target.value || "public") as ComposerFormState["privacy"])
          }
          disabled={loading}
        >
          <option value="public">Public</option>
          <option value="private">Private</option>
        </select>
      </div>
      <div>
        <button
          type="button"
          className={styles.secondaryAction}
          onClick={onSave}
          disabled={!canSave}
        >
          {saving ? "Saving..." : "Save"}
        </button>
      </div>
    </section>
  );
}
