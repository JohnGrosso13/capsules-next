"use client";

import * as React from "react";
import { usePathname } from "next/navigation";

import { AiPrompterStage } from "@/components/ai-prompter-stage";
import {
  ComposerProvider,
  AiComposerRoot,
  useComposerActions,
} from "@/components/composer/ComposerProvider";
import { useHomeLoading } from "./home-loading";
import { FriendsDataProvider } from "@/components/providers/FriendsDataProvider";
import { ChatProvider } from "@/components/providers/ChatProvider";
import { PrimaryHeader } from "@/components/primary-header";
import { MobileHeader } from "@/components/mobile-header";
import { DiscoveryRail } from "@/components/rail/DiscoveryRail";
import { LiveChatRail, type LiveChatRailProps } from "@/components/live/LiveChatRail";
import { ConnectionsRailIsland } from "@/components/rail/ConnectionsRailIsland";
import { HOME_COMPOSER_CHIPS, EXPLORE_COMPOSER_CHIPS, CREATE_COMPOSER_CHIPS, CAPSULE_COMPOSER_CHIPS, MEMORY_COMPOSER_CHIPS, PROFILE_COMPOSER_CHIPS, SETTINGS_COMPOSER_CHIPS, LIVE_COMPOSER_CHIPS, STUDIO_COMPOSER_CHIPS, MARKET_COMPOSER_CHIPS } from "@/lib/prompter/chips";
import { usePrompterChips } from "@/hooks/usePrompterChips";
import { useCurrentUser } from "@/services/auth/client";

import styles from "./app-shell.module.css";

function RailPlaceholder() {
  return (
    <div className={styles.railPlaceholder} aria-hidden="true">
      <div className={styles.railPlaceholderTiles}>
        {[0, 1, 2].map((tile) => (
          <div key={tile} className={styles.railPlaceholderTile}>
            <div className={styles.railPlaceholderRow}>
              <div className={styles.railPlaceholderMeta}>
                <span className={styles.railPlaceholderIcon} data-rail-skeleton />
                <span className={styles.railPlaceholderTitle} data-rail-skeleton />
              </div>
              <span className={styles.railPlaceholderBadge} data-rail-skeleton />
            </div>
            <span className={styles.railPlaceholderLine} data-rail-skeleton />
            <span
              className={`${styles.railPlaceholderLine} ${styles.railPlaceholderLineShort}`}
              data-rail-skeleton
            />
          </div>
        ))}
      </div>
    </div>
  );
}

type NavKey = "home" | "explore" | "create" | "capsule" | "market" | "memory" | "profile" | "settings" | "live" | "studio";
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
  layoutVariant?: "default" | "capsule" | "studio";
  wideWithoutRightRail?: boolean;
};

function AppShellContent({
  children,
  activeNav,
  showPrompter = true,
  promoSlot,
  capsuleBanner,
  showLiveChatRightRail = true,
  liveChatRailProps,
  showDiscoveryRightRail = false,
  layoutVariant = "default",
  wideWithoutRightRail = false,
}: AppShellProps) {
  const pathname = usePathname();
  const composer = useComposerActions();
  const { user } = useCurrentUser();

  const derivedActive: NavKey = React.useMemo(() => {
    if (activeNav) return activeNav;
    if (!pathname) return "home";
    if (pathname.startsWith("/explore")) return "explore";
    if (pathname.startsWith("/create")) return "create";
    if (pathname.startsWith("/capsule")) return "capsule";
    if (pathname.startsWith("/market")) return "market";
    if (pathname.startsWith("/memory")) return "memory";
    if (pathname.startsWith("/profile")) return "profile";
    if (pathname.startsWith("/settings")) return "settings";
    if (pathname.startsWith("/live")) return "live";
    if (pathname.startsWith("/studio")) return "studio";
    return "home";
  }, [activeNav, pathname]);
  const homeLoading = useHomeLoading();
  const syncHomeLoading = derivedActive === "home" && homeLoading;
  const homePending = Boolean(syncHomeLoading && homeLoading?.isPending);

  const { chips: prompterChips } = usePrompterChips(
    derivedActive,
    derivedActive === "home"
      ? HOME_COMPOSER_CHIPS
      : derivedActive === "explore"
        ? EXPLORE_COMPOSER_CHIPS
        : derivedActive === "create"
          ? CREATE_COMPOSER_CHIPS
          : derivedActive === "capsule"
            ? CAPSULE_COMPOSER_CHIPS
            : derivedActive === "memory"
              ? MEMORY_COMPOSER_CHIPS
              : derivedActive === "profile"
                ? PROFILE_COMPOSER_CHIPS
                : derivedActive === "settings"
                  ? SETTINGS_COMPOSER_CHIPS
                  : derivedActive === "live"
                    ? LIVE_COMPOSER_CHIPS
                    : derivedActive === "market"
                      ? MARKET_COMPOSER_CHIPS
                      : derivedActive === "studio"
                        ? STUDIO_COMPOSER_CHIPS
                        : undefined,
    user?.id,
  );

  const isHome = derivedActive === "home";
  const isCapsule = derivedActive === "capsule";
  const usesCapsuleLayout =
    isCapsule || layoutVariant === "capsule" || layoutVariant === "studio";
  const [capsuleTab, setCapsuleTab] = React.useState<CapsuleTab>("feed");
  const isCapsuleLiveView = isCapsule && capsuleTab === "live";
  const isCapsuleStoreView = isCapsule && capsuleTab === "store";
  const shouldShowDiscoveryRail =
    showDiscoveryRightRail || (isCapsule && !isCapsuleLiveView && !isCapsuleStoreView);
  const allowLiveChatRail = showLiveChatRightRail && isCapsuleLiveView;
  const capsuleHasRightRail = shouldShowDiscoveryRail || allowLiveChatRail || isCapsuleStoreView;
  const effectiveLayout: "default" | "home" | "capsule" | "studio" =
    layoutVariant === "studio"
      ? "studio"
      : usesCapsuleLayout
        ? "capsule"
        : isHome
          ? "home"
          : "default";
  const nonCapsuleHasRightRail = !usesCapsuleLayout && (isHome || showDiscoveryRightRail);
  const wantsWideTwoColumn = wideWithoutRightRail && !usesCapsuleLayout;
  const layoutColumns =
    usesCapsuleLayout && !capsuleHasRightRail
      ? "two"
      : capsuleHasRightRail || nonCapsuleHasRightRail
        ? "with-right"
        : wantsWideTwoColumn
          ? "wide-two"
          : "two";

  const [statusMessage, setStatusMessage] = React.useState<string | null>(null);
  const prompterRef = React.useRef<HTMLDivElement | null>(null);
  const layoutRef = React.useRef<HTMLDivElement | null>(null);
  React.useEffect(() => {
    if (!statusMessage) return;
    const timer = window.setTimeout(() => setStatusMessage(null), 4000);
    return () => window.clearTimeout(timer);
  }, [statusMessage]);

  // Keep a CSS var with the actual rendered prompter height so we can lift
  // the rails upward without letting them affect grid sizing.
  React.useEffect(() => {
    if (typeof window === "undefined") return;
    const layoutEl = layoutRef.current;
    if (!layoutEl) return;
    let frame = 0;
    const update = () => {
      const prompterEl = prompterRef.current;
      const rect = prompterEl ? prompterEl.getBoundingClientRect() : null;
      const height = rect ? Math.max(0, Math.round(rect.height)) : 0;
      layoutEl.style.setProperty("--prompter-height", `${height}px`);
    };
    const onResize = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(() => {
        frame = 0;
        update();
      });
    };
    update();
    window.addEventListener("resize", onResize);
    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      window.removeEventListener("resize", onResize);
    };
  }, [showPrompter]);

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
    if (isCapsuleStoreView) {
      // Reserve a dedicated root for the capsule store checkout/cart rail.
      return <div id="capsule-store-cart-rail-root" />;
    }
    if (shouldShowDiscoveryRail) {
      // Show discovery rail for feed views or when explicitly requested.
      return <DiscoveryRail />;
    }
    if (allowLiveChatRail) {
      return <LiveChatRail {...liveChatRailProps} />;
    }
    return null;
  }, [allowLiveChatRail, isCapsuleStoreView, liveChatRailProps, shouldShowDiscoveryRail]);

  const standardRightRailContent = !usesCapsuleLayout
    ? isHome || showDiscoveryRightRail
      ? <DiscoveryRail />
      : null
    : null;
  const rightRailContent = usesCapsuleLayout ? capsuleRightRailContent : standardRightRailContent;
  const renderRailSlot = React.useCallback(
    (node: React.ReactNode) => (
      <div className={styles.railSlot} data-home-loading={homePending ? "true" : undefined}>
        <div className={styles.railContent} data-hidden={homePending ? "true" : undefined}>
          {node}
        </div>
        {homePending ? (
          <div className={styles.railSkeleton}>
            <RailPlaceholder />
          </div>
        ) : null}
      </div>
    ),
    [homePending],
  );

  return (
    <div className={styles.outer} data-layout={effectiveLayout}>
      <PrimaryHeader activeKey={derivedActive} />
      <MobileHeader />
      <div className={styles.page} data-layout={effectiveLayout}>
        <main className={styles.main}>
          {showPrompter ? (
            <div ref={prompterRef} className={styles.prompterStage}>
              <AiPrompterStage
                onAction={composer.handlePrompterAction}
                onHandoff={composer.handlePrompterHandoff}
                chips={prompterChips ?? []}
                statusMessage={statusMessage}
                surface={derivedActive}
              />
            </div>
          ) : null}

          <div
            className={styles.layout}
            ref={layoutRef}
            data-layout={effectiveLayout}
            data-columns={layoutColumns}
            data-has-right={usesCapsuleLayout ? String(capsuleHasRightRail) : undefined}
            data-has-prompter={showPrompter ? "true" : undefined}
            data-capsule-tab={usesCapsuleLayout ? capsuleTab : undefined}
          >
            <aside className={styles.rail} data-side="left" data-layout={effectiveLayout}>
              {renderRailSlot(<ConnectionsRailIsland />)}
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
                {renderRailSlot(rightRailContent)}
              </aside>
            ) : null}
          </div>
        </main>
      </div>
    </div>
  );
}

export function AppShell(props: AppShellProps) {
  return (
    <ComposerProvider>
      <FriendsDataProvider>
        <ChatProvider>
          <AppShellContent {...props} />
          <AiComposerRoot />
        </ChatProvider>
      </FriendsDataProvider>
    </ComposerProvider>
  );
}













