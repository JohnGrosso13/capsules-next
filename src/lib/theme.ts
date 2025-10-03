"use client";

import { normalizeThemeVars } from "./theme/shared";

export type Theme = "light" | "dark";

function readStoredThemeVars(): Record<string, string> {
  try {
    const raw = localStorage.getItem("themeVars");
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return normalizeThemeVars(parsed);
  } catch {
    return {};
  }
}

export function getTheme(): Theme {
  try {
    const saved = localStorage.getItem("theme");
    if (saved === "light" || saved === "dark") return saved;
  } catch {}
  return typeof window !== "undefined" &&
    window.matchMedia &&
    window.matchMedia("(prefers-color-scheme: light)").matches
    ? "light"
    : "dark";
}

export function setTheme(theme: Theme) {
  try {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem("theme", theme);
  } catch {}
}

export function getStoredThemeVars(): Record<string, string> {
  return { ...readStoredThemeVars() };
}

/** Apply a set of CSS custom properties and persist them for future visits. */
export function applyThemeVars(vars: Record<string, string>) {
  try {
    const sanitized = normalizeThemeVars(vars);
    if (!Object.keys(sanitized).length) return;
    const root = document.documentElement;
    Object.entries(sanitized).forEach(([key, value]) => root.style.setProperty(key, value));
    const stored = { ...readStoredThemeVars(), ...sanitized };
    if (Object.keys(stored).length) {
      localStorage.setItem("themeVars", JSON.stringify(stored));
    } else {
      localStorage.removeItem("themeVars");
    }
  } catch {}
}

/** Remove previously applied CSS custom properties. */
export function clearThemeVars(keys?: string[]) {
  try {
    const root = document.documentElement;
    if (Array.isArray(keys) && keys.length) {
      const stored = readStoredThemeVars();
      keys.forEach((rawKey) => {
        if (typeof rawKey !== "string") return;
        const key = rawKey.trim();
        if (!key.startsWith("--")) return;
        root.style.removeProperty(key);
        delete stored[key];
      });
      if (Object.keys(stored).length) {
        localStorage.setItem("themeVars", JSON.stringify(stored));
      } else {
        localStorage.removeItem("themeVars");
      }
      return;
    }
    const stored = readStoredThemeVars();
    Object.keys(stored).forEach((key) => root.style.removeProperty(key));
    localStorage.removeItem("themeVars");
  } catch {}
}

// -- Preview support -------------------------------------------------------

type PreviewState = {
  applied: Record<string, string>;
  previous: Record<string, string | null>;
};

let currentPreview: PreviewState | null = null;

/**
 * Temporarily apply theme variables to the document root without persisting them.
 * Call endPreviewThemeVars() to restore previous inline values.
 */
export function startPreviewThemeVars(vars: Record<string, string>) {
  try {
    const sanitized = normalizeThemeVars(vars);
    if (!Object.keys(sanitized).length) return;
    // If a preview is already active, end it before starting a new one
    if (currentPreview) endPreviewThemeVars();

    const root = document.documentElement;
    const previous: Record<string, string | null> = {};

    Object.entries(sanitized).forEach(([key, value]) => {
      try {
        previous[key] = root.style.getPropertyValue(key) || null;
        root.style.setProperty(key, value);
      } catch {}
    });

    (root.dataset as Record<string, string>).previewTheme = "1";
    currentPreview = { applied: sanitized, previous };
  } catch {}
}

/** Restore the inline CSS variables present before the preview began. */
export function endPreviewThemeVars() {
  try {
    if (!currentPreview) return;
    const { applied, previous } = currentPreview;
    const root = document.documentElement;

    Object.keys(applied).forEach((key) => {
      try {
        const prior = previous[key];
        if (prior && prior.length) {
          root.style.setProperty(key, prior);
        } else {
          root.style.removeProperty(key);
        }
      } catch {}
    });

    delete (root.dataset as Record<string, string | undefined>).previewTheme;
  } finally {
    currentPreview = null;
  }
}

/** Whether a theme preview is currently active. */
export function isPreviewingTheme(): boolean {
  return currentPreview !== null;
}
