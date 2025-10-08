"use client";

import * as React from "react";

import { AppShell } from "@/components/app-shell";
import type { LiveChatRailProps } from "@/components/live/LiveChatRail";

export type AppPageProps = {
  children: React.ReactNode;
  activeNav?: "home" | "explore" | "create" | "capsule" | "market" | "memory";
  showPrompter?: boolean;
  promoSlot?: React.ReactNode;
  capsuleBanner?: React.ReactNode;
  showLiveChatRightRail?: boolean;
  liveChatRailProps?: LiveChatRailProps;
  showDiscoveryRightRail?: boolean;
};

export function AppPage({
  children,
  activeNav,
  showPrompter = true,
  promoSlot,
  capsuleBanner,
  showLiveChatRightRail,
  liveChatRailProps,
  showDiscoveryRightRail,
}: AppPageProps) {
  return (
    <AppShell
      showPrompter={showPrompter}
      promoSlot={promoSlot}
      capsuleBanner={capsuleBanner}
      showLiveChatRightRail={showLiveChatRightRail}
      liveChatRailProps={liveChatRailProps}
      showDiscoveryRightRail={showDiscoveryRightRail}
      {...(activeNav ? { activeNav } : {})}
    >
      {children}
    </AppShell>
  );
}
