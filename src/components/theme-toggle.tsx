"use client";

import * as React from "react";
import { Sun, Moon } from "@phosphor-icons/react/dist/ssr";

import { getTheme, setTheme as persistTheme, type Theme } from "@/lib/theme";

export function ThemeToggle() {
  const [theme, setTheme] = React.useState<Theme>(() => {
    if (typeof window === "undefined") return "dark";
    return getTheme();
  });

  React.useEffect(() => {
    persistTheme(theme);
  }, [theme]);

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div
        role="group"
        aria-label="Theme"
        style={{ display: "inline-flex", gap: 10, alignItems: "center" }}
      >
        <button
          type="button"
          onClick={() => setTheme("light")}
          aria-pressed={theme === "light"}
          style={segStyle(theme === "light")}
        >
          <Sun size={18} weight={theme === "light" ? "fill" : "regular"} />
          <span>Light</span>
        </button>
        <button
          type="button"
          onClick={() => setTheme("dark")}
          aria-pressed={theme === "dark"}
          style={segStyle(theme === "dark")}
        >
          <Moon size={18} weight={theme === "dark" ? "fill" : "regular"} />
          <span>Dark</span>
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
    padding: "10px 16px",
    borderRadius: 999,
    border: active
      ? "1px solid transparent"
      : "1px solid var(--pill-border, rgba(255,255,255,0.18))",
    color: active ? "var(--text-on-brand, #0e1024)" : "var(--text, rgba(255,255,255,0.94))",
    fontWeight: 800,
    letterSpacing: ".01em",
    background: active
      ? "var(--gradient-brand, var(--cta-gradient))"
      : "linear-gradient(180deg, var(--pill-bg-1, rgba(255,255,255,0.1)), var(--pill-bg-2, rgba(255,255,255,0.05)))",
    boxShadow: active
      ? "0 0 18px var(--cta-glow, rgba(99,102,241,.34)), 0 8px 18px rgba(5,10,30,.4), inset 0 1px 0 rgba(255,255,255,.5)"
      : "inset 0 1px 0 rgba(255,255,255,0.12), inset 0 -1px 0 rgba(2,6,23,0.55), 0 8px 18px rgba(5,10,30,0.35)",
    textShadow: active ? "0 1px 1px rgba(21,25,55,0.5)" : undefined,
    transition: "transform .16s ease, box-shadow .16s ease, border-color .16s ease",
    cursor: "pointer",
  };
}
