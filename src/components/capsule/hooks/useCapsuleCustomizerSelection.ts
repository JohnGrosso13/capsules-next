"use client";

import * as React from "react";

import type { SelectedBanner } from "./capsuleCustomizerTypes";

type SetSelectedBanner = React.Dispatch<React.SetStateAction<SelectedBanner | null>>;

export function useCapsuleCustomizerSelection(initialBanner: SelectedBanner | null = null) {
  const [selectedBanner, setSelectedBannerState] = React.useState<SelectedBanner | null>(
    initialBanner,
  );
  const selectedBannerRef = React.useRef<SelectedBanner | null>(initialBanner);

  const setSelectedBanner = React.useCallback<SetSelectedBanner>((next) => {
    setSelectedBannerState((previous) => {
      const resolved = typeof next === "function" ? (next as (prev: SelectedBanner | null) => SelectedBanner | null)(previous) : next;
      selectedBannerRef.current = resolved ?? null;
      return resolved ?? null;
    });
  }, []);

  React.useEffect(() => {
    selectedBannerRef.current = selectedBanner;
  }, [selectedBanner]);

  return {
    selectedBanner,
    setSelectedBanner,
    selectedBannerRef,
  } as const;
}
