"use client";

import * as React from "react";

import styles from "./theme-style-carousel.module.css";
import promo from "./promo-row.module.css";
import { Button, ButtonLink } from "@/components/ui/button";
import { ArrowLeft, ArrowRight, Trash } from "@phosphor-icons/react/dist/ssr";
import { cn } from "@/lib/cn";

import {
  applyThemeVars,
  startPreviewThemeVars,
  endPreviewThemeVars,
  getStoredThemeVars,
  setTheme,
  getTheme,
  clearThemeVars,
} from "@/lib/theme";
import { buildThemeVarsFromSeed } from "@/lib/theme/styler-heuristics";
import { buildMemoryEnvelope } from "@/lib/memory/envelope";
import { useCurrentUser } from "@/services/auth/client";
import { buildThemePreview, summarizeGroupLabels } from "@/lib/theme/token-groups";

type Preset = {
  id: string;
  title: string;
  desc?: string;
  vars: Record<string, string>;
  theme?: "light" | "dark";
};

type SavedStyle = {
  id: string;
  title: string;
  summary?: string;
  description?: string;
  vars: Record<string, string>;
  createdLabel?: string | null;
  details?: string | null;
};

type ThemeEntry = { kind: "preset"; preset: Preset } | { kind: "saved"; saved: SavedStyle };
const TITLE_FALLBACK = "Saved theme";

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function coerceString(value: unknown, limit?: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (typeof limit === "number" && trimmed.length > limit) {
    return trimmed.slice(0, limit);
  }
  return trimmed;
}

function extractVars(input: unknown): Record<string, string> {
  if (!isPlainObject(input)) return {};
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(input)) {
    if (typeof key !== "string") continue;
    if (typeof value !== "string") continue;
    out[key] = value;
  }
  return out;
}

function createThemePresetVars(
  seedHex: string,
  options: { accentHex?: string; accentGlow?: number; label?: string; overrides?: Record<string, string> } = {},
): Record<string, string> {
  const base = buildThemeVarsFromSeed(seedHex, {
    ...(options.accentHex ? { accentHex: options.accentHex } : {}),
    ...(options.accentGlow !== undefined ? { accentGlow: options.accentGlow } : {}),
    ...(options.label ? { label: options.label } : {}),
  });
  return Object.assign({}, base, options.overrides ?? {});
}

function mapThemeRecord(raw: unknown): SavedStyle | null {
  if (!isPlainObject(raw)) return null;
  const id = coerceString(raw.id);
  if (!id) return null;

  const meta = isPlainObject(raw.meta) ? raw.meta : undefined;
  let vars = extractVars(raw.vars);
  if (!Object.keys(vars).length && meta) {
    vars = extractVars(meta.vars);
  }
  if (!Object.keys(vars).length) return null;

  const title =
    coerceString(raw.title) ??
    coerceString(meta?.["title"]) ??
    coerceString(raw.summary) ??
    coerceString(meta?.["summary"]) ??
    coerceString(raw.description) ??
    coerceString(meta?.["description"]) ??
    coerceString(raw.prompt) ??
    coerceString(meta?.["prompt"]) ??
    TITLE_FALLBACK;

  const summary =
    coerceString(raw.summary) ??
    coerceString(meta?.["summary"]) ??
    null;

  const prompt =
    coerceString(raw.prompt) ??
    coerceString(meta?.["prompt"]) ??
    null;

  const description =
    coerceString(raw.description) ??
    coerceString(meta?.["description"]) ??
    summary ??
    prompt ??
    title;

  const details =
    coerceString(raw.details) ??
    coerceString(meta?.["details"]) ??
    null;

  const createdLabel =
    coerceString(raw.created_at) ??
    coerceString(raw.createdAt) ??
    coerceString(meta?.["created_at"]) ??
    null;

  return {
    id,
    title,
    summary: summary ?? description ?? title,
    description: description ?? title,
    details: details ?? prompt ?? null,
    vars,
    createdLabel: createdLabel ?? null,
  };
}


const SUMMER_THEME_OVERRIDES: Record<string, string> = {
  "--app-bg": "radial-gradient(1200px 720px at 0% -10%, rgba(255, 196, 140, 0.35), transparent 65%), radial-gradient(980px 640px at 100% 0%, rgba(14, 181, 200, 0.24), transparent 68%), linear-gradient(120deg, rgba(254, 238, 217, 0.98) 0%, rgba(255, 226, 194, 0.96) 45%, #fff3dc 100%)",
  "--surface-app": "var(--app-bg)",
  "--surface-muted": "rgba(255, 243, 224, 0.94)",
  "--surface-elevated": "rgba(255, 236, 209, 0.96)",
  "--surface-overlay": "rgba(255, 198, 150, 0.32)",
  "--color-fg": "rgba(36, 24, 16, 0.95)",
  "--color-fg-muted": "rgba(62, 43, 30, 0.76)",
  "--color-fg-subtle": "rgba(97, 71, 52, 0.6)",
  "--color-border": "rgba(242, 173, 110, 0.42)",
  "--color-border-strong": "rgba(226, 138, 67, 0.46)",
  "--color-brand": "#f97316",
  "--color-brand-strong": "#c2410c",
  "--color-brand-foreground": "#fff7f0",
  "--color-brand-muted": "rgba(249, 115, 22, 0.28)",
  "--gradient-brand": "linear-gradient(120deg,#f97316 0%,#facc15 55%,#0ea5e9 100%)",
  "--cta-gradient": "linear-gradient(120deg,#fb923c 0%,#f97316 52%,#facc15 100%)",
  "--cta-button-text": "#fff7f0",
  "--color-accent": "#0ea5e9",
  "--color-info": "#0ea5e9",
  "--color-success": "#16a34a",
  "--color-warning": "#facc15",
  "--color-danger": "#ef4444",
  "--accent-glow": "rgba(248, 155, 85, 0.32)",
  "--pill-bg-1": "rgba(255, 238, 212, 0.9)",
  "--pill-bg-2": "rgba(255, 226, 190, 0.86)",
  "--pill-border": "rgba(242, 180, 120, 0.54)",
  "--rail-bg-1": "rgba(255, 238, 212, 0.92)",
  "--rail-bg-2": "rgba(255, 226, 194, 0.88)",
  "--rail-border": "rgba(242, 180, 120, 0.4)",
  "--card-bg-1": "rgba(255, 241, 220, 0.95)",
  "--card-bg-2": "rgba(255, 227, 196, 0.92)",
  "--card-border": "rgba(240, 176, 116, 0.48)",
  "--card-shadow": "0 24px 48px rgba(225, 146, 74, 0.28)",
  "--card-hover-bg-1": "rgba(255, 237, 208, 0.96)",
  "--card-hover-bg-2": "rgba(255, 223, 188, 0.94)",
  "--card-hover-border": "rgba(226, 148, 82, 0.54)",
  "--card-hover-shadow": "0 28px 60px rgba(215, 130, 60, 0.32)",
  "--header-glass-top": "rgba(255, 247, 232, 0.88)",
  "--header-glass-bottom": "rgba(255, 228, 191, 0.82)",
  "--header-tint-from": "rgba(255, 195, 132, 0.3)",
  "--header-tint-to": "rgba(233, 161, 107, 0.28)",
  "--header-border-color": "rgba(233, 161, 107, 0.34)",
  "--header-shadow": "0 20px 45px rgba(212, 126, 66, 0.28)",
  "--header-scrim": "rgba(20, 15, 8, 0.82)",
  "--dock-bg-1": "rgba(255, 238, 212, 0.95)",
  "--dock-bg-2": "rgba(255, 226, 194, 0.92)",
  "--dock-border": "rgba(240, 176, 116, 0.42)",
  "--dock-shadow": "0 -1px 0 rgba(222, 166, 112, 0.2), 0 20px 48px rgba(210, 130, 64, 0.28)",
  "--dock-btn-bg-1": "rgba(255, 217, 180, 0.86)",
  "--dock-btn-bg-2": "rgba(255, 205, 160, 0.82)",
  "--dock-btn-border": "rgba(234, 152, 80, 0.48)",
  "--dock-btn-hover-border": "rgba(218, 128, 56, 0.6)",
  "--dock-active-shadow": "0 18px 36px rgba(215, 122, 58, 0.4)",
  "--dock-active-glow": "rgba(249, 169, 92, 0.32)",
  "--dock-text-muted": "rgba(76, 52, 34, 0.72)",
  "--dock-sheet-bg-1": "rgba(255, 237, 208, 0.95)",
  "--dock-sheet-bg-2": "rgba(255, 226, 194, 0.92)",
  "--dock-sheet-border": "rgba(236, 167, 100, 0.42)",
  "--dock-sheet-shadow": "0 24px 52px rgba(215, 130, 60, 0.32)",
};

const SUMMER_THEME_VARS: Record<string, string> = createThemePresetVars("#f97316", {
  accentHex: "#0ea5e9",
  accentGlow: 0.3,
  overrides: SUMMER_THEME_OVERRIDES,
});

const FALL_THEME_OVERRIDES: Record<string, string> = {
  "--app-bg": "radial-gradient(1200px 720px at 0% -10%, rgba(146, 70, 30, 0.4), transparent 65%), radial-gradient(960px 620px at 100% 0%, rgba(70, 32, 18, 0.46), transparent 68%), linear-gradient(135deg, rgba(26, 12, 6, 0.98) 0%, rgba(18, 10, 6, 0.98) 45%, #0d0503 100%)",
  "--surface-app": "var(--app-bg)",
  "--surface-muted": "rgba(38, 20, 10, 0.92)",
  "--surface-elevated": "rgba(44, 24, 12, 0.94)",
  "--surface-overlay": "rgba(18, 9, 5, 0.76)",
  "--color-fg": "rgba(255, 233, 210, 0.96)",
  "--color-fg-muted": "rgba(242, 198, 160, 0.82)",
  "--color-fg-subtle": "rgba(215, 164, 122, 0.72)",
  "--color-border": "rgba(204, 120, 64, 0.42)",
  "--color-border-strong": "rgba(234, 144, 60, 0.5)",
  "--color-brand": "#f59e0b",
  "--color-brand-strong": "#d97706",
  "--color-brand-foreground": "#130903",
  "--color-brand-muted": "rgba(245, 158, 11, 0.24)",
  "--gradient-brand": "linear-gradient(120deg,#fb923c 0%,#f59e0b 55%,#f97316 100%)",
  "--cta-gradient": "linear-gradient(120deg,#f97316 0%,#ea580c 52%,#f59e0b 100%)",
  "--cta-button-text": "#130903",
  "--color-accent": "#f97316",
  "--color-info": "#fb923c",
  "--color-success": "#22c55e",
  "--color-warning": "#facc15",
  "--color-danger": "#ef4444",
  "--accent-glow": "rgba(249, 147, 66, 0.28)",
  "--pill-bg-1": "rgba(68, 34, 18, 0.88)",
  "--pill-bg-2": "rgba(58, 28, 14, 0.86)",
  "--pill-border": "rgba(234, 144, 60, 0.38)",
  "--rail-bg-1": "rgba(42, 22, 12, 0.9)",
  "--rail-bg-2": "rgba(32, 16, 8, 0.88)",
  "--rail-border": "rgba(176, 96, 40, 0.38)",
  "--card-bg-1": "rgba(48, 26, 14, 0.94)",
  "--card-bg-2": "rgba(36, 18, 10, 0.92)",
  "--card-border": "rgba(198, 110, 52, 0.42)",
  "--card-shadow": "0 24px 52px rgba(18, 8, 4, 0.6)",
  "--card-hover-bg-1": "rgba(54, 28, 14, 0.95)",
  "--card-hover-bg-2": "rgba(42, 22, 12, 0.93)",
  "--card-hover-border": "rgba(224, 132, 58, 0.48)",
  "--card-hover-shadow": "0 28px 60px rgba(26, 12, 6, 0.64)",
  "--header-glass-top": "rgba(46, 24, 12, 0.82)",
  "--header-glass-bottom": "rgba(32, 16, 8, 0.78)",
  "--header-tint-from": "rgba(204, 120, 64, 0.3)",
  "--header-tint-to": "rgba(176, 96, 40, 0.26)",
  "--header-border-color": "rgba(204, 120, 64, 0.34)",
  "--header-shadow": "0 20px 48px rgba(14, 6, 3, 0.66)",
  "--header-scrim": "rgba(8, 5, 3, 0.86)",
  "--dock-bg-1": "rgba(42, 22, 12, 0.94)",
  "--dock-bg-2": "rgba(32, 16, 8, 0.92)",
  "--dock-border": "rgba(176, 96, 40, 0.4)",
  "--dock-shadow": "0 -1px 0 rgba(26, 12, 6, 0.6), 0 18px 44px rgba(18, 8, 4, 0.6)",
  "--dock-btn-bg-1": "rgba(71, 36, 18, 0.88)",
  "--dock-btn-bg-2": "rgba(60, 30, 15, 0.86)",
  "--dock-btn-border": "rgba(204, 120, 64, 0.46)",
  "--dock-btn-hover-border": "rgba(234, 144, 60, 0.54)",
  "--dock-active-shadow": "0 18px 36px rgba(176, 96, 40, 0.5)",
  "--dock-active-glow": "rgba(248, 156, 66, 0.28)",
  "--dock-text-muted": "rgba(242, 198, 160, 0.72)",
  "--dock-sheet-bg-1": "rgba(42, 22, 12, 0.96)",
  "--dock-sheet-bg-2": "rgba(30, 16, 8, 0.94)",
  "--dock-sheet-border": "rgba(176, 96, 40, 0.4)",
  "--dock-sheet-shadow": "0 22px 54px rgba(12, 6, 3, 0.64)",
};

const FALL_THEME_VARS: Record<string, string> = createThemePresetVars("#b45309", {
  accentHex: "#f97316",
  accentGlow: 0.26,
  overrides: FALL_THEME_OVERRIDES,
});

const WINTER_THEME_OVERRIDES: Record<string, string> = {
  "--app-bg": "radial-gradient(1200px 720px at 0% -10%, rgba(72, 148, 255, 0.32), transparent 65%), radial-gradient(980px 640px at 100% 0%, rgba(32, 76, 150, 0.38), transparent 70%), linear-gradient(125deg, rgba(8, 18, 42, 0.98) 0%, rgba(5, 14, 34, 0.97) 45%, #030818 100%)",
  "--surface-app": "var(--app-bg)",
  "--surface-muted": "rgba(18, 32, 58, 0.9)",
  "--surface-elevated": "rgba(20, 36, 66, 0.92)",
  "--surface-overlay": "rgba(6, 16, 30, 0.76)",
  "--color-fg": "rgba(225, 240, 255, 0.96)",
  "--color-fg-muted": "rgba(183, 208, 242, 0.8)",
  "--color-fg-subtle": "rgba(144, 182, 226, 0.68)",
  "--color-border": "rgba(96, 165, 250, 0.32)",
  "--color-border-strong": "rgba(59, 130, 246, 0.38)",
  "--color-brand": "#60a5fa",
  "--color-brand-strong": "#2563eb",
  "--color-brand-foreground": "#051022",
  "--color-brand-muted": "rgba(96, 165, 250, 0.24)",
  "--gradient-brand": "linear-gradient(120deg,#38bdf8 0%,#60a5fa 55%,#a855f7 100%)",
  "--cta-gradient": "linear-gradient(120deg,#22d3ee 0%,#38bdf8 55%,#60a5fa 100%)",
  "--cta-button-text": "#051022",
  "--color-accent": "#38bdf8",
  "--color-info": "#22d3ee",
  "--color-success": "#34d399",
  "--color-warning": "#fbbf24",
  "--color-danger": "#f87171",
  "--accent-glow": "rgba(96, 165, 250, 0.28)",
  "--pill-bg-1": "rgba(24, 46, 88, 0.88)",
  "--pill-bg-2": "rgba(18, 36, 68, 0.86)",
  "--pill-border": "rgba(94, 178, 255, 0.34)",
  "--rail-bg-1": "rgba(22, 40, 70, 0.9)",
  "--rail-bg-2": "rgba(16, 30, 56, 0.88)",
  "--rail-border": "rgba(76, 146, 230, 0.34)",
  "--card-bg-1": "rgba(20, 38, 70, 0.92)",
  "--card-bg-2": "rgba(16, 32, 60, 0.9)",
  "--card-border": "rgba(96, 165, 250, 0.3)",
  "--card-shadow": "0 24px 52px rgba(6, 16, 34, 0.6)",
  "--card-hover-bg-1": "rgba(24, 44, 78, 0.94)",
  "--card-hover-bg-2": "rgba(18, 38, 68, 0.92)",
  "--card-hover-border": "rgba(127, 190, 255, 0.36)",
  "--card-hover-shadow": "0 28px 60px rgba(10, 24, 46, 0.64)",
  "--header-glass-top": "rgba(24, 42, 74, 0.8)",
  "--header-glass-bottom": "rgba(18, 34, 64, 0.76)",
  "--header-tint-from": "rgba(96, 165, 250, 0.28)",
  "--header-tint-to": "rgba(56, 132, 216, 0.24)",
  "--header-border-color": "rgba(96, 165, 250, 0.32)",
  "--header-shadow": "0 22px 48px rgba(4, 12, 34, 0.62)",
  "--header-scrim": "rgba(4, 10, 22, 0.84)",
  "--dock-bg-1": "rgba(22, 40, 70, 0.92)",
  "--dock-bg-2": "rgba(18, 36, 64, 0.9)",
  "--dock-border": "rgba(76, 146, 230, 0.32)",
  "--dock-shadow": "0 -1px 0 rgba(8, 18, 34, 0.6), 0 20px 44px rgba(6, 16, 34, 0.62)",
  "--dock-btn-bg-1": "rgba(44, 76, 130, 0.9)",
  "--dock-btn-bg-2": "rgba(36, 62, 108, 0.88)",
  "--dock-btn-border": "rgba(118, 181, 255, 0.36)",
  "--dock-btn-hover-border": "rgba(148, 203, 255, 0.46)",
  "--dock-active-shadow": "0 18px 36px rgba(40, 88, 156, 0.48)",
  "--dock-active-glow": "rgba(96, 165, 250, 0.32)",
  "--dock-text-muted": "rgba(183, 208, 242, 0.74)",
  "--dock-sheet-bg-1": "rgba(24, 42, 74, 0.94)",
  "--dock-sheet-bg-2": "rgba(18, 36, 64, 0.92)",
  "--dock-sheet-border": "rgba(84, 152, 236, 0.32)",
  "--dock-sheet-shadow": "0 24px 54px rgba(6, 16, 34, 0.64)",
};

const WINTER_THEME_VARS: Record<string, string> = createThemePresetVars("#1d4ed8", {
  accentHex: "#38bdf8",
  accentGlow: 0.24,
  overrides: WINTER_THEME_OVERRIDES,
});

const SPRING_THEME_OVERRIDES: Record<string, string> = {
  "--app-bg": "radial-gradient(1200px 720px at 0% -10%, rgba(156, 236, 205, 0.32), transparent 62%), radial-gradient(1000px 660px at 100% 0%, rgba(163, 230, 216, 0.3), transparent 66%), linear-gradient(120deg, rgba(240, 255, 248, 0.98) 0%, rgba(226, 255, 242, 0.96) 45%, #f1fff7 100%)",
  "--surface-app": "var(--app-bg)",
  "--surface-muted": "rgba(233, 255, 246, 0.94)",
  "--surface-elevated": "rgba(222, 252, 238, 0.96)",
  "--surface-overlay": "rgba(176, 238, 210, 0.32)",
  "--color-fg": "rgba(18, 52, 40, 0.95)",
  "--color-fg-muted": "rgba(32, 84, 62, 0.78)",
  "--color-fg-subtle": "rgba(50, 110, 80, 0.64)",
  "--color-border": "rgba(126, 209, 170, 0.4)",
  "--color-border-strong": "rgba(82, 180, 140, 0.46)",
  "--color-brand": "#22c55e",
  "--color-brand-strong": "#15803d",
  "--color-brand-foreground": "#05291f",
  "--color-brand-muted": "rgba(34, 197, 94, 0.28)",
  "--gradient-brand": "linear-gradient(120deg,#34d399 0%,#22c55e 55%,#0ea5e9 100%)",
  "--cta-gradient": "linear-gradient(120deg,#22c55e 0%,#16a34a 55%,#10b981 100%)",
  "--cta-button-text": "#05291f",
  "--color-accent": "#0ea5e9",
  "--color-info": "#22d3ee",
  "--color-success": "#16a34a",
  "--color-warning": "#facc15",
  "--color-danger": "#ef4444",
  "--accent-glow": "rgba(68, 214, 150, 0.28)",
  "--pill-bg-1": "rgba(231, 255, 245, 0.9)",
  "--pill-bg-2": "rgba(214, 248, 232, 0.88)",
  "--pill-border": "rgba(126, 209, 170, 0.44)",
  "--rail-bg-1": "rgba(226, 252, 240, 0.92)",
  "--rail-bg-2": "rgba(212, 246, 228, 0.9)",
  "--rail-border": "rgba(126, 209, 170, 0.36)",
  "--card-bg-1": "rgba(235, 255, 246, 0.96)",
  "--card-bg-2": "rgba(220, 249, 233, 0.94)",
  "--card-border": "rgba(118, 204, 164, 0.44)",
  "--card-shadow": "0 24px 48px rgba(74, 185, 140, 0.22)",
  "--card-hover-bg-1": "rgba(226, 252, 240, 0.96)",
  "--card-hover-bg-2": "rgba(212, 246, 228, 0.94)",
  "--card-hover-border": "rgba(102, 192, 152, 0.5)",
  "--card-hover-shadow": "0 28px 56px rgba(62, 172, 130, 0.26)",
  "--header-glass-top": "rgba(227, 252, 241, 0.85)",
  "--header-glass-bottom": "rgba(214, 246, 232, 0.8)",
  "--header-tint-from": "rgba(126, 209, 170, 0.28)",
  "--header-tint-to": "rgba(102, 192, 152, 0.24)",
  "--header-border-color": "rgba(126, 209, 170, 0.34)",
  "--header-shadow": "0 20px 45px rgba(60, 168, 126, 0.26)",
  "--header-scrim": "rgba(8, 26, 20, 0.82)",
  "--dock-bg-1": "rgba(226, 252, 240, 0.95)",
  "--dock-bg-2": "rgba(212, 246, 228, 0.93)",
  "--dock-border": "rgba(118, 204, 164, 0.4)",
  "--dock-shadow": "0 -1px 0 rgba(164, 226, 198, 0.28), 0 20px 46px rgba(76, 182, 136, 0.22)",
  "--dock-btn-bg-1": "rgba(245, 255, 248, 0.88)",
  "--dock-btn-bg-2": "rgba(224, 250, 234, 0.86)",
  "--dock-btn-border": "rgba(118, 204, 164, 0.44)",
  "--dock-btn-hover-border": "rgba(94, 188, 150, 0.5)",
  "--dock-active-shadow": "0 18px 34px rgba(64, 176, 132, 0.32)",
  "--dock-active-glow": "rgba(120, 214, 176, 0.3)",
  "--dock-text-muted": "rgba(40, 90, 66, 0.72)",
  "--dock-sheet-bg-1": "rgba(226, 252, 240, 0.95)",
  "--dock-sheet-bg-2": "rgba(210, 245, 228, 0.93)",
  "--dock-sheet-border": "rgba(118, 204, 164, 0.4)",
  "--dock-sheet-shadow": "0 22px 50px rgba(74, 185, 140, 0.24)",
};

const SPRING_THEME_VARS: Record<string, string> = createThemePresetVars("#22c55e", {
  accentHex: "#0ea5e9",
  accentGlow: 0.24,
  overrides: SPRING_THEME_OVERRIDES,
});

function builtInPresets(): Preset[] {
  return [
    { id: "dark", title: "Default (Dark)", desc: "Capsules dark baseline palette.", vars: {}, theme: "dark" },
    { id: "light", title: "Default (Light)", desc: "Capsules light baseline palette.", vars: {}, theme: "light" },
    { id: "summer", title: "Summer", desc: "Radiant citrus with coastal teal accents.", vars: SUMMER_THEME_VARS },
    { id: "fall", title: "Fall", desc: "Ember shadows with golden highlights.", vars: FALL_THEME_VARS },
    { id: "winter", title: "Winter", desc: "Icy blues over midnight glass.", vars: WINTER_THEME_VARS },
    { id: "spring", title: "Spring", desc: "Fresh mint and garden glass.", vars: SPRING_THEME_VARS },
  ];
}

const PLACEHOLDER_THEMES: SavedStyle[] = [];

function buildPreviewStyle(vars: Record<string, string>): React.CSSProperties {
  const style: React.CSSProperties = {};
  Object.entries(vars).forEach(([key, value]) => {
    (style as unknown as Record<string, string>)[key] = value;
  });
  return style;
}

function getEntryId(entry: ThemeEntry): string {
  return entry.kind === "preset" ? `preset:${entry.preset.id}` : `saved:${entry.saved.id}`;
}

function useThemeStyles() {
  const { user, isLoaded } = useCurrentUser();
  const envelope = React.useMemo(() => (user ? buildMemoryEnvelope(user) : null), [user]);

  const basePresets = React.useMemo(() => builtInPresets(), []);
  const placeholderThemes = React.useMemo(() => PLACEHOLDER_THEMES, []);

  const envelopeRef = React.useRef(envelope);
  React.useEffect(() => {
    envelopeRef.current = envelope;
  }, [envelope]);

  const [savedStyles, setSavedStyles] = React.useState<SavedStyle[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [previewingId, setPreviewingId] = React.useState<string | null>(null);
  const [activeMode, setActiveMode] = React.useState<"light" | "dark">(getTheme());
  const [activeId, setActiveId] = React.useState<string | null>(null);

  const displayedSavedStyles = React.useMemo(
    () => (savedStyles.length ? savedStyles : placeholderThemes),
    [savedStyles, placeholderThemes],
  );

  const items = React.useMemo<ThemeEntry[]>(() => {
    const presetEntries = basePresets
      .filter((preset) => preset.id !== "light" && preset.id !== "dark")
      .map((preset) => ({ kind: "preset", preset } as ThemeEntry));
    const savedEntries = displayedSavedStyles.map((saved) => ({ kind: "saved", saved } as ThemeEntry));
    return [...presetEntries, ...savedEntries];
  }, [basePresets, displayedSavedStyles]);

  React.useEffect(() => {
    const stored = getStoredThemeVars();
    if (!Object.keys(stored).length) {
      setActiveId(`preset:${activeMode}`);
      return;
    }
    const matchingPreset = basePresets.find((preset) => {
      if (preset.id === "light" || preset.id === "dark") return false;
      const entries = Object.entries(preset.vars);
      if (entries.length !== Object.keys(stored).length) return false;
      return entries.every(([key, value]) => stored[key] === value);
    });
    if (matchingPreset) {
      setActiveId(`preset:${matchingPreset.id}`);
      if (matchingPreset.theme) setActiveMode(matchingPreset.theme);
      return;
    }
    const matchingSaved = savedStyles.find((style) => {
      const entries = Object.entries(style.vars);
      if (entries.length !== Object.keys(stored).length) return false;
      return entries.every(([key, value]) => stored[key] === value);
    });
    if (matchingSaved) {
      setActiveId(`saved:${matchingSaved.id}`);
    }
  }, [activeMode, basePresets, savedStyles]);

  const startPreview = React.useCallback(
    (entry: ThemeEntry) => {
      const id = getEntryId(entry);
      if (previewingId === id) return;
      setPreviewingId(id);
      const vars = entry.kind === "preset" ? entry.preset.vars : entry.saved.vars;
      if (Object.keys(vars).length) startPreviewThemeVars(vars);
    },
    [previewingId],
  );

  const stopPreview = React.useCallback(() => {
    endPreviewThemeVars();
    setPreviewingId(null);
  }, []);

  React.useEffect(
    () => () => {
      endPreviewThemeVars();
    },
    [],
  );

  const handleApply = React.useCallback(
    (entry: ThemeEntry) => {
      stopPreview();
      const id = getEntryId(entry);
      setActiveId(id);
      clearThemeVars();
      if (entry.kind === "preset") {
        if (entry.preset.theme) {
          setTheme(entry.preset.theme);
          setActiveMode(entry.preset.theme);
        }
        if (Object.keys(entry.preset.vars).length) applyThemeVars(entry.preset.vars);
      } else {
        applyThemeVars(entry.saved.vars);
      }
    },
    [stopPreview],
  );

  const handleSetMode = React.useCallback(
    (mode: "light" | "dark") => {
      stopPreview();
      clearThemeVars();
      setTheme(mode);
      setActiveMode(mode);
      setActiveId(`preset:${mode}`);
    },
    [stopPreview],
  );

  const updateFromSaved = React.useCallback((saved: SavedStyle[]) => {
    const filtered = saved.filter((style) => Boolean(style?.id));
    setSavedStyles(filtered);
  }, []);

  const fetchSaved = React.useCallback(async () => {
    const envelopePayload = envelopeRef.current;
    if (!envelopePayload) {
      updateFromSaved([]);
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/memory/list", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ kind: "theme", user: envelopePayload }),
      });
      const json = (await res.json().catch(() => ({}))) as { items?: unknown[] };
      const normalized: SavedStyle[] = Array.isArray(json.items)
        ? json.items.map(mapThemeRecord).filter((style): style is SavedStyle => Boolean(style))
        : [];
      updateFromSaved(normalized);
    } finally {
      setLoading(false);
    }
  }, [updateFromSaved]);

  React.useEffect(() => {
    if (!isLoaded) return;
    void fetchSaved();
  }, [isLoaded, fetchSaved]);

  const handleRename = React.useCallback(
    async (entry: ThemeEntry) => {
      if (entry.kind !== "saved" || entry.saved.id.startsWith("placeholder-")) return;
      const currentTitle = entry.saved.title || "Saved theme";
      const next = window.prompt("Rename theme", currentTitle)?.trim();
      if (!next || next === currentTitle) return;
      const res = await fetch("/api/memory/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ id: entry.saved.id, title: next, kind: "theme" }),
      });
      if (res.ok) {
        setSavedStyles((prev) =>
          prev.map((style) =>
            style.id === entry.saved.id ? { ...style, title: next, summary: next, description: next } : style,
          ),
        );
      }
    },
    [],
  );

  const handleDelete = React.useCallback(
    async (entry: ThemeEntry) => {
      if (entry.kind !== "saved" || entry.saved.id.startsWith("placeholder-")) return;
      stopPreview();
      const res = await fetch("/api/memory/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ ids: [entry.saved.id], kind: "theme", user: envelopeRef.current ?? {} }),
      });
      if (res.ok) {
        setSavedStyles((prev) => prev.filter((style) => style.id !== entry.saved.id));
      }
    },
    [stopPreview],
  );

  const handleDeleteAll = React.useCallback(async () => {
    stopPreview();
    const hasRealSaved = savedStyles.some((style) => !style.id.startsWith("placeholder-"));
    if (hasRealSaved) {
      await fetch("/api/memory/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ kind: "theme", all: true, user: envelopeRef.current ?? {} }),
      });
    }
    setSavedStyles([]);
  }, [savedStyles, stopPreview]);

  const handleSaveCurrent = React.useCallback(async () => {
    const vars = getStoredThemeVars();
    if (!Object.keys(vars).length) {
      window.alert("No theme overrides to save yet.");
      return;
    }
    const title = window.prompt("Save theme as", "My theme")?.trim();
    if (!title) return;
    stopPreview();
    const res = await fetch("/api/memory/theme/save", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ title, summary: title, vars, user: envelopeRef.current ?? {} }),
    });
    if (res.ok) {
      void fetchSaved();
    }
  }, [fetchSaved, stopPreview]);

  const activeEntry = React.useMemo(() => {
    if (!items.length) return null;
    if (activeId) {
      const match = items.find((entry) => getEntryId(entry) === activeId);
      if (match) return match;
    }
    return items[0] ?? null;
  }, [items, activeId]);

  const hasRealSaved = React.useMemo(
    () => savedStyles.some((style) => !style.id.startsWith("placeholder-")),
    [savedStyles],
  );

  return {
    items,
    activeEntry,
    activeId,
    activeMode,
    previewingId,
    loading,
    hasRealSaved,
    handleApply,
    handleSetMode,
    handleSaveCurrent,
    handleDeleteAll,
    handleRename,
    handleDelete,
    startPreview,
    stopPreview,
  } as const;
}

type ThemeEntryCardProps = {
  entry: ThemeEntry;
  isActive: boolean;
  variant: "summary" | "gallery";
  onApply?: (entry: ThemeEntry) => void;
  onRename?: (entry: ThemeEntry) => void;
  onDelete?: (entry: ThemeEntry) => void;
  onPreview?: (entry: ThemeEntry) => void;
  onPreviewEnd?: () => void;
  isPreviewing?: boolean;
};

function ThemeEntryCard({
  entry,
  isActive,
  variant,
  onApply,
  onRename,
  onDelete,
  onPreview,
  onPreviewEnd,
  isPreviewing = false,
}: ThemeEntryCardProps) {
  const entryId = getEntryId(entry);
  const vars = entry.kind === "preset" ? entry.preset.vars : entry.saved.vars;
  const preview = React.useMemo(() => buildThemePreview(vars), [vars]);
  const groupBadges = preview.usages.slice(0, 3);
  const palette = preview.palette.slice(0, 4);
  const descriptionRaw = entry.kind === "preset" ? entry.preset.desc : entry.saved.description;
  const savedDetails = entry.kind === "saved" ? entry.saved.details : undefined;
  const fallbackDetails = summarizeGroupLabels(preview.usages);
  let description = descriptionRaw && descriptionRaw.trim().length ? descriptionRaw.trim() : "";
  if (!description && savedDetails && savedDetails.trim().length) {
    description = savedDetails.trim();
  }
  if (!description && fallbackDetails && fallbackDetails.length) {
    description = fallbackDetails;
  }
  if (!description) {
    description = "Capsules custom theme";
  }
  const name = entry.kind === "preset" ? entry.preset.title : entry.saved.title;
  const kindLabel = entry.kind === "saved" ? "Saved" : "Preset";
  const isEditable = entry.kind === "saved" && !entry.saved.id.startsWith("placeholder-");
  const showActions = variant === "gallery" && typeof onApply === "function";

  return (
    <article
      className={cn(
        styles.card,
        variant === "summary" ? styles.cardSummary : styles.cardGallery,
        isActive && styles.cardActive,
        isPreviewing && styles.cardPreviewing,
      )}
      data-theme-kind={entry.kind}
    >
      <div
        className={cn(promo.tile, styles.cardSurface)}
        tabIndex={variant === "gallery" ? 0 : -1}
        onMouseEnter={onPreview ? () => onPreview(entry) : undefined}
        onMouseLeave={onPreviewEnd}
        onFocus={onPreview ? () => onPreview(entry) : undefined}
        onBlur={onPreviewEnd}
        aria-pressed={isActive ? "true" : undefined}
      >
        <header className={styles.cardHeader}>
          <div className={styles.cardTitleBlock}>
            <span className={styles.cardSubtitle}>
              {variant === "summary" ? "Current theme" : kindLabel}
            </span>
            <span className={styles.cardTitle}>{name}</span>
          </div>
          {isActive ? <span className={styles.activeBadge}>Active</span> : null}
        </header>

        <div className={styles.previewShell} style={buildPreviewStyle(vars)} aria-hidden>
          <div className={styles.swatchBg} />
          <div className={styles.swatchCard} />
        </div>

        <p className={styles.description}>{description}</p>

        {groupBadges.length || palette.length ? (
          <div className={styles.previewMeta}>
            {groupBadges.length ? (
              <div className={styles.previewTags}>
                {groupBadges.map(({ group }) => (
                  <span key={`${entryId}-group-${group.id}`} className={styles.previewTag}>
                    {group.label}
                  </span>
                ))}
              </div>
            ) : null}
            {palette.length ? (
              <div className={styles.previewPalette} aria-hidden>
                {palette.map((value, index) => (
                  <span key={`${entryId}-swatch-${index}`} className={styles.previewColor} style={{ background: value }} />
                ))}
              </div>
            ) : null}
          </div>
        ) : null}

        {showActions ? (
          <div className={styles.buttonRow}>
            <Button variant="primary" size="sm" onClick={() => onApply?.(entry)}>
              {isActive ? "Applied" : "Apply"}
            </Button>
            <Button variant="secondary" size="sm" onClick={() => onRename?.(entry)} disabled={!isEditable}>
              Rename
            </Button>
            <Button variant="secondary" size="sm" onClick={() => onDelete?.(entry)} disabled={!isEditable}>
              Delete
            </Button>
          </div>
        ) : null}
      </div>
    </article>
  );
}

export function ThemeStyleCarousel() {
  const { activeEntry, activeMode, loading, handleSetMode, handleSaveCurrent } = useThemeStyles();

  return (
    <div className={styles.root}>
      <div className={styles.header}>
        <div className={styles.headerCopy}>
          <h3 className={styles.title}>Choose your Capsules look</h3>
          <p className={styles.subtitle}>Preview a theme, then apply when you are ready.</p>
        </div>
        <div className={styles.headerActions}>
          <Button variant="secondary" size="sm" onClick={handleSaveCurrent}>
            Save current
          </Button>
          <ButtonLink variant="ghost" size="sm" href="/settings/themes" rightIcon={<ArrowRight weight="bold" />}>
            View more
          </ButtonLink>
        </div>
      </div>

      <div className={styles.modeButtons}>
        <Button
          variant={activeMode === "light" ? "primary" : "secondary"}
          size="sm"
          onClick={() => handleSetMode("light")}
        >
          Light mode
        </Button>
        <Button
          variant={activeMode === "dark" ? "primary" : "secondary"}
          size="sm"
          onClick={() => handleSetMode("dark")}
        >
          Dark mode
        </Button>
      </div>

      <div className={styles.summaryGrid}>
        {activeEntry ? (
          <ThemeEntryCard entry={activeEntry} isActive variant="summary" />
        ) : (
          <p className={styles.emptyState}>Choose a theme to begin customizing Capsules.</p>
        )}
      </div>

      {loading ? <div className={styles.meta}>Loading saved themes...</div> : null}
    </div>
  );
}

export function ThemeStylesGallery() {
  const {
    items,
    activeId,
    activeMode,
    previewingId,
    loading,
    hasRealSaved,
    handleApply,
    handleSetMode,
    handleSaveCurrent,
    handleDeleteAll,
    handleRename,
    handleDelete,
    startPreview,
    stopPreview,
  } = useThemeStyles();

  return (
    <section className={styles.fullRoot}>
      <div className={styles.fullHeader}>
        <div className={styles.headerCopy}>
          <h1 className={styles.title}>All themes</h1>
          <p className={styles.fullSubtitle}>
            Browse built-in presets and your saved looks. Hover to preview, then apply to commit the change.
          </p>
        </div>
        <div className={styles.fullHeaderActions}>
          <Button variant="secondary" size="sm" onClick={handleSaveCurrent}>
            Save current
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => { void handleDeleteAll(); }}
            disabled={!hasRealSaved}
            leftIcon={<Trash weight="bold" />}
          >
            Delete all saved
          </Button>
          <ButtonLink variant="ghost" size="sm" href="/settings" leftIcon={<ArrowLeft weight="bold" />}>
            Back to settings
          </ButtonLink>
        </div>
      </div>

      <div className={styles.modeButtons}>
        <Button
          variant={activeMode === "light" ? "primary" : "secondary"}
          size="sm"
          onClick={() => handleSetMode("light")}
        >
          Light mode
        </Button>
        <Button
          variant={activeMode === "dark" ? "primary" : "secondary"}
          size="sm"
          onClick={() => handleSetMode("dark")}
        >
          Dark mode
        </Button>
      </div>

      {loading ? <div className={styles.meta}>Loading saved themes...</div> : null}

      <div className={styles.grid}>
        {items.map((entry) => {
          const entryId = getEntryId(entry);
          return (
            <ThemeEntryCard
              key={entryId}
              entry={entry}
              isActive={entryId === activeId}
              variant="gallery"
              onApply={handleApply}
              onRename={handleRename}
              onDelete={handleDelete}
              onPreview={startPreview}
              onPreviewEnd={stopPreview}
              isPreviewing={entryId === previewingId}
            />
          );
        })}
      </div>
    </section>
  );
}






