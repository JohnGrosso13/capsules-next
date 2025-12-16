"use client";

import * as React from "react";
import {
  ChartLineUp,
  Broadcast,
  MagicWand,
  ShieldCheck,
  GameController,
  Trophy,
  ArrowLeft,
} from "@phosphor-icons/react/dist/ssr";
import { useRouter } from "next/navigation";
import styles from "./create-tiles.module.css";

export type CreateTileKey =
  | "mystore"
  | "events"
  | "content"
  | "moderation"
  | "insights"
  | "ladders";

// Intent chips removed: shown beneath the AI prompter

const TILE_META: Record<
  CreateTileKey,
  { title: string; icon: React.ReactNode; bullets: string[]; ctaLabel?: string }
> = {
  mystore: {
    icon: <ChartLineUp weight="fill" />,
    title: "My Store",
    bullets: [
      "Sales snapshot in seconds",
      "Jump into orders fast",
      "Payouts and balances",
      "Quick product tweaks",
    ],
    ctaLabel: "Manage Store",
  },
  events: {
    icon: <Broadcast weight="fill" />,
    title: "AI Stream Studio",
    bullets: [
      "OBS sync + health",
      "Smart scenes & overlays",
      "AI co-host moderates",
      "Auto clips + posts",
    ],
    ctaLabel: "Open Dashboard",
  },
  content: {
    icon: <MagicWand weight="fill" />,
    title: "Content Creation",
    bullets: [
      "Highlight reels fast",
      "Auto clip montages",
      "Logos, banners, emotes",
      "Voiceover or casting",
    ],
    ctaLabel: "Learn More",
  },
  moderation: {
    icon: <ShieldCheck weight="fill" />,
    title: "Moderation & Safety",
    bullets: [
      "Scan last 24h",
      "Draft conduct guide",
      "Catch spikes or abuse",
      "Close cases fast",
    ],
    ctaLabel: "Learn More",
  },
  insights: {
    icon: <GameController weight="fill" />,
    title: "Personal Coach",
    bullets: [
      "Review your latest",
      "Practice plan ready",
      "Strengths and gaps",
      "Track trends over time",
    ],
    ctaLabel: "Learn More",
  },
  ladders: {
    icon: <Trophy weight="fill" />,
    title: "Ladders & Tournaments",
    bullets: [
      "AI drafts rules + copy",
      "ELO presets ready",
      "Weekly challenges + prizes",
      "Publish to Capsule Events",
    ],
    ctaLabel: "Launch Builder",
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
      if (key === "content") {
        router.push("/create/content");
        return;
      }
      if (key === "moderation") {
        router.push("/create/moderation");
        return;
      }
      if (key === "insights") {
        router.push("/create/insights");
        return;
      }
      if (key === "mystore") {
        router.push("/create/mystore");
        return;
      }
      if (key === "ladders") {
        router.push("/create/ladders");
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
            <button
              key={key}
              type="button"
              className={styles.tile}
              onClick={() => handleTileClick(key)}
            >
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
