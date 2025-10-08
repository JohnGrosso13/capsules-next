"use client";

import * as React from "react";
import {
  ChartLineUp,
  Broadcast,
  MagicWand,
  ShieldCheck,
  GameController,
  Robot,
  ArrowLeft,
} from "@phosphor-icons/react/dist/ssr";
import { useRouter } from "next/navigation";
import styles from "./create-tiles.module.css";

export type CreateTileKey =
  | "growth"
  | "events"
  | "content"
  | "moderation"
  | "insights"
  | "automations";

// Intent chips removed: shown beneath the AI prompter

const TILE_META: Record<CreateTileKey, { title: string; icon: React.ReactNode; bullets: string[]; ctaLabel?: string }> = {
  growth: {
    icon: <ChartLineUp weight="fill" />,
    title: "Community Growth",
    bullets: [
      "Generate weekly digest",
      "Launch smart poll",
      "Auto-summarize posts",
      "Spotlight a member",
    ],
  },
  events: {
    icon: <Broadcast weight="fill" />,
    title: "AI Stream Studio",
    bullets: [
      "OBS sync + destination health",
      "Scene + overlay recommendations",
      "ChatGPT moderates & co-hosts",
      "Clip + auto post while live",
    ],
    ctaLabel: "Open dashboard",
  },
  content: {
    icon: <MagicWand weight="fill" />,
    title: "Content Creation",
    bullets: [
      "Generate highlight reel",
      "Compile clip montage",
      "Create logo/banner/emote",
      "Narration or casting",
    ],
  },
  moderation: {
    icon: <ShieldCheck weight="fill" />,
    title: "Moderation & Safety",
    bullets: [
      "Scan last 24 hours",
      "Draft code of conduct",
      "Flag engagement spikes",
      "Resolve case summary",
    ],
  },
  insights: {
    icon: <GameController weight="fill" />,
    title: "Gaming Insights",
    bullets: [
      "Run live match analysis",
      "Generate strategy plan",
      "Launch stat integration",
      "Build coaching plan",
    ],
  },
  automations: {
    icon: <Robot weight="fill" />,
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
  const router = useRouter();

  const handleTileClick = React.useCallback(
    (key: CreateTileKey) => {
      if (key === "events") {
        router.push("/create/ai-stream");
        return;
      }
      setActive(key);
    },
    [router],
  );

  if (active) {
    const meta = TILE_META[active];
    return (
      <div className={styles.expanded} data-state="active">
        <div className={styles.expandedHeader}>
          <button
            className={styles.backBtn}
            type="button"
            aria-label="Back to create tiles"
            onClick={() => setActive(null)}
          >
            <ArrowLeft size={18} weight="bold" />
          </button>
          <div className={styles.tileHeader}>
            <span className={styles.tileIcon} aria-hidden>
              {meta.icon}
            </span>
            <h2 className={styles.tileTitle}>{meta.title}</h2>
          </div>
        </div>
        <div className={styles.expandedBody}>
          <ul className={styles.tileList}>
            {meta.bullets.map((b, i) => (
              <li key={i}>{b}</li>
            ))}
          </ul>
          <div className={styles.tileLearn}>{meta.ctaLabel ?? "Learn more"}</div>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.wrap}>
      {/* Header and quick intent chips removed */}
      <div className={styles.grid}>
        {(Object.keys(TILE_META) as CreateTileKey[]).map((key) => {
          const t = TILE_META[key];
          return (
            <button key={key} type="button" className={styles.tile} onClick={() => handleTileClick(key)}>
              <div className={styles.tileHeader}>
                <span className={styles.tileIcon} aria-hidden>
                  {t.icon}
                </span>
                <div className={styles.tileTitle}>{t.title}</div>
              </div>
              <ul className={styles.tileList}>
                {t.bullets.map((b, i) => (
                  <li key={i}>{b}</li>
                ))}
              </ul>
              <div className={styles.tileLearn}>{t.ctaLabel ?? "Learn more"}</div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
