"use client";

import * as React from "react";
import styles from "@/app/(authenticated)/friends/friends.module.css";

type Tab = "Assistant" | "Friends" | "Party" | "Chats" | "Requests";

type FriendsTabsProps = {
  active: Tab;
  counters: Record<Tab, number>;
  onSelect(tab: Tab): void;
};

export function FriendsTabs({ active, counters, onSelect }: FriendsTabsProps) {
  const order = React.useMemo(
    () => ["Assistant", "Friends", "Party", "Chats", "Requests"] as const,
    [],
  );

  const handleKey = React.useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
      event.preventDefault();
      const current = order.indexOf(active);
      const nextIndex =
        event.key === "ArrowRight"
          ? (current + 1) % order.length
          : (current - 1 + order.length) % order.length;
      const nextTab = order[nextIndex] ?? order[0];
      onSelect(nextTab);
    },
    [active, onSelect, order],
  );

  return (
    <div className={styles.tabsSticky}>
      <div className={styles.tabs} role="tablist" aria-label="Friends" onKeyDown={handleKey}>
        {order.map((tab) => {
          const badge = counters[tab] ?? 0;
          const isActive = active === tab;
          return (
            <button
              key={tab}
              id={`tab-${tab.toLowerCase()}`}
              type="button"
              role="tab"
              aria-selected={isActive}
              aria-controls={`panel-${tab.toLowerCase()}`}
              tabIndex={isActive ? 0 : -1}
              className={`${styles.tab} ${isActive ? styles.tabActive : ""}`.trim()}
              onClick={() => onSelect(tab)}
            >
              <span className={styles.tabLabel}>{tab}</span>
              {badge > 0 ? <span className={styles.badge}>{badge}</span> : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}
