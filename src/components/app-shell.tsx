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

type NavKey = "home" | "explore" | "create" | "capsule" | "market" | "memory";
type CapsuleTab = "live" | "feed" | "store";

type AppShellProps = {
  children: React.ReactNode;
  activeNav?: NavKey;
  showPrompter?: boolean;
  promoSlot?: React.ReactNode;
  capsuleBanner?: React.ReactNode;
  showLiveChatRightRail?: boolean;
  liveChatRailProps?: LiveChatRailProps;
  showDiscoveryRightRail?: boolean;
};

export function AppShell({
  children,
  activeNav,
  showPrompter = true,
  promoSlot,
  capsuleBanner,
  showLiveChatRightRail = true,
  liveChatRailProps,
  showDiscoveryRightRail = false,
}: AppShellProps) {
  const pathname = usePathname();
  const composer = useComposer();

  const derivedActive: NavKey = React.useMemo(() => {
    if (activeNav) return activeNav;
    if (!pathname) return "home";
    if (pathname.startsWith("/explore")) return "explore";
    if (pathname.startsWith("/create")) return "create";
    if (pathname.startsWith("/capsule")) return "capsule";
    if (pathname.startsWith("/market")) return "market";
    if (pathname.startsWith("/memory")) return "memory";
    return "home";
  }, [activeNav, pathname]);

  const isHome = derivedActive === "home";
  const isCapsule = derivedActive === "capsule";
  const [capsuleTab, setCapsuleTab] = React.useState<CapsuleTab>("feed");
  const layoutClassName = styles.layout;
  const contentClassName = styles.content;
  const leftRailClassName = `${styles.rail} ${styles.leftRail}`;
  const rightRailClassName = `${styles.rail} ${styles.rightRail}`;
  const isCapsuleFeedView = isCapsule && capsuleTab === "feed";
  const capsuleHasRightRail = isCapsuleFeedView || showLiveChatRightRail;
  const capsuleLayoutClassName = capsuleHasRightRail
    ? `${styles.layout} ${styles.layoutCapsule}`
    : `${styles.layout} ${styles.layoutCapsule} ${styles.layoutCapsuleNoRight}`;

  const [statusMessage, setStatusMessage] = React.useState<string | null>(null);
  React.useEffect(() => {
    if (!statusMessage) return;
    const timer = window.setTimeout(() => setStatusMessage(null), 4000);
    return () => window.clearTimeout(timer);
  }, [statusMessage]);

  React.useEffect(() => {
    if (!isCapsule) {
      setCapsuleTab("feed");
      return;
    }
    const handleCapsuleTab = (event: Event) => {
      const detail = (event as CustomEvent<{ tab?: CapsuleTab }>).detail;
      if (!detail?.tab) return;
      setCapsuleTab(detail.tab);
    };
    window.addEventListener("capsule:tab", handleCapsuleTab);
    return () => {
      window.removeEventListener("capsule:tab", handleCapsuleTab);
    };
  }, [isCapsule]);

  const capsuleRightRailContent = React.useMemo(() => {
    if (isCapsuleFeedView) {
      // Swap in discovery content when viewing the capsule feed.
      return <DiscoveryRail />;
    }
    if (showLiveChatRightRail) {
      return <LiveChatRail {...liveChatRailProps} />;
    }
    return null;
  }, [isCapsuleFeedView, showLiveChatRightRail, liveChatRailProps]);

  const needsNudgeRight = derivedActive === "home" || derivedActive === "create";
  return (
    <div className={isCapsule ? `${styles.outer} ${styles.outerCapsule}` : styles.outer}>
      <PrimaryHeader activeKey={derivedActive} />
      <div className={
        isCapsule
          ? `${styles.page} ${styles.pageCapsule}`
          : needsNudgeRight
            ? `${styles.page} ${styles.pageNudgeRight}`
            : styles.page
      }>
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
                {capsuleHasRightRail && capsuleRightRailContent ? (
                  <aside className={`${styles.rail} ${styles.rightRail} ${styles.rightRailCapsule}`}>
                    {capsuleRightRailContent}
                  </aside>
                ) : null}
              </div>
            </>
          ) : (
            <div
              className={
                isHome || showDiscoveryRightRail
                  ? `${styles.layout} ${styles.layoutWithRight}`
                  : layoutClassName
              }
            >
              {/* Left connections rail */}
              <aside className={leftRailClassName}>
                <ConnectionsRail />
              </aside>
              <section className={contentClassName}>
                {promoSlot ? <div className={styles.promoRowSpace}>{promoSlot}</div> : null}
                {children}
              </section>
              {(isHome || showDiscoveryRightRail) ? (
                <aside className={rightRailClassName}>
                  <DiscoveryRail />
                </aside>
              ) : null}
            </div>
          )}
        </main>
      </div>
      {/* Composer is mounted globally via AiComposerRoot */}
    </div>
  );
}
