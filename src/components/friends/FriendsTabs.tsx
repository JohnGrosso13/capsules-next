"use client";

import * as React from "react";
import styles from "@/app/(authenticated)/friends/friends.module.css";

type Tab = "Friends" | "Chats" | "Requests";

export function FriendsTabs({
  active,
  counters,
  onSelect,
}: {
  active: Tab;
  counters: Record<Tab, number>;
  onSelect(tab: Tab): void;
}) {
  const tabs = React.useMemo(() => ["Friends", "Chats", "Requests"] as const, []);
  const onKey = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    const index = tabs.indexOf(active);
    const nextIndex =
      e.key === "ArrowRight" ? (index + 1) % tabs.length : (index - 1 + tabs.length) % tabs.length;
    const target = tabs[nextIndex] ?? tabs[0];
    onSelect(target);
  };
  return (
    <div className={styles.tabsSticky}>
      <div className={styles.tabs} role="tablist" aria-label="Connections" onKeyDown={onKey}>
        {tabs.map((tab) => (
          <button
            key={tab}
            id={`tab-${tab.toLowerCase()}`}
            className={`${styles.tab} ${active === tab ? styles.tabActive : ""}`.trim()}
            role="tab"
            aria-selected={active === tab}
            aria-controls={`panel-${tab.toLowerCase()}`}
            tabIndex={active === tab ? 0 : -1}
            type="button"
            onClick={() => onSelect(tab)}
          >
            <span className={styles.tabContent}>
              <span className={styles.tabLabel}>{tab}</span>
            </span>
            {counters[tab] ? <span className={styles.badge}>{counters[tab]}</span> : null}
            <span className={styles.tabDescription}>
              {tab === "Friends" && "Everyone in your circle."}
              {tab === "Chats" && "Jump back into conversations."}
              {tab === "Requests" && "Approve new connections."}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
