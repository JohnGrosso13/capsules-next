"use client";

import * as React from "react";

import { AppShell } from "@/components/app-shell";

export type AppPageProps = {
  children: React.ReactNode;
  activeNav?: "home" | "create" | "capsule" | "memory";
  showPrompter?: boolean;
  promoSlot?: React.ReactNode;
};

export function AppPage({ children, activeNav, showPrompter = true, promoSlot }: AppPageProps) {
  return (
    <AppShell activeNav={activeNav} showPrompter={showPrompter} promoSlot={promoSlot}>
      {children}
    </AppShell>
  );
}
