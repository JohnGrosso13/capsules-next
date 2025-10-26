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
  layoutVariant?: "default" | "capsule";
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
  layoutVariant = "default",
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
  const usesCapsuleLayout = isCapsule || layoutVariant === "capsule";
  const [capsuleTab, setCapsuleTab] = React.useState<CapsuleTab>("feed");
  const isCapsuleFeedView = isCapsule && capsuleTab === "feed";
  const isCapsuleStoreView = isCapsule && capsuleTab === "store";
  const shouldShowDiscoveryRail = showDiscoveryRightRail || isCapsuleFeedView;
  const allowLiveChatRail = showLiveChatRightRail && !isCapsuleStoreView;
  const capsuleHasRightRail = shouldShowDiscoveryRail || allowLiveChatRail;
  const effectiveLayout: "default" | "home" | "capsule" = usesCapsuleLayout
    ? "capsule"
    : isHome
      ? "home"
      : "default";
  const nonCapsuleHasRightRail = !usesCapsuleLayout && (isHome || showDiscoveryRightRail);
  const layoutColumns =
    usesCapsuleLayout && !capsuleHasRightRail
      ? "two"
      : capsuleHasRightRail || nonCapsuleHasRightRail
        ? "with-right"
        : "two";

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
    if (shouldShowDiscoveryRail) {
      // Show discovery rail for feed views or when explicitly requested.
      return <DiscoveryRail />;
    }
    if (allowLiveChatRail) {
      return <LiveChatRail {...liveChatRailProps} />;
    }
    return null;
  }, [shouldShowDiscoveryRail, allowLiveChatRail, liveChatRailProps]);

  const standardRightRailContent = !usesCapsuleLayout
    ? isHome || showDiscoveryRightRail
      ? <DiscoveryRail />
      : null
    : null;
  const rightRailContent = usesCapsuleLayout ? capsuleRightRailContent : standardRightRailContent;

  return (
    <div className={styles.outer} data-layout={effectiveLayout}>
      <PrimaryHeader activeKey={derivedActive} />
      <div className={styles.page} data-layout={effectiveLayout}>
        <main className={styles.main}>
          {showPrompter ? (
            <div className={styles.prompterStage}>
              <AiPrompterStage
                onAction={composer.handlePrompterAction}
                statusMessage={statusMessage}
              />
            </div>
          ) : null}

          <div
            className={styles.layout}
            data-layout={effectiveLayout}
            data-columns={layoutColumns}
            data-has-right={usesCapsuleLayout ? String(capsuleHasRightRail) : undefined}
            data-capsule-tab={usesCapsuleLayout ? capsuleTab : undefined}
          >
            <aside className={styles.rail} data-side="left" data-layout={effectiveLayout}>
              <ConnectionsRail />
            </aside>

            <section
              className={styles.content}
              data-layout={effectiveLayout}
              data-capsule-tab={usesCapsuleLayout ? capsuleTab : undefined}
            >
              {usesCapsuleLayout ? (
                <>
                  {capsuleBanner ? (
                    <div className={styles.capsuleBanner}>{capsuleBanner}</div>
                  ) : null}
                  {children}
                </>
              ) : (
                <>
                  {promoSlot ? <div className={styles.promoRowSpace}>{promoSlot}</div> : null}
                  {children}
                </>
              )}
            </section>

            {rightRailContent ? (
              <aside className={styles.rail} data-side="right" data-layout={effectiveLayout}>
                {rightRailContent}
              </aside>
            ) : null}
          </div>
        </main>
      </div>
      {/* Composer is mounted globally via AiComposerRoot */}
    </div>
  );
}
