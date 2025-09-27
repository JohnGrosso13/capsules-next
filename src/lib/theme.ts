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
