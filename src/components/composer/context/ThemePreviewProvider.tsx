"use client";

import * as React from "react";

import { applyThemeVars, endPreviewThemeVars, startPreviewThemeVars } from "@/lib/theme";
import type { ThemeVariants } from "@/lib/theme/variants";

export type ThemePreviewState = {
  summary: string;
  details?: string | null;
  source: "heuristic" | "ai";
  variants: ThemeVariants;
};

type ComposerThemeContextValue = {
  themePreview: ThemePreviewState | null;
  previewTheme(plan: ThemePreviewState): void;
  applyThemePreview(): void;
  cancelThemePreview(): void;
  resetThemePreview(): void;
};

const ComposerThemeContext = React.createContext<ComposerThemeContextValue | null>(null);

export function ComposerThemeProvider({ children }: { children: React.ReactNode }) {
  const [themePreview, setThemePreview] = React.useState<ThemePreviewState | null>(null);

  const previewTheme = React.useCallback((plan: ThemePreviewState) => {
    endPreviewThemeVars();
    startPreviewThemeVars(plan.variants);
    setThemePreview({
      summary: plan.summary,
      details: plan.details ?? null,
      source: plan.source,
      variants: plan.variants,
    });
  }, []);

  const applyThemePreview = React.useCallback(() => {
    setThemePreview((current) => {
      if (!current) return current;
      applyThemeVars(current.variants);
      endPreviewThemeVars();
      return null;
    });
  }, []);

  const cancelThemePreview = React.useCallback(() => {
    endPreviewThemeVars();
    setThemePreview(null);
  }, []);

  const resetThemePreview = React.useCallback(() => {
    endPreviewThemeVars();
    setThemePreview(null);
  }, []);

  const value = React.useMemo<ComposerThemeContextValue>(
    () => ({
      themePreview,
      previewTheme,
      applyThemePreview,
      cancelThemePreview,
      resetThemePreview,
    }),
    [themePreview, previewTheme, applyThemePreview, cancelThemePreview, resetThemePreview],
  );

  return <ComposerThemeContext.Provider value={value}>{children}</ComposerThemeContext.Provider>;
}

export function useComposerTheme(): ComposerThemeContextValue {
  const ctx = React.useContext(ComposerThemeContext);
  if (!ctx) {
    throw new Error("useComposerTheme must be used within ComposerThemeProvider");
  }
  return ctx;
}
