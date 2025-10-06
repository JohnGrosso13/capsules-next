"use client";

import * as React from "react";
import { usePathname } from "next/navigation";

import { AiPrompterStage } from "@/components/ai-prompter-stage";
import { useComposer } from "@/components/composer/ComposerProvider";
import { PrimaryHeader } from "@/components/primary-header";
import { ConnectionsRail } from "@/components/rail/ConnectionsRail";
import { DiscoveryRail } from "@/components/rail/DiscoveryRail";

import styles from "./app-shell.module.css";

type NavKey = "home" | "create" | "capsule" | "memory";

type AppShellProps = {
  children: React.ReactNode;
  activeNav?: NavKey;
  showPrompter?: boolean;
  promoSlot?: React.ReactNode;
};

export function AppShell({ children, activeNav, showPrompter = true, promoSlot }: AppShellProps) {
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
  const layoutClassName = isHome ? `${styles.layout} ${styles.layoutHome}` : styles.layout;
  const contentClassName = isHome ? `${styles.content} ${styles.contentHome}` : styles.content;
  const leftRailClassName = isHome ? `${styles.rail} ${styles.leftRail} ${styles.leftRailHome}` : `${styles.rail} ${styles.leftRail}`;
  const rightRailClassName = isHome ? `${styles.rail} ${styles.rightRail} ${styles.rightRailHome}` : `${styles.rail} ${styles.rightRail}`;

  const [statusMessage, setStatusMessage] = React.useState<string | null>(null);
  React.useEffect(() => {
    if (!statusMessage) return;
    const timer = window.setTimeout(() => setStatusMessage(null), 4000);
    return () => window.clearTimeout(timer);
  }, [statusMessage]);

  return (
    <div className={styles.outer}>
      <PrimaryHeader activeKey={derivedActive} />
      <div className={styles.page}>
        <main className={styles.main}>
          {showPrompter ? (
            <div className={styles.prompterStage}>
              <AiPrompterStage
                onAction={composer.handlePrompterAction}
                statusMessage={statusMessage}
              />
            </div>
          ) : null}

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
                <section className={contentClassName}>
                  {promoSlot ? <div className={styles.promoRowSpace}>{promoSlot}</div> : null}
                  {children}
                </section>
                <aside className={styles.rail}>
                  <ConnectionsRail />
                </aside>
              </>
            )}
          </div>
        </main>
      </div>
      {/* Composer is mounted globally via AiComposerRoot */}
    </div>
  );
}
