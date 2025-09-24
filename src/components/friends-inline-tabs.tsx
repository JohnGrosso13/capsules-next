"use client";

import * as React from "react";
import styles from "./friends-inline-tabs.module.css";

type Friend = { name: string; avatar?: string | null; online?: boolean };

const TABS = ["Chats", "Friends", "Requests"] as const;
type Tab = typeof TABS[number];

export function FriendsInlineTabs({ friends }: { friends: Friend[] }) {
  const [active, setActive] = React.useState<Tab>("Friends");

  const counters: Record<Tab, number> = {
    Chats: 0,
    Friends: friends.length,
    Requests: 0,
  };

  const idFor = (name: Tab) => `rail-tab-${name.toLowerCase()}`;
  const panelFor = (name: Tab) => `rail-panel-${name.toLowerCase()}`;

  function onKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    const i = TABS.indexOf(active);
    const next = e.key === "ArrowRight" ? (i + 1) % TABS.length : (i - 1 + TABS.length) % TABS.length;
    setActive(TABS[next]);
  }

  return (
    <div className={styles.tabsWrap}>
      <div className={styles.tabs} role="tablist" aria-label="Connections" onKeyDown={onKeyDown}>
        {TABS.map((tab) => (
          <button
            key={tab}
            id={idFor(tab)}
            className={`${styles.tab} ${active === tab ? styles.tabActive : ""}`.trim()}
            role="tab"
            aria-selected={active === tab}
            aria-controls={panelFor(tab)}
            tabIndex={active === tab ? 0 : -1}
            type="button"
            onClick={() => setActive(tab)}
          >
            <span>{tab}</span>
            {counters[tab] ? <span className={styles.badge}>{counters[tab]}</span> : null}
          </button>
        ))}
      </div>

      <div id={panelFor("Chats")} role="tabpanel" aria-labelledby={idFor("Chats")} hidden={active !== "Chats"} className={styles.panel}>
        <div className={styles.empty}>Chats are coming soon.</div>
      </div>

      <div id={panelFor("Friends")} role="tabpanel" aria-labelledby={idFor("Friends")} hidden={active !== "Friends"} className={styles.panel}>
        <div className={styles.friendsList}>
          {friends.slice(0, 12).map((f, i) => (
            <div key={i} className={styles.friendItem}>
              <span className={styles.avatar} aria-hidden />
              {f.name}
            </div>
          ))}
        </div>
      </div>

      <div id={panelFor("Requests")} role="tabpanel" aria-labelledby={idFor("Requests")} hidden={active !== "Requests"} className={styles.panel}>
        <div className={styles.empty}>No pending requests.</div>
      </div>
    </div>
  );
}

