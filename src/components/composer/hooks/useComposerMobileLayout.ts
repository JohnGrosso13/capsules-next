"use client";

import * as React from "react";

type MobileLayoutOptions = {
  actions: {
    setPreviewOpen: (open: boolean) => void;
  };
  mobileRailOpen: boolean;
  previewOpen: boolean;
  closeMobileRail: () => void;
};

export function useComposerMobileLayout({
  actions,
  mobileRailOpen,
  previewOpen,
  closeMobileRail,
}: MobileLayoutOptions) {
  const [isMobileLayout, setIsMobileLayout] = React.useState(false);
  const mobileMenuCloseRef = React.useRef<HTMLButtonElement | null>(null);
  const mobilePreviewCloseRef = React.useRef<HTMLButtonElement | null>(null);

  React.useEffect(() => {
    if (!mobileRailOpen || !isMobileLayout) return;
    const closeButton = mobileMenuCloseRef.current;
    const previouslyFocused =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    closeButton?.focus();
    return () => {
      previouslyFocused?.focus?.();
    };
  }, [isMobileLayout, mobileRailOpen]);

  React.useEffect(() => {
    if (!mobileRailOpen) return undefined;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeMobileRail();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [closeMobileRail, mobileRailOpen]);

  React.useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const media = window.matchMedia("(max-width: 900px)");
    const apply = (matches: boolean) => {
      setIsMobileLayout(matches);
      actions.setPreviewOpen(matches ? false : true);
    };
    apply(media.matches);
    const handleChange = (event: MediaQueryListEvent) => apply(event.matches);
    if (typeof media.addEventListener === "function") {
      media.addEventListener("change", handleChange);
      return () => media.removeEventListener("change", handleChange);
    }
    media.addListener(handleChange);
    return () => media.removeListener(handleChange);
  }, [actions]);

  React.useEffect(() => {
    if (!isMobileLayout || !previewOpen) return;
    const closeButton = mobilePreviewCloseRef.current;
    const previouslyFocused =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    closeButton?.focus();
    return () => {
      previouslyFocused?.focus?.();
    };
  }, [isMobileLayout, previewOpen]);

  return {
    isMobileLayout,
    setIsMobileLayout,
    mobileMenuCloseRef,
    mobilePreviewCloseRef,
  };
}
