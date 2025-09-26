"use client";

import * as React from "react";
import styles from "./create-tiles.module.css";

export type CreateTileKey =
  | "growth"
  | "events"
  | "content"
  | "moderation"
  | "insights"
  | "automations";

const QUICK_CHIPS = [
  "Draft a welcome post",
  "Create a 16-team bracket",
  "Launch a weekly digest",
  "Auto-summarize yesterday",
  "Plan a highlights reel",
];

const TILE_META: Record<CreateTileKey, { title: string; icon: string; bullets: string[] }> = {
  growth: {
    icon: "??",
    title: "Community Growth",
    bullets: [
      "Generate weekly digest",
      "Launch smart poll",
      "Auto-summarize posts",
      "Spotlight a member",
    ],
  },
  events: {
    icon: "??",
    title: "Events & Tournaments",
    bullets: ["Create tournament", "Adaptive scheduling", "Bracket optimization", "Assist with disputes"],
  },
  content: {
    icon: "??",
    title: "Content Creation",
    bullets: ["Generate highlight reel", "Compile clip montage", "Create logo/banner/emote", "Narration or casting"],
  },
  moderation: {
    icon: "???",
    title: "Moderation & Safety",
    bullets: ["Scan last 24 hours", "Draft code of conduct", "Flag engagement spikes", "Resolve case summary"],
  },
  insights: {
    icon: "??",
    title: "Gaming Insights",
    bullets: ["Run live match analysis", "Generate strategy plan", "Launch stat integration", "Build coaching plan"],
  },
  automations: {
    icon: "??",
    title: "Platform Automations",
    bullets: [
      "Set weekly digest schedule",
      "Autopost to socials",
      "Workflow: New VOD ? Post",
      "Detect highlights ~ Post",
    ],
  },
};

export function CreateTiles() {
  const [active, setActive] = React.useState<CreateTileKey | null>(null);

  if (active) {
    const meta = TILE_META[active];
    return (
      <div className={styles.expanded}>
        <div className={styles.expandedHeader}>
          <div className={styles.tileHeader}>
            <span className={styles.tileIcon} aria-hidden>{meta.icon}</span>
            <h2 className={styles.tileTitle}>{meta.title}</h2>
          </div>
          <button className={styles.backBtn} type="button" onClick={() => setActive(null)}>
            Back
          </button>
        </div>
        <div className={styles.expandedBody}>
          <ul className={styles.tileList}>
            {meta.bullets.map((b, i) => (
              <li key={i}>{b}</li>
            ))}
          </ul>
          <div className={styles.tileLearn}>Learn more</div>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.wrap}>
      <div className={styles.headerRow}>
        <h2 className={styles.title}>Suggested prompts</h2>
      </div>
      <div className={styles.chipRow}>
        {QUICK_CHIPS.map((chip) => (
          <button key={chip} type="button" className={styles.chip}>
            {chip}
          </button>
        ))}
      </div>
      <div className={styles.grid}>
        {(Object.keys(TILE_META) as CreateTileKey[]).map((key) => {
          const t = TILE_META[key];
          return (
            <button key={key} type="button" className={styles.tile} onClick={() => setActive(key)}>
              <div className={styles.tileHeader}>
                <span className={styles.tileIcon} aria-hidden>{t.icon}</span>
                <div className={styles.tileTitle}>{t.title}</div>
              </div>
              <ul className={styles.tileList}>
                {t.bullets.map((b, i) => (
                  <li key={i}>{b}</li>
                ))}
              </ul>
              <div className={styles.tileLearn}>Learn more</div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
