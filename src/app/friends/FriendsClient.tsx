"use client";

import * as React from "react";
import styles from "./friends.module.css";

type Friend = { name: string; avatar?: string | null; online?: boolean };

const fallbackFriends: Friend[] = [
  { name: "Capsules Team", online: true },
  { name: "Memory Bot", online: true },
  { name: "Dream Studio", online: true },
];

export function FriendsClient() {
  const [friends, setFriends] = React.useState<Friend[]>([]);
  const tabs = ["Chats", "Friends", "Requests"] as const;
  type Tab = typeof tabs[number];
  const [active, setActive] = React.useState<Tab>("Friends");

  React.useEffect(() => {
    fetch("/api/friends/sync", { method: "POST" })
      .then((r) => r.json())
      .then((d) => {
        const arr = Array.isArray(d.friends) ? d.friends : [];
        const mapped: Friend[] = arr.map((raw: unknown) => {
          const f = raw as Record<string, unknown>;
          return {
            name: String((f as any).name ?? (f as any).userName ?? "Friend"),
            avatar:
              typeof (f as any).avatar === "string"
                ? ((f as any).avatar as string)
                : typeof (f as any).userAvatar === "string"
                ? ((f as any).userAvatar as string)
                : null,
            online: typeof (f as any).online === "boolean" ? ((f as any).online as boolean) : false,
          };
        });
        setFriends(mapped.length ? mapped : fallbackFriends);
      })
      .catch(() => setFriends(fallbackFriends));
  }, []);

  const counters: Record<Tab, number> = {
    Chats: 0,
    Friends: friends.length,
    Requests: 0,
  };

  const idFor = (name: Tab) => `tab-${name.toLowerCase()}`;
  const panelFor = (name: Tab) => `panel-${name.toLowerCase()}`;

  function onKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    const i = tabs.indexOf(active);
    const next = e.key === "ArrowRight" ? (i + 1) % tabs.length : (i - 1 + tabs.length) % tabs.length;
    setActive(tabs[next]);
  }

  return (
    <section className={styles.friendsSection}>
      <div className={styles.tabsSticky}>
        <div
          className={styles.tabs}
          role="tablist"
          aria-label="Connections"
          onKeyDown={onKeyDown}
        >
          {tabs.map((tab) => (
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
              <span className={styles.tabLabel}>{tab}</span>
              {counters[tab] ? <span className={styles.badge}>{counters[tab]}</span> : null}
            </button>
          ))}
        </div>
      </div>

      <div
        id={panelFor("Chats")}
        role="tabpanel"
        aria-labelledby={idFor("Chats")}
        hidden={active !== "Chats"}
        className={`${styles.tabPanel} ${styles.panelFull}`.trim()}
      >
        <div className={styles.empty}>Chats are coming soon.</div>
      </div>

      <div
        id={panelFor("Friends")}
        role="tabpanel"
        aria-labelledby={idFor("Friends")}
        hidden={active !== "Friends"}
        className={`${styles.tabPanel} ${styles.panelFull}`.trim()}
      >
        <div className={`${styles.list} ${styles.listLarge}`.trim()}>
          {friends.map((f, i) => (
            <div key={i} className={styles.friendRow}>
              <span className={styles.avatarWrap}>
                {f.avatar ? (
                  <img className={styles.avatarImg} src={f.avatar} alt="" aria-hidden />
                ) : (
                  <span className={styles.avatar} aria-hidden />
                )}
                <span className={`${styles.presence} ${f.online ? styles.online : styles.offline}`.trim()} aria-hidden />
              </span>
              <div className={styles.friendMeta}>
                <div className={styles.friendName}>{f.name}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div
        id={panelFor("Requests")}
        role="tabpanel"
        aria-labelledby={idFor("Requests")}
        hidden={active !== "Requests"}
        className={`${styles.tabPanel} ${styles.panelFull}`.trim()}
      >
        <div className={styles.empty}>No pending requests.</div>
      </div>
    </section>
  );
}
