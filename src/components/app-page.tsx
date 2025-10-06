"use client";

import * as React from "react";

import { AppShell } from "@/components/app-shell";

export type AppPageProps = {
  children: React.ReactNode;
  activeNav?: "home" | "create" | "capsule" | "memory";
  showPrompter?: boolean;
  promoSlot?: React.ReactNode;
  capsuleBanner?: React.ReactNode;
};

export function AppPage({ children, activeNav, showPrompter = true, promoSlot, capsuleBanner }: AppPageProps) {
  return (
    <AppShell
      showPrompter={showPrompter}
      promoSlot={promoSlot}
      capsuleBanner={capsuleBanner}
      {...(activeNav ? { activeNav } : {})}
    >
      {children}
    </AppShell>
  );
}
