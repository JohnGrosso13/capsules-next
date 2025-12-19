"use client";

import * as React from "react";
import styles from "../styles";

type ComposerMobileSettingsProps = {
  canSave: boolean;
  saving: boolean;
  onSave(): void;
};

export function ComposerMobileSettings({
  canSave,
  saving,
  onSave,
}: ComposerMobileSettingsProps) {
  return (
    <section className={styles.mobileSheetSection}>
      <header>
        <span className={styles.mobileSheetSectionTitle}>Settings</span>
      </header>
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
