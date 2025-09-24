"use client";

import * as React from "react";

type Theme = "light" | "dark";

function getPreferredTheme(): Theme {
  try {
    const saved = localStorage.getItem("theme");
    if (saved === "light" || saved === "dark") return saved;
    if (typeof window !== "undefined") {
      return window.matchMedia && window.matchMedia("(prefers-color-scheme: light)").matches
        ? "light"
        : "dark";
    }
  } catch {}
  return "dark";
}

function applyTheme(t: Theme) {
  try {
    document.documentElement.dataset.theme = t;
    localStorage.setItem("theme", t);
  } catch {}
}

export function ThemeToggle() {
  const [theme, setTheme] = React.useState<Theme>(() => {
    if (typeof window === "undefined") return "dark";
    return getPreferredTheme();
  });

  React.useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div role="group" aria-label="Theme" style={{ display: "flex", gap: 10 }}>
        <button
          type="button"
          onClick={() => setTheme("light")}
          aria-pressed={theme === "light"}
          style={segStyle(theme === "light")}
        >
          ☀️ Light
        </button>
        <button
          type="button"
          onClick={() => setTheme("dark")}
          aria-pressed={theme === "dark"}
          style={segStyle(theme === "dark")}
        >
          🌙 Dark
        </button>
      </div>
      <p style={{ margin: 0, color: "var(--text-2, rgba(255,255,255,0.72))" }}>
        Saves to this device and applies across the site.
      </p>
    </div>
  );
}

function segStyle(active: boolean): React.CSSProperties {
  return {
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    padding: "9px 14px",
    borderRadius: 999,
    border: active ? "1px solid transparent" : "1px solid var(--pill-border, rgba(255,255,255,0.18))",
    color: active ? "var(--text-on-brand, #0e1024)" : "var(--text, rgba(255,255,255,0.92))",
    fontWeight: 800,
    letterSpacing: ".01em",
    background: active
      ? "linear-gradient(120deg, var(--brand-from,#8b5cf6), var(--brand-mid,#6366f1), var(--brand-to,#22d3ee))"
      : "linear-gradient(180deg, var(--pill-bg-1, rgba(255,255,255,0.08)), var(--pill-bg-2, rgba(255,255,255,0.04)))",
    boxShadow: active
      ? "0 0 18px var(--cta-glow, rgba(99,102,241,.34)), 0 8px 16px rgba(2,6,23,.36), inset 0 1px 0 rgba(255,255,255,.45)"
      : "inset 0 1px 0 rgba(255,255,255,0.12), inset 0 -1px 0 rgba(2,6,23,0.55), 0 10px 22px rgba(5,10,30,0.35)",
    cursor: "pointer",
  };
}

