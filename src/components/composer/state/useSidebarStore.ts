"use client";

import * as React from "react";

import {
  buildSidebarStorageKey,
  EMPTY_SIDEBAR_SNAPSHOT,
  loadSidebarSnapshot,
  saveSidebarSnapshot,
  type ComposerSidebarSnapshot,
} from "@/lib/composer/sidebar-store";

export function useSidebarStore(userId: string | null) {
  const [sidebarStore, setSidebarStore] = React.useState<ComposerSidebarSnapshot>(
    EMPTY_SIDEBAR_SNAPSHOT,
  );

  const sidebarStorageKey = React.useMemo(
    () => buildSidebarStorageKey(userId ?? null),
    [userId],
  );

  React.useEffect(() => {
    if (typeof window === "undefined") return;
    setSidebarStore(loadSidebarSnapshot(sidebarStorageKey));
  }, [sidebarStorageKey]);

  const updateSidebarStore = React.useCallback(
    (updater: (prev: ComposerSidebarSnapshot) => ComposerSidebarSnapshot) => {
      setSidebarStore((prev) => {
        const next = updater(prev);
        if (typeof window !== "undefined") {
          saveSidebarSnapshot(sidebarStorageKey, next);
        }
        return next;
      });
    },
    [sidebarStorageKey],
  );

  return { sidebarStore, updateSidebarStore };
}
