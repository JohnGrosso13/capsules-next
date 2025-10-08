"use client";

import * as React from "react";
import styles from "./discovery-rail.module.css";

type Item = {
  id: string;
  title: string;
  subtitle?: string;
  meta?: string;
  badge?: string;
};

function Section({ title, items, action }: { title: string; items: Item[]; action?: string }) {
  return (
    <section className={styles.section}>
      <header className={styles.sectionHeader}>
        <h3 className={styles.sectionTitle}>{title}</h3>
        {action ? <button className={styles.action}>{action}</button> : null}
      </header>
      <ul className={styles.list}>
        {items.map((item) => (
          <li key={item.id} className={styles.listItem}>
            <div className={styles.avatar} aria-hidden />
            <div className={styles.itemBody}>
              <div className={styles.itemTitleRow}>
                <span className={styles.itemTitle}>{item.title}</span>
                {item.badge ? <span className={styles.badge}>{item.badge}</span> : null}
              </div>
              {item.subtitle ? <div className={styles.itemSub}>{item.subtitle}</div> : null}
              {item.meta ? <div className={styles.itemMeta}>{item.meta}</div> : null}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function DiscoveryRail() {
  // Placeholder content only; no data wiring yet
  const capsules: Item[] = [
    { id: "c1", title: "Creator Studio", subtitle: "Brand design + prompts", meta: "12k members" },
    { id: "c2", title: "AI Photography", subtitle: "Midjourney, SDXL tips", meta: "8.2k members" },
    { id: "c3", title: "Music Makers", subtitle: "DAW workflows + samples", meta: "4.5k members" },
  ];
  const events: Item[] = [
    { id: "e1", title: "Weekly Capsule Lab", subtitle: "Today 5:00 PM", badge: "LIVE" },
    { id: "e2", title: "Prompt Jam #27", subtitle: "Tomorrow 3:00 PM", meta: "RSVP 210" },
  ];
  const trending: Item[] = [
    { id: "t1", title: "What’s Hot", subtitle: "AI logos in 60s", meta: "2.1k watching" },
    { id: "t2", title: "Capsules x Stream", subtitle: "OBS scene presets", meta: "1.3k watching" },
  ];

  return (
    <div className={styles.container}>
      {/* Chat-like shell so this rail can become live chat later */}
      <div className={styles.shell}>
        <Section title="Recommended Capsules" items={capsules} action="See all" />
        <Section title="Upcoming Events" items={events} action="Calendar" />
        <Section title="What’s Hot" items={trending} action="More" />
      </div>
    </div>
  );
}

export default DiscoveryRail;

