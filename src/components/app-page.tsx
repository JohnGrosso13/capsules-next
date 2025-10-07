"use client";

import * as React from "react";

import { AppShell } from "@/components/app-shell";
import type { LiveChatRailProps } from "@/components/live/LiveChatRail";

export type AppPageProps = {
  children: React.ReactNode;
  activeNav?: "home" | "create" | "capsule" | "memory";
  showPrompter?: boolean;
  promoSlot?: React.ReactNode;
  capsuleBanner?: React.ReactNode;
  showLiveChatRightRail?: boolean;
  liveChatRailProps?: LiveChatRailProps;
};

export function AppPage({
  children,
  activeNav,
  showPrompter = true,
  promoSlot,
  capsuleBanner,
  showLiveChatRightRail,
  liveChatRailProps,
}: AppPageProps) {
  return (
    <AppShell
      showPrompter={showPrompter}
      promoSlot={promoSlot}
      capsuleBanner={capsuleBanner}
      showLiveChatRightRail={showLiveChatRightRail}
      liveChatRailProps={liveChatRailProps}
      {...(activeNav ? { activeNav } : {})}
    >
      {children}
    </AppShell>
  );
}
