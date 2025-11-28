"use client";

import * as React from "react";

import { Button } from "@/components/ui/button";
import cards from "@/components/cards.module.css";
import { useAccessibilityPreferences } from "@/components/providers/AccessibilityProvider";
import {
  TEXT_SCALE_DEFAULT,
  TEXT_SCALE_MAX,
  TEXT_SCALE_MIN,
  TEXT_SCALE_STEP,
} from "@/lib/accessibility/constants";

import layout from "./settings.module.css";
import styles from "./accessibility-section.module.css";

const SCALE_PRESETS = [TEXT_SCALE_DEFAULT, 1.1, 1.2, 1.3];

function formatPercent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

export function AccessibilitySettingsSection(): React.JSX.Element {
  const {
    reduceMotion,
    textScale,
    setReduceMotion,
    setTextScale,
    reset,
    hydrated,
  } = useAccessibilityPreferences();

  const handleScaleChange = React.useCallback(
    (value: number) => {
      setTextScale(value);
    },
    [setTextScale],
  );

  const textScalePercent = formatPercent(textScale);

  return (
    <article className={`${cards.card} ${layout.card} ${styles.sectionCard}`}>
      <header className={cards.cardHead}>
        <h3 className={layout.sectionTitle}>Accessibility</h3>
      </header>
      <div className={`${cards.cardBody} ${styles.sectionBody}`}>
        <p className={styles.intro}>
          Personalize motion and readability without changing the default look for everyone else.
        </p>

        <div className={styles.row}>
          <div className={styles.copy}>
            <span className={styles.title}>Reduce motion</span>
            <p className={styles.description}>
              Stops marquee auto-scrolling and other non-essential animations, even if your system
              allows motion.
            </p>
          </div>
          <button
            type="button"
            className={`${styles.toggle} ${reduceMotion ? styles.toggleOn : ""}`.trim()}
            onClick={() => setReduceMotion(!reduceMotion)}
            aria-pressed={reduceMotion}
            aria-label="Toggle reduce motion"
          >
            <span className={styles.toggleThumb} aria-hidden />
          </button>
        </div>

        <div className={styles.divider} />

        <div className={styles.sliderGroup}>
          <div className={styles.sliderHeader}>
            <div className={styles.copy}>
              <span className={styles.title}>Text size & spacing</span>
              <p className={styles.description}>
                Raises the base font size and rem-based spacing to improve readability.
              </p>
            </div>
            <span className={styles.scaleBadge} aria-live="polite">
              {textScalePercent}
            </span>
          </div>
          <input
            type="range"
            className={styles.slider}
            min={TEXT_SCALE_MIN}
            max={TEXT_SCALE_MAX}
            step={TEXT_SCALE_STEP}
            value={textScale}
            onChange={(event) => handleScaleChange(Number.parseFloat(event.target.value))}
            aria-label="Adjust text size and spacing"
            aria-valuemin={TEXT_SCALE_MIN}
            aria-valuemax={TEXT_SCALE_MAX}
            aria-valuenow={textScale}
          />
          <div className={styles.scaleOptions} role="group" aria-label="Quick text size options">
            {SCALE_PRESETS.map((preset) => {
              const active = Math.abs(textScale - preset) < 0.001;
              return (
                <button
                  key={preset}
                  type="button"
                  className={`${styles.scaleOption} ${active ? styles.scaleOptionActive : ""}`.trim()}
                  onClick={() => handleScaleChange(preset)}
                  aria-pressed={active}
                >
                  {formatPercent(preset)}
                </button>
              );
            })}
          </div>
          <p className={styles.helper}>
            Defaults stay at 100% until you opt in. Adjustments apply per browser using local
            storage.
          </p>
        </div>

        <div className={styles.actions}>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className={layout.settingsCtaSecondary}
            onClick={() => {
              reset();
            }}
            disabled={!hydrated || (textScale === TEXT_SCALE_DEFAULT && !reduceMotion)}
          >
            Reset to defaults
          </Button>
        </div>
      </div>
    </article>
  );
}
