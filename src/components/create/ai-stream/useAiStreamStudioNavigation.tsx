"use client";

import * as React from "react";
import type { ReadonlyURLSearchParams } from "next/navigation";

import type { CapsuleSummary } from "@/server/capsules/service";
import type { StudioTab } from "./types";
import { useAiStreamStudioStore } from "./useAiStreamStudioStore";

type NavigationRouter = {
  replace: (href: string, options?: { scroll?: boolean }) => void;
};

type UseAiStreamStudioNavigationOptions = {
  capsules: CapsuleSummary[];
  initialTab: StudioTab;
  pathname: string | null;
  searchParams: ReadonlyURLSearchParams | null;
  searchParamsString: string;
  router: NavigationRouter | null;
};

type UseAiStreamStudioNavigationResult = {
  activeTab: StudioTab;
  handleTabChange: (nextValue: string) => void;
  handleCapsuleChange: (capsule: CapsuleSummary | null) => void;
  selectedCapsule: CapsuleSummary | null;
  selectorOpen: boolean;
};

function normalizeTab(value: string | null | undefined, fallback: StudioTab): StudioTab {
  if (!value) return fallback;
  const maybe = value.toLowerCase() as StudioTab;
  if (maybe === "studio" || maybe === "producer" || maybe === "encoder" || maybe === "clips") {
    return maybe;
  }
  return fallback;
}

export function useAiStreamStudioNavigation(
  options: UseAiStreamStudioNavigationOptions,
): UseAiStreamStudioNavigationResult {
  const { capsules, initialTab, pathname, searchParams, searchParamsString, router } = options;
  const {
    state: { selectedCapsuleId },
    actions: { setSelectedCapsuleId },
  } = useAiStreamStudioStore();

  const [activeTab, setActiveTab] = React.useState<StudioTab>(initialTab);
  const [selectorOpen, setSelectorOpen] = React.useState(true);

  const queryView = React.useMemo(() => {
    const param = searchParams?.get("view") ?? null;
    return normalizeTab(param, initialTab);
  }, [initialTab, searchParams]);

  const queryCapsuleId = React.useMemo(() => {
    const param = searchParams?.get("capsuleId") ?? null;
    if (!param) return null;
    return capsules.some((capsule) => capsule.id === param) ? param : null;
  }, [capsules, searchParams]);

  const hasSwitchParam = React.useMemo(() => searchParams?.has("switch") ?? false, [searchParams]);

  const selectedCapsule = React.useMemo(() => {
    if (!selectedCapsuleId) return null;
    return capsules.find((capsule) => capsule.id === selectedCapsuleId) ?? null;
  }, [capsules, selectedCapsuleId]);

  React.useEffect(() => {
    setActiveTab(queryView);
  }, [queryView]);

  React.useEffect(() => {
    if (queryCapsuleId === null) {
      setSelectedCapsuleId(null);
      setSelectorOpen(true);
      return;
    }
    setSelectedCapsuleId(queryCapsuleId);
    setSelectorOpen(false);
  }, [queryCapsuleId, setSelectedCapsuleId]);

  React.useEffect(() => {
    if (!hasSwitchParam) return;
    setSelectedCapsuleId(null);
    setSelectorOpen(true);
  }, [hasSwitchParam, setSelectedCapsuleId]);

  const updateUrl = React.useCallback(
    (nextTab: StudioTab) => {
      if (!router || !pathname) return;
      const params = new URLSearchParams(searchParamsString);
      if (nextTab === "studio") {
        params.delete("view");
      } else {
        params.set("view", nextTab);
      }

      params.delete("switch");

      const nextSearch = params.toString();
      if (nextSearch === searchParamsString) return;
      const nextHref = nextSearch.length ? `${pathname}?${nextSearch}` : pathname;
      router.replace(nextHref, { scroll: false });
    },
    [pathname, router, searchParamsString],
  );

  const syncSelectorSearchParams = React.useCallback(
    (capsuleId: string | null, reopenSelector: boolean) => {
      if (!router || !pathname) return;
      const params = new URLSearchParams(searchParamsString);
      if (capsuleId) {
        params.set("capsuleId", capsuleId);
        params.delete("switch");
      } else {
        params.delete("capsuleId");
        if (reopenSelector) {
          params.set("switch", "1");
        } else {
          params.delete("switch");
        }
      }
      const nextSearch = params.toString();
      if (nextSearch === searchParamsString) return;
      const nextHref = nextSearch.length ? `${pathname}?${nextSearch}` : pathname;
      router.replace(nextHref, { scroll: false });
    },
    [pathname, router, searchParamsString],
  );

  const handleCapsuleChange = React.useCallback(
    (capsule: CapsuleSummary | null) => {
      const capsuleId = capsule?.id ?? null;
      setSelectedCapsuleId(capsuleId);
      const shouldReopenSelector = !capsuleId;
      setSelectorOpen(shouldReopenSelector);
      syncSelectorSearchParams(capsuleId, shouldReopenSelector);
    },
    [setSelectedCapsuleId, syncSelectorSearchParams],
  );

  React.useEffect(() => {
    if (typeof window === "undefined") return;
    const handleCapsuleSwitch = () => {
      setSelectedCapsuleId(null);
      setSelectorOpen(true);
      syncSelectorSearchParams(null, true);
    };
    window.addEventListener("capsule:switch", handleCapsuleSwitch);
    return () => {
      window.removeEventListener("capsule:switch", handleCapsuleSwitch);
    };
  }, [setSelectedCapsuleId, syncSelectorSearchParams]);

  const handleTabChange = React.useCallback(
    (nextValue: string) => {
      const normalized = normalizeTab(nextValue, activeTab);
      if (normalized === activeTab) return;
      setActiveTab(normalized);
      updateUrl(normalized);
    },
    [activeTab, updateUrl],
  );

  return {
    activeTab,
    handleTabChange,
    handleCapsuleChange,
    selectedCapsule,
    selectorOpen,
  };
}
