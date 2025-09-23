"use client";

import React from "react";
import styles from "./group-carousel.module.css";

type Item = string | { label: string; icon?: string };

const DEFAULT_ICONS: Record<string, string> = {
  Creators: "🎨",
  Teams: "👥",
  Families: "👨‍👩‍👧",
  "Community Founders": "🏛️",
  "Event Organizers": "📅",
  "Educators & Coaches": "🎓",
  Clubs: "🎯",
  "Designers & Illustrators": "✏️",
  "Local Groups": "📍",
  "Gaming Communities": "🎮",
  Schools: "🏫",
  "Independent Sellers": "🛍️",
  Streamers: "📺",
  Leagues: "🏆",
  Writers: "✍️",
  Podcasters: "🎙️",
  Photographers: "📷",
  "Alumni Networks": "🎓",
};

export function GroupCarousel({ items, animate = false }: { items: Item[]; animate?: boolean }) {
  const normalized = React.useMemo(
    () =>
      items.map((it) =>
        typeof it === "string" ? { label: it, icon: DEFAULT_ICONS[it] || "✨" } : { label: it.label, icon: it.icon || DEFAULT_ICONS[it.label] || "✨" },
      ),
    [items],
  );
  const list = React.useMemo(() => [...normalized, ...normalized], [normalized]);
  return (
    <div className={styles.band}>
      <div className={styles.carousel} aria-label="Group types carousel">
        <div className={styles.track} role="list" data-animate={animate ? "true" : "false"}>
          {list.map((entry, i) => (
            <span className={styles.item} key={`${entry.label}-${i}`} role="listitem">
              <span className={styles.icon} aria-hidden="true">{entry.icon}</span>
              <span className={styles.label}>{entry.label}</span>
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
