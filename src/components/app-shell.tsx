"use client";

/* eslint-disable @next/next/no-img-element */

import * as React from "react";
import { usePathname } from "next/navigation";

import { AiPrompterStage } from "@/components/ai-prompter-stage";
import { PrimaryHeader } from "@/components/primary-header";
import friendsStyles from "@/app/(authenticated)/friends/friends.module.css";
import homeStyles from "./home.module.css";

import styles from "./app-shell.module.css";

type NavKey = "home" | "create" | "capsule" | "memory";

type Friend = {
  name: string;
  avatar?: string | null;
  status?: "online" | "offline" | "away";
};

type RailTab = "friends" | "chats" | "requests";

type AppShellProps = {
  children: React.ReactNode;
  activeNav?: NavKey;
  showPrompter?: boolean;
  promoSlot?: React.ReactNode;
};

const fallbackFriends: Friend[] = [
  { name: "Capsules Team", status: "online" },
  { name: "Memory Bot", status: "online" },
  { name: "Dream Studio", status: "online" },
];

export function AppShell({ children, activeNav, showPrompter = true, promoSlot }: AppShellProps) {
  const pathname = usePathname();
  const derivedActive: NavKey = React.useMemo(() => {
    if (activeNav) return activeNav;
    if (!pathname) return "home";
    if (pathname.startsWith("/create")) return "create";
    if (pathname.startsWith("/capsule")) return "capsule";
    if (pathname.startsWith("/memory")) return "memory";
    return "home";
  }, [activeNav, pathname]);

  const [friends, setFriends] = React.useState<Friend[]>(fallbackFriends);
  const [railMode, setRailMode] = React.useState<"tiles" | "connections">("tiles");
  const [activeRailTab, setActiveRailTab] = React.useState<RailTab>("friends");

  React.useEffect(() => {
    fetch("/api/friends/sync", { method: "POST" })
      .then((r) => r.json())
      .then((d) => {
        const arr = Array.isArray(d.friends) ? d.friends : [];
        const mapped: Friend[] = arr.map((raw: unknown) => {
          const record = raw as Record<string, unknown>;
          const name = typeof record["name"] === "string"
            ? (record["name"] as string)
            : typeof record["userName"] === "string"
            ? (record["userName"] as string)
            : "Friend";
          const avatar = typeof record["avatar"] === "string"
            ? (record["avatar"] as string)
            : typeof record["userAvatar"] === "string"
            ? (record["userAvatar"] as string)
            : null;
          const statusValue = typeof record["status"] === "string" ? (record["status"] as string) : undefined;
          const status: Friend["status"] = statusValue === "online" || statusValue === "away" ? (statusValue as Friend["status"]) : "offline";
          return { name, avatar, status };
        });
        setFriends(mapped.length ? mapped : fallbackFriends);
      })
      .catch(() => setFriends(fallbackFriends));
  }, []);

  const connectionTiles = React.useMemo(
    () => [
      {
        key: "friends" as RailTab,
        title: "Friends",
        description: "Manage the people in your capsule.",
        href: "/friends?tab=friends",
        icon: "🤝",
        badge: friends.length || undefined,
        primary: true,
      },
      {
        key: "chats" as RailTab,
        title: "Chats",
        description: "Conversations coming soon.",
        href: "/friends?tab=chats",
        icon: "💬",
      },
      {
        key: "requests" as RailTab,
        title: "Requests",
        description: "Approve or invite new members.",
        href: "/friends?tab=requests",
        icon: "✨",
      },
    ],
    [friends.length],
  );

  function presenceClass(status?: string) {
    if (status === "online") return friendsStyles.online;
    if (status === "away") return friendsStyles.away ?? friendsStyles.online;
    return friendsStyles.offline;
  }

  return (
    <div className={styles.outer}>
      <PrimaryHeader activeKey={derivedActive} />
      <div className={styles.page}>

        <main className={styles.main}>
        {showPrompter ? (
          <div className={styles.prompterStage}>
            <AiPrompterStage />
          </div>
        ) : null}

        <div className={styles.layout}>
          <section className={styles.content}>
            {promoSlot ? <div className={styles.promoRowSpace}>{promoSlot}</div> : null}
            {children}
          </section>
          <aside className={styles.rail}>
            {railMode === "tiles" ? (
              <div className={homeStyles.connectionTiles}>
                {connectionTiles.map((tile) => (
                  <button
                    key={tile.key}
                    type="button"
                    className={`${homeStyles.connectionTile} ${tile.primary ? homeStyles.connectionTilePrimary : ""}`.trim()}
                    onClick={() => {
                      setActiveRailTab(tile.key);
                      setRailMode("connections");
                    }}
                  >
                    <div className={homeStyles.connectionTileHeader}>
                      <div className={homeStyles.connectionTileMeta}>
                        <span className={homeStyles.connectionTileIcon} aria-hidden>
                          {tile.icon}
                        </span>
                        <span className={homeStyles.connectionTileTitle}>{tile.title}</span>
                      </div>
                      {tile.badge ? <span className={homeStyles.connectionTileBadge}>{tile.badge}</span> : null}
                    </div>
                    <p className={homeStyles.connectionTileDescription}>{tile.description}</p>
                  </button>
                ))}
              </div>
            ) : (
              <div className={homeStyles.railConnections}>
                <div className={homeStyles.railHeaderRow}>
                  <button
                    type="button"
                    className={homeStyles.railBackBtn}
                    aria-label="Back to tiles"
                    onClick={() => setRailMode("tiles")}
                  >&lt;</button>
                </div>
                <div className={homeStyles.railTabs} role="tablist" aria-label="Connections">
                  {(
                    [
                      { key: "friends", label: "Friends" },
                      { key: "chats", label: "Chats" },
                      { key: "requests", label: "Requests" },
                    ] as { key: RailTab; label: string }[]
                  ).map((t) => (
                    <button
                      key={t.key}
                      type="button"
                      role="tab"
                      aria-selected={activeRailTab === t.key}
                      className={`${homeStyles.railTab} ${activeRailTab === t.key ? homeStyles.railTabActive : ""}`.trim()}
                      onClick={() => setActiveRailTab(t.key)}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
                <div className={homeStyles.railPanel} hidden={activeRailTab !== "friends"}>
                  <div className={`${friendsStyles.list}`.trim()}>
                    {friends.map((f, i) => (
                      <div key={i} className={friendsStyles.friendRow}>
                        <span className={friendsStyles.avatarWrap}>
                          {f.avatar ? (
                            <img className={friendsStyles.avatarImg} src={f.avatar} alt="" aria-hidden />
                          ) : (
                            <span className={friendsStyles.avatar} aria-hidden />
                          )}
                          <span className={`${friendsStyles.presence} ${presenceClass(f.status)}`.trim()} aria-hidden />
                        </span>
                        <div className={friendsStyles.friendMeta}>
                          <div className={friendsStyles.friendName}>{f.name}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
                <div className={homeStyles.railPanel} hidden={activeRailTab !== "chats"}>
                  <div className={friendsStyles.empty}>Chats are coming soon.</div>
                </div>
                <div className={homeStyles.railPanel} hidden={activeRailTab !== "requests"}>
                  <div className={friendsStyles.empty}>No pending requests.</div>
                </div>
              </div>
            )}
          </aside>
        </div>
        </main>
      </div>
    </div>
  );
}









