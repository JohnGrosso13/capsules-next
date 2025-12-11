"use client";

import * as React from "react";

import type { ComposerSidebarSnapshot } from "@/lib/composer/sidebar-store";
import { useSidebarStore } from "@/components/composer/state/useSidebarStore";
import { useRemoteConversations } from "@/components/composer/state/useRemoteConversations";
import { useRemoteDrafts } from "@/components/composer/state/useRemoteDrafts";

type SidebarContextValue = {
  sidebarStore: ComposerSidebarSnapshot;
  updateSidebarStore: (
    updater: (prev: ComposerSidebarSnapshot) => ComposerSidebarSnapshot,
  ) => void;
};

const SidebarContext = React.createContext<SidebarContextValue | null>(null);

type ComposerSidebarProviderProps = {
  userId: string | null;
  children: React.ReactNode;
};

export function ComposerSidebarProvider({
  userId,
  children,
}: ComposerSidebarProviderProps) {
  const { sidebarStore, updateSidebarStore } = useSidebarStore(userId);
  useRemoteConversations(userId, updateSidebarStore);
  useRemoteDrafts(userId, updateSidebarStore);

  const value = React.useMemo(
    () => ({ sidebarStore, updateSidebarStore }),
    [sidebarStore, updateSidebarStore],
  );

  return <SidebarContext.Provider value={value}>{children}</SidebarContext.Provider>;
}

export function useComposerSidebarStore(): SidebarContextValue {
  const context = React.useContext(SidebarContext);
  if (!context) {
    throw new Error("useComposerSidebarStore must be used within ComposerSidebarProvider");
  }
  return context;
}
