"use client";

import * as React from "react";
import { usePathname } from "next/navigation";

import { AiPrompterStage } from "@/components/ai-prompter-stage";
import { useComposer } from "@/components/composer/ComposerProvider";
import { PrimaryHeader } from "@/components/primary-header";
import { ConnectionsRail } from "@/components/rail/ConnectionsRail";
import { DiscoveryRail } from "@/components/rail/DiscoveryRail";
import { LiveChatRail, type LiveChatRailProps } from "@/components/live/LiveChatRail";

import styles from "./app-shell.module.css";

type NavKey = "home" | "create" | "capsule" | "memory";

type AppShellProps = {
  children: React.ReactNode;
  activeNav?: NavKey;
  showPrompter?: boolean;
  promoSlot?: React.ReactNode;
  capsuleBanner?: React.ReactNode;
  showLiveChatRightRail?: boolean;
  liveChatRailProps?: LiveChatRailProps;
};

export function AppShell({
  children,
  activeNav,
  showPrompter = true,
  promoSlot,
  capsuleBanner,
  showLiveChatRightRail = true,
  liveChatRailProps,
}: AppShellProps) {
  const pathname = usePathname();
  const composer = useComposer();

  const derivedActive: NavKey = React.useMemo(() => {
    if (activeNav) return activeNav;
    if (!pathname) return "home";
    if (pathname.startsWith("/create")) return "create";
    if (pathname.startsWith("/capsule")) return "capsule";
    if (pathname.startsWith("/memory")) return "memory";
    return "home";
  }, [activeNav, pathname]);

  const isHome = derivedActive === "home";
  const isCapsule = derivedActive === "capsule";
  const layoutClassName = isHome ? `${styles.layout} ${styles.layoutHome}` : styles.layout;
  const contentClassName = isHome ? `${styles.content} ${styles.contentHome}` : styles.content;
  const leftRailClassName = isHome ? `${styles.rail} ${styles.leftRail} ${styles.leftRailHome}` : `${styles.rail} ${styles.leftRail}`;
  const rightRailClassName = isHome ? `${styles.rail} ${styles.rightRail} ${styles.rightRailHome}` : `${styles.rail} ${styles.rightRail}`;
  const capsuleLayoutClassName = showLiveChatRightRail
    ? `${styles.layout} ${styles.layoutCapsule}`
    : `${styles.layout} ${styles.layoutCapsule} ${styles.layoutCapsuleNoRight}`;

  const [statusMessage, setStatusMessage] = React.useState<string | null>(null);
  React.useEffect(() => {
    if (!statusMessage) return;
    const timer = window.setTimeout(() => setStatusMessage(null), 4000);
    return () => window.clearTimeout(timer);
  }, [statusMessage]);

  return (
    <div className={isCapsule ? `${styles.outer} ${styles.outerCapsule}` : styles.outer}>
      <PrimaryHeader activeKey={derivedActive} />
      <div className={isCapsule ? `${styles.page} ${styles.pageCapsule}` : styles.page}>
        <main className={styles.main}>
          {showPrompter ? (
            <div className={styles.prompterStage}>
              <AiPrompterStage
                onAction={composer.handlePrompterAction}
                statusMessage={statusMessage}
              />
            </div>
          ) : null}

          {isCapsule ? (
            <>
              <div className={capsuleLayoutClassName}>
                <aside className={`${styles.rail} ${styles.leftRail} ${styles.leftRailCapsule}`}>
                  <ConnectionsRail />
                </aside>
                <section className={`${styles.content} ${styles.contentCapsule}`}>
                  {capsuleBanner ? <div className={styles.capsuleBanner}>{capsuleBanner}</div> : null}
                  {children}
                </section>
                {showLiveChatRightRail ? (
                  <aside className={`${styles.rail} ${styles.rightRail} ${styles.rightRailCapsule}`}>
                    <LiveChatRail {...liveChatRailProps} />
                  </aside>
                ) : null}
              </div>
            </>
          ) : (
            <div className={layoutClassName}>
              {isHome ? (
                <>
                  {/* Left rail: move connections (friends/chats/requests) here */}
                  <aside className={leftRailClassName}>
                    <ConnectionsRail />
                  </aside>
                  <section className={contentClassName}>
                    {promoSlot ? <div className={styles.promoRowSpace}>{promoSlot}</div> : null}
                    {children}
                  </section>
                  {/* Right rail: placeholder recommendations + live-feed-like UI */}
                  <aside className={rightRailClassName}>
                    <DiscoveryRail />
                  </aside>
                </>
              ) : (
                <>
                  {/* Non-home pages: place connections rail on the left to match app */}
                  <aside className={`${styles.rail} ${styles.leftRail}`}>
                    <ConnectionsRail />
                  </aside>
                  <section className={contentClassName}>
                    {promoSlot ? <div className={styles.promoRowSpace}>{promoSlot}</div> : null}
                    {children}
                  </section>
                </>
              )}
            </div>
          )}
        </main>
      </div>
      {/* Composer is mounted globally via AiComposerRoot */}
    </div>
  );
}
