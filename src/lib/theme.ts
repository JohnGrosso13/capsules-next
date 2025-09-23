"use client";

export type Theme = "light" | "dark";

export function getTheme(): Theme {
  try {
    const saved = localStorage.getItem("theme");
    if (saved === "light" || saved === "dark") return saved;
  } catch {}
  return (typeof window !== "undefined" && window.matchMedia && window.matchMedia("(prefers-color-scheme: light)").matches) ? "light" : "dark";
}

export function setTheme(theme: Theme) {
  try {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem("theme", theme);
  } catch {}
}

/** Apply a set of CSS custom properties and persist them for future visits. */
export function applyThemeVars(vars: Record<string, string>) {
  try {
    const root = document.documentElement;
    Object.entries(vars).forEach(([k, v]) => root.style.setProperty(k, v));
    const existing = JSON.parse(localStorage.getItem("themeVars") || "{}");
    const merged = { ...existing, ...vars };
    localStorage.setItem("themeVars", JSON.stringify(merged));
  } catch {}
}

