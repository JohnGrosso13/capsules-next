"use client";

import * as React from "react";

export type HomeLoadingSection = "feed" | "promos" | "left-rail" | "right-rail";

export const HOME_LOADING_SECTIONS: readonly HomeLoadingSection[] = [
  "feed",
  "promos",
  "left-rail",
  "right-rail",
] as const;

type HomeLoadingState = {
  pending: HomeLoadingSection[];
  isReady: boolean;
  isPending: boolean;
  markReady: (section: HomeLoadingSection) => void;
  markPending: (section: HomeLoadingSection) => void;
};

const HomeLoadingContext = React.createContext<HomeLoadingState | null>(null);

export function HomeLoadingProvider({
  children,
  sections = HOME_LOADING_SECTIONS,
}: {
  children: React.ReactNode;
  sections?: ReadonlyArray<HomeLoadingSection>;
}) {
  const [pendingSet, setPendingSet] = React.useState<Set<HomeLoadingSection>>(
    () => new Set(sections),
  );

  const markReady = React.useCallback((section: HomeLoadingSection) => {
    setPendingSet((prev) => {
      if (!prev.has(section)) return prev;
      const next = new Set(prev);
      next.delete(section);
      return next;
    });
  }, []);

  const markPending = React.useCallback((section: HomeLoadingSection) => {
    setPendingSet((prev) => {
      if (prev.has(section)) return prev;
      const next = new Set(prev);
      next.add(section);
      return next;
    });
  }, []);

  const pending = React.useMemo(() => Array.from(pendingSet), [pendingSet]);

  const value = React.useMemo<HomeLoadingState>(
    () => ({
      pending,
      isReady: pending.length === 0,
      isPending: pending.length > 0,
      markReady,
      markPending,
    }),
    [markPending, markReady, pending],
  );

  return <HomeLoadingContext.Provider value={value}>{children}</HomeLoadingContext.Provider>;
}

export function useHomeLoading(): HomeLoadingState | null {
  return React.useContext(HomeLoadingContext);
}
