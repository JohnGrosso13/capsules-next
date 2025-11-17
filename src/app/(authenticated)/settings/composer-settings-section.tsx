"use client";

import * as React from "react";

import cards from "@/components/cards.module.css";
import layout from "./settings.module.css";
import styles from "./composer-settings-section.module.css";
import {
  COMPOSER_IMAGE_QUALITY_OPTIONS,
  titleCaseComposerQuality,
} from "@/lib/composer/image-settings";
import { useComposerImageSettings } from "@/components/composer/state/useComposerImageSettings";

export function ComposerSettingsSection(): React.JSX.Element {
  const { settings, updateSettings } = useComposerImageSettings();

  return (
    <article className={`${cards.card} ${layout.card} ${styles.sectionCard}`}>
      <header className={cards.cardHead}>
        <h3 className={layout.sectionTitle}>Composer Settings</h3>
      </header>
      <div className={`${cards.cardBody} ${styles.body}`}>
        <p className={styles.hint}>
          Choose the default image quality used for visuals generated in Composer.
        </p>
        <div className={styles.grid}>
          <label className={styles.field}>
            <span className={styles.label}>Image quality</span>
            <select
              className={styles.select}
              value={settings.quality}
              onChange={(event) =>
                updateSettings({
                  quality: event.target.value as (typeof COMPOSER_IMAGE_QUALITY_OPTIONS)[number],
                })
              }
            >
              {COMPOSER_IMAGE_QUALITY_OPTIONS.map((quality) => (
                <option key={quality} value={quality}>
                  {titleCaseComposerQuality(quality)}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>
    </article>
  );
}
