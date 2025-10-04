"use client";

import * as React from "react";
import styles from "./theme-style-carousel.module.css";
import promo from "./promo-row.module.css";
import { Button } from "@/components/ui/button";
import cm from "@/components/ui/context-menu.module.css";

import {
  applyThemeVars,
  startPreviewThemeVars,
  endPreviewThemeVars,
  getStoredThemeVars,
  setTheme,
  getTheme,
  clearThemeVars,
} from "@/lib/theme";
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


const SUMMER_THEME_VARS: Record<string, string> = {
  "--app-bg": "radial-gradient(1200px 720px at 0% 0%, rgba(255, 188, 122, 0.24), transparent 62%), radial-gradient(1000px 680px at 100% 0%, rgba(255, 154, 173, 0.22), transparent 64%), linear-gradient(120deg, rgba(255, 247, 226, 0.96) 0%, rgba(255, 238, 208, 0.94) 45%, #fff3dc 100%)",
  "--surface-app": "var(--app-bg)",
  "--surface-muted": "rgba(255, 242, 230, 0.94)",
  "--surface-elevated": "rgba(255, 249, 240, 0.96)",
  "--surface-overlay": "rgba(255, 233, 214, 0.82)",
  "--color-fg": "rgba(42, 24, 12, 0.94)",
  "--color-fg-muted": "rgba(76, 42, 20, 0.78)",
  "--color-fg-subtle": "rgba(110, 66, 34, 0.6)",
  "--color-border": "rgba(240, 184, 128, 0.28)",
  "--color-border-strong": "rgba(208, 120, 56, 0.36)",
  "--color-brand": "#f97316",
  "--color-brand-strong": "#ea580c",
  "--color-brand-foreground": "#2c1604",
  "--color-brand-muted": "rgba(249, 115, 22, 0.22)",
  "--gradient-brand": "linear-gradient(120deg,#facc15 0%,#f97316 48%,#fb7185 100%)",
  "--cta-gradient": "linear-gradient(120deg,#f97316 0%,#fb7185 55%,#facc15 100%)",
  "--cta-button-text": "#2c1604",
  "--text-on-brand": "#2c1604",
  "--color-accent": "#facc15",
  "--color-info": "#f59e0b",
  "--color-success": "#22c55e",
  "--color-warning": "#f97316",
  "--color-danger": "#ef4444",
  "--presence-online-dot": "#22c55e",
  "--presence-online-dot-bright": "#4ade80",
  "--presence-online-ring": "rgba(34, 197, 94, 0.35)",
  "--presence-away-dot": "#facc15",
  "--presence-away-ring": "rgba(250, 204, 21, 0.32)",
  "--presence-offline-dot": "rgba(140, 120, 110, 0.4)",
  "--presence-offline-ring": "rgba(140, 120, 110, 0.28)",
  "--glass-bg-1": "rgba(255, 255, 255, 0.7)",
  "--glass-bg-2": "rgba(255, 246, 229, 0.48)",
  "--card-bg-1": "rgba(255, 245, 232, 0.96)",
  "--card-bg-2": "rgba(255, 236, 214, 0.92)",
  "--card-border": "rgba(248, 196, 144, 0.45)",
  "--card-shadow": "0 24px 48px rgba(225, 122, 20, 0.24)",
  "--shadow-xs": "0 2px 4px rgba(249, 146, 65, 0.18)",
  "--shadow-sm": "0 6px 16px rgba(237, 127, 48, 0.2)",
  "--shadow-md": "0 18px 32px rgba(220, 110, 28, 0.24)",
  "--shadow-lg": "0 28px 48px rgba(199, 96, 20, 0.28)",
  "--shadow-xl": "0 38px 64px rgba(172, 78, 16, 0.3)",
  "--shadow-glow": "0 0 48px rgba(249, 196, 83, 0.42)",
  "--ring-primary": "0 0 0 1px rgba(249, 115, 22, 0.45)",
  "--ring-offset": "0 0 0 4px rgba(249, 115, 22, 0.16)",
  "--dock-bg-1": "rgba(255, 249, 240, 0.92)",
  "--dock-bg-2": "rgba(255, 239, 222, 0.9)",
  "--dock-border": "rgba(250, 200, 150, 0.42)",
  "--dock-shadow": "0 -1px 0 rgba(249, 206, 150, 0.3), 0 18px 36px rgba(217, 116, 32, 0.22)",
  "--dock-btn-bg-1": "rgba(255, 255, 255, 0.72)",
  "--dock-btn-bg-2": "rgba(255, 244, 224, 0.56)",
  "--dock-btn-border": "rgba(244, 188, 132, 0.5)",
  "--dock-btn-hover-border": "rgba(242, 149, 72, 0.76)",
  "--dock-active-shadow": "0 14px 26px rgba(220, 110, 32, 0.32)",
  "--dock-active-glow": "rgba(249, 196, 83, 0.34)",
  "--dock-text-muted": "rgba(122, 74, 28, 0.72)",
  "--dock-sheet-bg-1": "rgba(255, 249, 240, 0.95)",
  "--dock-sheet-bg-2": "rgba(255, 239, 222, 0.92)",
  "--dock-sheet-border": "rgba(244, 188, 132, 0.48)",
  "--dock-sheet-shadow": "0 24px 48px rgba(214, 116, 32, 0.24)",
};

const FALL_THEME_VARS: Record<string, string> = {
  "--app-bg": "radial-gradient(1100px 680px at 0% 0%, rgba(208, 120, 56, 0.22), transparent 62%), radial-gradient(900px 580px at 100% 0%, rgba(124, 45, 18, 0.3), transparent 66%), linear-gradient(135deg, rgba(34, 15, 8, 0.96) 0%, rgba(46, 20, 10, 0.94) 40%, #1b0b05 100%)",
  "--surface-app": "var(--app-bg)",
  "--surface-muted": "rgba(50, 26, 16, 0.9)",
  "--surface-elevated": "rgba(46, 24, 14, 0.92)",
  "--surface-overlay": "rgba(28, 14, 10, 0.82)",
  "--color-fg": "rgba(255, 236, 220, 0.95)",
  "--color-fg-muted": "rgba(255, 216, 192, 0.78)",
  "--color-fg-subtle": "rgba(255, 200, 164, 0.64)",
  "--color-border": "rgba(204, 112, 60, 0.35)",
  "--color-border-strong": "rgba(234, 88, 12, 0.42)",
  "--color-brand": "#ea580c",
  "--color-brand-strong": "#9a3412",
  "--color-brand-foreground": "#fff3e0",
  "--color-brand-muted": "rgba(234, 88, 12, 0.24)",
  "--gradient-brand": "linear-gradient(120deg,#f97316 0%,#ea580c 45%,#b45309 100%)",
  "--cta-gradient": "linear-gradient(120deg,#fbbf24 0%,#f97316 45%,#ea580c 100%)",
  "--cta-button-text": "#fffaf0",
  "--text-on-brand": "#fffaf0",
  "--color-accent": "#f59e0b",
  "--color-info": "#fb923c",
  "--color-success": "#22c55e",
  "--color-warning": "#f97316",
  "--color-danger": "#f87171",
  "--presence-online-dot": "#22c55e",
  "--presence-online-dot-bright": "#4ade80",
  "--presence-online-ring": "rgba(34, 197, 94, 0.32)",
  "--presence-away-dot": "#f97316",
  "--presence-away-ring": "rgba(249, 115, 22, 0.42)",
  "--presence-offline-dot": "rgba(171, 120, 88, 0.45)",
  "--presence-offline-ring": "rgba(135, 96, 68, 0.32)",
  "--glass-bg-1": "rgba(64, 32, 18, 0.85)",
  "--glass-bg-2": "rgba(38, 18, 10, 0.72)",
  "--card-bg-1": "rgba(44, 22, 12, 0.92)",
  "--card-bg-2": "rgba(30, 16, 8, 0.9)",
  "--card-border": "rgba(234, 88, 12, 0.36)",
  "--card-shadow": "0 24px 48px rgba(92, 40, 10, 0.46)",
  "--shadow-xs": "0 2px 4px rgba(90, 40, 12, 0.42)",
  "--shadow-sm": "0 8px 20px rgba(90, 40, 12, 0.38)",
  "--shadow-md": "0 20px 36px rgba(66, 28, 8, 0.42)",
  "--shadow-lg": "0 30px 50px rgba(54, 22, 6, 0.48)",
  "--shadow-xl": "0 40px 68px rgba(40, 16, 4, 0.5)",
  "--shadow-glow": "0 0 52px rgba(234, 88, 12, 0.4)",
  "--ring-primary": "0 0 0 1px rgba(234, 88, 12, 0.5)",
  "--ring-offset": "0 0 0 4px rgba(180, 83, 9, 0.26)",
  "--dock-bg-1": "rgba(40, 20, 10, 0.94)",
  "--dock-bg-2": "rgba(28, 14, 8, 0.93)",
  "--dock-border": "rgba(160, 78, 24, 0.36)",
  "--dock-shadow": "0 -1px 0 rgba(26, 12, 6, 0.7), 0 20px 42px rgba(54, 22, 6, 0.52)",
  "--dock-btn-bg-1": "rgba(234, 88, 12, 0.2)",
  "--dock-btn-bg-2": "rgba(234, 88, 12, 0.12)",
  "--dock-btn-border": "rgba(234, 88, 12, 0.42)",
  "--dock-btn-hover-border": "rgba(249, 115, 22, 0.55)",
  "--dock-active-shadow": "0 16px 30px rgba(124, 45, 18, 0.5)",
  "--dock-active-glow": "rgba(249, 115, 22, 0.32)",
  "--dock-text-muted": "rgba(255, 228, 196, 0.68)",
  "--dock-sheet-bg-1": "rgba(40, 20, 10, 0.96)",
  "--dock-sheet-bg-2": "rgba(28, 14, 8, 0.94)",
  "--dock-sheet-border": "rgba(160, 78, 24, 0.36)",
  "--dock-sheet-shadow": "0 24px 50px rgba(54, 22, 6, 0.52)",
};

const WINTER_THEME_VARS: Record<string, string> = {
  "--app-bg": "radial-gradient(1200px 720px at 0% 0%, rgba(96, 165, 250, 0.18), transparent 60%), radial-gradient(980px 640px at 100% 0%, rgba(59, 130, 246, 0.14), transparent 62%), linear-gradient(120deg, rgba(6, 13, 30, 0.98) 0%, rgba(4, 10, 26, 0.96) 45%, #04061a 100%)",
  "--surface-app": "var(--app-bg)",
  "--surface-muted": "rgba(12, 22, 40, 0.88)",
  "--surface-elevated": "rgba(14, 24, 44, 0.9)",
  "--surface-overlay": "rgba(6, 14, 26, 0.78)",
  "--color-fg": "rgba(225, 240, 255, 0.96)",
  "--color-fg-muted": "rgba(183, 210, 242, 0.78)",
  "--color-fg-subtle": "rgba(146, 186, 230, 0.64)",
  "--color-border": "rgba(96, 165, 250, 0.22)",
  "--color-border-strong": "rgba(59, 130, 246, 0.32)",
  "--color-brand": "#60a5fa",
  "--color-brand-strong": "#2563eb",
  "--color-brand-foreground": "#041026",
  "--color-brand-muted": "rgba(96, 165, 250, 0.22)",
  "--gradient-brand": "linear-gradient(120deg,#0ea5e9 0%,#60a5fa 55%,#c084fc 100%)",
  "--cta-gradient": "linear-gradient(120deg,#60a5fa 0%,#38bdf8 45%,#c084fc 100%)",
  "--cta-button-text": "#041026",
  "--text-on-brand": "#041026",
  "--color-accent": "#38bdf8",
  "--color-info": "#38bdf8",
  "--color-success": "#34d399",
  "--color-warning": "#fbbf24",
  "--color-danger": "#f87171",
  "--presence-online-dot": "#34d399",
  "--presence-online-dot-bright": "#5eead4",
  "--presence-online-ring": "rgba(94, 234, 212, 0.32)",
  "--presence-away-dot": "#fbbf24",
  "--presence-away-ring": "rgba(251, 191, 36, 0.35)",
  "--presence-offline-dot": "rgba(89, 114, 150, 0.38)",
  "--presence-offline-ring": "rgba(89, 114, 150, 0.28)",
  "--glass-bg-1": "rgba(24, 40, 72, 0.68)",
  "--glass-bg-2": "rgba(15, 28, 52, 0.56)",
  "--card-bg-1": "rgba(16, 28, 54, 0.9)",
  "--card-bg-2": "rgba(10, 20, 40, 0.88)",
  "--card-border": "rgba(59, 130, 246, 0.32)",
  "--card-shadow": "0 24px 48px rgba(8, 20, 48, 0.42)",
  "--shadow-xs": "0 2px 4px rgba(15, 35, 60, 0.42)",
  "--shadow-sm": "0 8px 18px rgba(15, 35, 60, 0.38)",
  "--shadow-md": "0 20px 36px rgba(10, 26, 50, 0.38)",
  "--shadow-lg": "0 28px 48px rgba(6, 18, 40, 0.4)",
  "--shadow-xl": "0 38px 64px rgba(4, 12, 34, 0.42)",
  "--shadow-glow": "0 0 52px rgba(96, 165, 250, 0.45)",
  "--ring-primary": "0 0 0 1px rgba(96, 165, 250, 0.5)",
  "--ring-offset": "0 0 0 4px rgba(59, 130, 246, 0.22)",
  "--dock-bg-1": "rgba(15, 28, 50, 0.9)",
  "--dock-bg-2": "rgba(10, 22, 42, 0.88)",
  "--dock-border": "rgba(63, 112, 190, 0.32)",
  "--dock-shadow": "0 -1px 0 rgba(8, 18, 34, 0.7), 0 18px 36px rgba(6, 16, 34, 0.5)",
  "--dock-btn-bg-1": "rgba(96, 165, 250, 0.22)",
  "--dock-btn-bg-2": "rgba(56, 126, 199, 0.18)",
  "--dock-btn-border": "rgba(96, 165, 250, 0.35)",
  "--dock-btn-hover-border": "rgba(148, 197, 255, 0.5)",
  "--dock-active-shadow": "0 14px 28px rgba(22, 78, 142, 0.45)",
  "--dock-active-glow": "rgba(96, 165, 250, 0.4)",
  "--dock-text-muted": "rgba(180, 208, 244, 0.7)",
  "--dock-sheet-bg-1": "rgba(15, 28, 50, 0.95)",
  "--dock-sheet-bg-2": "rgba(10, 22, 42, 0.92)",
  "--dock-sheet-border": "rgba(63, 112, 190, 0.34)",
  "--dock-sheet-shadow": "0 24px 48px rgba(6, 16, 34, 0.5)",
};

const SPRING_THEME_VARS: Record<string, string> = {
  "--app-bg": "radial-gradient(1200px 720px at 0% 0%, rgba(148, 223, 196, 0.24), transparent 60%), radial-gradient(1000px 680px at 100% 0%, rgba(216, 255, 217, 0.24), transparent 64%), linear-gradient(120deg, rgba(241, 255, 246, 0.96) 0%, rgba(229, 255, 243, 0.94) 45%, #f1fff8 100%)",
  "--surface-app": "var(--app-bg)",
  "--surface-muted": "rgba(235, 255, 246, 0.94)",
  "--surface-elevated": "rgba(245, 255, 250, 0.96)",
  "--surface-overlay": "rgba(214, 241, 227, 0.82)",
  "--color-fg": "rgba(16, 36, 28, 0.95)",
  "--color-fg-muted": "rgba(30, 70, 46, 0.78)",
  "--color-fg-subtle": "rgba(52, 96, 66, 0.6)",
  "--color-border": "rgba(142, 211, 177, 0.28)",
  "--color-border-strong": "rgba(82, 180, 140, 0.36)",
  "--color-brand": "#34d399",
  "--color-brand-strong": "#0f766e",
  "--color-brand-foreground": "#05291f",
  "--color-brand-muted": "rgba(52, 211, 153, 0.22)",
  "--gradient-brand": "linear-gradient(120deg,#a3e635 0%,#34d399 48%,#38bdf8 100%)",
  "--cta-gradient": "linear-gradient(120deg,#34d399 0%,#10b981 55%,#a3e635 100%)",
  "--cta-button-text": "#05291f",
  "--text-on-brand": "#05291f",
  "--color-accent": "#a3e635",
  "--color-info": "#38bdf8",
  "--color-success": "#22c55e",
  "--color-warning": "#fbbf24",
  "--color-danger": "#ef4444",
  "--presence-online-dot": "#22c55e",
  "--presence-online-dot-bright": "#4ade80",
  "--presence-online-ring": "rgba(34, 197, 94, 0.3)",
  "--presence-away-dot": "#a3e635",
  "--presence-away-ring": "rgba(163, 230, 53, 0.3)",
  "--presence-offline-dot": "rgba(96, 136, 112, 0.32)",
  "--presence-offline-ring": "rgba(96, 136, 112, 0.24)",
  "--glass-bg-1": "rgba(255, 255, 255, 0.7)",
  "--glass-bg-2": "rgba(241, 255, 245, 0.5)",
  "--card-bg-1": "rgba(245, 255, 250, 0.95)",
  "--card-bg-2": "rgba(229, 252, 240, 0.92)",
  "--card-border": "rgba(142, 211, 177, 0.35)",
  "--card-shadow": "0 24px 48px rgba(58, 189, 140, 0.22)",
  "--shadow-xs": "0 2px 4px rgba(52, 168, 118, 0.16)",
  "--shadow-sm": "0 8px 18px rgba(52, 168, 118, 0.18)",
  "--shadow-md": "0 18px 32px rgba(32, 136, 96, 0.22)",
  "--shadow-lg": "0 28px 48px rgba(32, 120, 90, 0.24)",
  "--shadow-xl": "0 38px 64px rgba(28, 100, 76, 0.26)",
  "--shadow-glow": "0 0 48px rgba(163, 230, 183, 0.38)",
  "--ring-primary": "0 0 0 1px rgba(52, 211, 153, 0.45)",
  "--ring-offset": "0 0 0 4px rgba(163, 230, 181, 0.22)",
  "--dock-bg-1": "rgba(245, 255, 250, 0.92)",
  "--dock-bg-2": "rgba(229, 252, 240, 0.9)",
  "--dock-border": "rgba(142, 211, 177, 0.32)",
  "--dock-shadow": "0 -1px 0 rgba(204, 240, 220, 0.4), 0 18px 36px rgba(54, 164, 120, 0.22)",
  "--dock-btn-bg-1": "rgba(255, 255, 255, 0.7)",
  "--dock-btn-bg-2": "rgba(231, 252, 240, 0.5)",
  "--dock-btn-border": "rgba(142, 211, 177, 0.36)",
  "--dock-btn-hover-border": "rgba(82, 180, 140, 0.62)",
  "--dock-active-shadow": "0 14px 26px rgba(54, 164, 120, 0.28)",
  "--dock-active-glow": "rgba(163, 230, 181, 0.36)",
  "--dock-text-muted": "rgba(52, 128, 92, 0.68)",
  "--dock-sheet-bg-1": "rgba(245, 255, 250, 0.95)",
  "--dock-sheet-bg-2": "rgba(229, 252, 240, 0.92)",
  "--dock-sheet-border": "rgba(142, 211, 177, 0.36)",
  "--dock-sheet-shadow": "0 24px 48px rgba(54, 164, 120, 0.24)",
};

function builtInPresets(): Preset[] {
  return [
    { id: "light", title: "Light Mode", desc: "System light theme", vars: {}, theme: "light" },
    { id: "dark", title: "Dark Mode", desc: "System dark theme", vars: {}, theme: "dark" },
    { id: "default", title: "Default", desc: "Restore Capsules default colors.", vars: {} },
    { id: "summer", title: "Summer", desc: "Sunlit oranges and beach glass.", vars: SUMMER_THEME_VARS },
    { id: "fall", title: "Fall", desc: "Amber leaves over deep espresso.", vars: FALL_THEME_VARS },
    { id: "winter", title: "Winter", desc: "Frosted blues with polar glow.", vars: WINTER_THEME_VARS },
    { id: "spring", title: "Spring", desc: "Fresh mint with blossom accents.", vars: SPRING_THEME_VARS },
    {
      id: "aurora",
      title: "Aurora Glow",
      desc: "Vibrant purple-teal gradient",
      vars: {
        "--color-brand": "#8b5cf6",
        "--color-accent": "#22d3ee",
        "--gradient-brand": "linear-gradient(120deg,#8b5cf6 0%,#6366f1 55%,#22d3ee 100%)",
        "--cta-gradient": "linear-gradient(120deg,#7c3aed 0%,#6366f1 55%,#22d3ee 100%)",
        "--app-bg":
          "radial-gradient(1200px 720px at 0% 0%, rgba(139,92,246,0.18), transparent 60%), radial-gradient(1020px 680px at 100% 0%, rgba(34,211,238,0.14), transparent 62%), linear-gradient(90deg, rgba(139,92,246,0.12), rgba(99,102,241,0.06), rgba(5,10,27,0), rgba(34,211,238,0.06), rgba(34,211,238,0.12)), #050a1b",
      },
    },
    {
      id: "noir",
      title: "Midnight Noir",
      desc: "Deep navy + cyan",
      vars: {
        "--color-brand": "#38bdf8",
        "--color-accent": "#7dd3fc",
        "--cta-gradient": "linear-gradient(120deg,#0ea5e9 0%,#38bdf8 55%,#7dd3fc 100%)",
        "--gradient-brand": "linear-gradient(120deg,#1e3a8a 0%,#0ea5e9 55%,#38bdf8 100%)",
        "--glass-bg-1": "rgba(255,255,255,0.08)",
        "--glass-bg-2": "rgba(255,255,255,0.045)",
        "--card-bg-1": "rgba(17, 24, 39, 0.86)",
        "--card-bg-2": "rgba(17, 24, 39, 0.74)",
        "--card-border": "rgba(255,255,255,0.12)",
        "--card-shadow": "0 18px 40px rgba(2,6,23,0.5)",
        "--app-bg":
          "radial-gradient(1000px 640px at 10% 0%, rgba(2,132,199,0.14), transparent 60%), radial-gradient(880px 520px at 90% 0%, rgba(2,6,23,0.5), transparent 62%), linear-gradient(90deg, rgba(15,23,42,0.65), rgba(2,6,23,0.55), rgba(2,6,23,0.6)), #030814",
      },
    },
  ];
}

const PLACEHOLDER_THEMES: SavedStyle[] = [
  {
    id: "placeholder-neon",
    title: "Neon Pulse",
    summary: "Electric synthwave glow",
    description: "Electric gradients with synth glow.",
    vars: {
      "--color-brand": "#f472b6",
      "--color-accent": "#22d3ee",
      "--gradient-brand": "linear-gradient(120deg,#f472b6 0%,#a855f7 60%,#22d3ee 100%)",
      "--cta-gradient": "linear-gradient(120deg,#f472b6 0%,#a855f7 70%,#22d3ee 100%)",
      "--app-bg":
        "radial-gradient(1100px 680px at 10% -10%, rgba(244,114,182,0.18), transparent 64%), radial-gradient(900px 600px at 100% 0%, rgba(34,211,238,0.16), transparent 66%), linear-gradient(90deg, rgba(18,22,46,0.92), rgba(10,12,32,0.92))",
    },
    createdLabel: null,
  },
  {
    id: "placeholder-ocean",
    title: "Ocean Mist",
    summary: "Calming teal shoreline",
    description: "Glass blues inspired by coastal dawns.",
    vars: {
      "--color-brand": "#0ea5e9",
      "--color-accent": "#14b8a6",
      "--gradient-brand": "linear-gradient(120deg,#0ea5e9 0%,#14b8a6 55%,#38bdf8 100%)",
      "--cta-gradient": "linear-gradient(120deg,#22d3ee 0%,#0ea5e9 65%,#14b8a6 100%)",
      "--app-bg":
        "radial-gradient(1200px 720px at 0% -10%, rgba(14,165,233,0.16), transparent 62%), radial-gradient(1000px 600px at 100% 0%, rgba(13,148,136,0.18), transparent 66%), linear-gradient(90deg, rgba(8,18,40,0.94), rgba(6,12,30,0.94))",
    },
    createdLabel: null,
  },
  {
    id: "placeholder-sunset",
    title: "Sunset Haze",
    summary: "Warm citrus horizon",
    description: "Amber and magenta with soft haze.",
    vars: {
      "--color-brand": "#fb923c",
      "--color-accent": "#f97316",
      "--gradient-brand": "linear-gradient(120deg,#fb7185 0%,#f97316 55%,#f59e0b 100%)",
      "--cta-gradient": "linear-gradient(120deg,#fb923c 0%,#f97316 50%,#ef4444 100%)",
      "--app-bg":
        "radial-gradient(1200px 720px at 0% -20%, rgba(249,115,22,0.16), transparent 62%), radial-gradient(1000px 620px at 100% 0%, rgba(236,72,153,0.18), transparent 66%), linear-gradient(90deg, rgba(22,12,32,0.95), rgba(12,8,24,0.95))",
    },
    createdLabel: null,
  },
  {
    id: "placeholder-forest",
    title: "Forest Canopy",
    summary: "Emerald mist",
    description: "Emerald canopy with glass morning dew.",
    vars: {
      "--color-brand": "#10b981",
      "--color-accent": "#22d3ee",
      "--gradient-brand": "linear-gradient(120deg,#10b981 0%,#22d3ee 55%,#34d399 100%)",
      "--cta-gradient": "linear-gradient(120deg,#22d3ee 0%,#34d399 55%,#0ea5e9 100%)",
      "--app-bg":
        "radial-gradient(1100px 680px at 0% -10%, rgba(16,185,129,0.18), transparent 64%), radial-gradient(1000px 620px at 100% 0%, rgba(14,165,233,0.16), transparent 68%), linear-gradient(90deg, rgba(10,18,28,0.95), rgba(8,16,24,0.95))",
    },
    createdLabel: null,
  },
  {
    id: "placeholder-stardust",
    title: "Stardust",
    summary: "Iridescent midnight",
    description: "Cosmic purples with starlit grain.",
    vars: {
      "--color-brand": "#a855f7",
      "--color-accent": "#6366f1",
      "--gradient-brand": "linear-gradient(120deg,#6366f1 0%,#a855f7 55%,#22d3ee 100%)",
      "--cta-gradient": "linear-gradient(120deg,#4f46e5 0%,#7c3aed 60%,#22d3ee 100%)",
      "--app-bg":
        "radial-gradient(1200px 720px at 0% -20%, rgba(99,102,241,0.16), transparent 64%), radial-gradient(1000px 640px at 100% 0%, rgba(168,85,247,0.18), transparent 66%), linear-gradient(90deg, rgba(10,14,32,0.95), rgba(6,10,24,0.96))",
    },
    createdLabel: null,
  },
  {
    id: "placeholder-cyber",
    title: "Cyber Grid",
    summary: "Glitch teal",
    description: "Cyberpunk cyan with grid glow.",
    vars: {
      "--color-brand": "#22d3ee",
      "--color-accent": "#6366f1",
      "--gradient-brand": "linear-gradient(120deg,#22d3ee 0%,#0ea5e9 50%,#6366f1 100%)",
      "--cta-gradient": "linear-gradient(120deg,#22d3ee 0%,#38bdf8 60%,#8b5cf6 100%)",
      "--app-bg":
        "radial-gradient(1100px 660px at 0% -20%, rgba(34,211,238,0.18), transparent 64%), radial-gradient(900px 580px at 100% 0%, rgba(99,102,241,0.18), transparent 66%), linear-gradient(90deg, rgba(6,14,28,0.96), rgba(4,12,24,0.96))",
    },
    createdLabel: null,
  },
];

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

export function ThemeStyleCarousel() {
  const { user, isLoaded } = useCurrentUser();
  const envelope = React.useMemo(() => (user ? buildMemoryEnvelope(user) : null), [user]);

  const basePresets = React.useMemo(() => builtInPresets(), []);
  const placeholderThemes = React.useMemo(() => PLACEHOLDER_THEMES, []);

  const envelopeRef = React.useRef(envelope);
  React.useEffect(() => {
    envelopeRef.current = envelope;
  }, [envelope]);

  const [savedStyles, setSavedStyles] = React.useState<SavedStyle[]>([]);
  const [headerMenuOpen, setHeaderMenuOpen] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [previewingId, setPreviewingId] = React.useState<string | null>(null);
  const [activeMode, setActiveMode] = React.useState<"light" | "dark">(getTheme());
  const [activeId, setActiveId] = React.useState<string | null>(null);
  const [canLeft, setCanLeft] = React.useState(false);
  const [canRight, setCanRight] = React.useState(false);
  const [hasOverflow, setHasOverflow] = React.useState(false);

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
      setActiveId("preset:default");
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
    }
  }, [basePresets]);

  const listRef = React.useRef<HTMLDivElement | null>(null);
  const itemWidthRef = React.useRef(0);
  const dragRef = React.useRef({ active: false, startX: 0, startLeft: 0, moved: false });


  const itemsCount = items.length;

  const measureItems = React.useCallback(() => {
    const el = listRef.current;
    if (!el || !itemsCount) return;
    const firstSlide = el.querySelector<HTMLElement>(`.${styles.slide}`);
    if (!firstSlide) return;
    const gap = parseFloat(getComputedStyle(el).columnGap || "0");
    const width = firstSlide.getBoundingClientRect().width + gap;
    itemWidthRef.current = width > 0 ? width : el.clientWidth;
  }, [itemsCount]);

  const updateScrollState = React.useCallback(() => {
    const el = listRef.current;
    if (!el) {
      setCanLeft(false);
      setCanRight(false);
      setHasOverflow(false);
      return;
    }
    const maxScroll = Math.max(0, el.scrollWidth - el.clientWidth);
    const fallbackSpan = itemWidthRef.current || 240;
    const overflow = maxScroll > 1 || (itemsCount * fallbackSpan) > (el.clientWidth + 1);
    setHasOverflow(overflow);
    if (!overflow) {
      setCanLeft(false);
      setCanRight(false);
      return;
    }
    const left = el.scrollLeft;
    setCanLeft(left > 4);
    setCanRight(left < maxScroll - 4);
  }, []);

  const scrollByPage = React.useCallback(
    (dir: 1 | -1) => {
      const el = listRef.current;
      if (!el) return;
      const maxScroll = Math.max(0, el.scrollWidth - el.clientWidth);
      if (maxScroll <= 0) return;

      const span = itemWidthRef.current || el.clientWidth;
      if (!span) return;

      const atStart = el.scrollLeft <= 4;
      const atEnd = el.scrollLeft >= maxScroll - 4;
      let target: number;

      if (dir > 0 && atEnd) {
        target = 0;
      } else if (dir < 0 && atStart) {
        target = maxScroll;
      } else {
        target = Math.max(0, Math.min(maxScroll, el.scrollLeft + dir * span));
      }

      el.scrollTo({ left: target, behavior: "smooth" });
      window.setTimeout(updateScrollState, 320);
    }, [updateScrollState]);

  React.useEffect(() => {
    if (!itemsCount) {
      setHasOverflow(false);
      setCanLeft(false);
      setCanRight(false);
      return;
    }
    const raf = requestAnimationFrame(() => {
      measureItems();
      updateScrollState();
    });
    return () => cancelAnimationFrame(raf);
  }, [itemsCount, measureItems, updateScrollState]);

  const handlePointerDown = React.useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const el = listRef.current;
    if (!el) return;
    try { (e.target as Element).setPointerCapture?.(e.pointerId); } catch {}
    dragRef.current.active = true;
    dragRef.current.moved = false;
    dragRef.current.startX = e.clientX;
    dragRef.current.startLeft = el.scrollLeft;
    // Disable snapping while dragging for smoother feel
    el.style.scrollSnapType = 'none';
  }, []);

  const handlePointerMove = React.useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current.active) return;
    const el = listRef.current;
    if (!el) return;
    const dx = e.clientX - dragRef.current.startX;
    if (Math.abs(dx) > 2) dragRef.current.moved = true;
    el.scrollLeft = dragRef.current.startLeft - dx;
    updateScrollState();
  }, [updateScrollState]);

  const endDrag = React.useCallback(() => {
    if (!dragRef.current.active) return;
    const el = listRef.current;
    dragRef.current.active = false;
    if (el) {
      // Re-enable snapping
      el.style.scrollSnapType = '';
    }
  }, []);

  const handleScroll = React.useCallback(() => {
    updateScrollState();
  }, [updateScrollState]);

  React.useEffect(() => {
    const resizeHandler = () => {
      measureItems();
      updateScrollState();
    };
    window.addEventListener("resize", resizeHandler);
    return () => window.removeEventListener("resize", resizeHandler);
  }, [measureItems, updateScrollState]);

  const startPreview = React.useCallback((entry: ThemeEntry) => {
    const id = getEntryId(entry);
    if (previewingId === id) return;
    setPreviewingId(id);
    const vars = entry.kind === "preset" ? entry.preset.vars : entry.saved.vars;
    if (Object.keys(vars).length) startPreviewThemeVars(vars);
  }, [previewingId]);

  const stopPreview = React.useCallback(() => {
    endPreviewThemeVars();
    setPreviewingId(null);
  }, []);

  React.useEffect(() => () => endPreviewThemeVars(), []);

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
          prev.map((style) => (style.id === entry.saved.id ? { ...style, title: next, summary: next, description: next } : style)),
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
    setHeaderMenuOpen(false);
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

  const hasRealSaved = savedStyles.length > 0;

  return (
    <div className={styles.wrap}>
      <div className={styles.headerRow}>
        <div className={styles.lead}>Preview before you apply. Your saved looks live here.</div>
        <div className={styles.headerActions}>
          <Button variant="secondary" size="sm" onClick={handleSaveCurrent}>
            Save current
          </Button>
          <div className={styles.headerMenu}>
            <button
              type="button"
              className={styles.ellipsisBtn}
              aria-label="More theme actions"
              aria-expanded={headerMenuOpen}
              onClick={() => setHeaderMenuOpen((value) => !value)}
            >
              ...
            </button>
            {headerMenuOpen ? (
              <div className={cm.menu} role="menu" style={{ right: 0, top: 40 }} onMouseLeave={() => setHeaderMenuOpen(false)}>
                <button
                  type="button"
                  className={`${cm.item} ${cm.danger}`.trim()}
                  role="menuitem"
                  onClick={handleDeleteAll}
                  disabled={!hasRealSaved}
                  aria-disabled={!hasRealSaved}
                >
                  Delete all saved
                </button>
              </div>
            ) : null}
          </div>
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

      <div className={styles.carousel}>
        {hasOverflow ? (
          <div className={`${styles.navOverlay} ${styles.navLeft}`.trim()}>
            <button
              type="button"
              className={styles.navArrow}
              aria-label="Scroll left"
              onClick={() => scrollByPage(-1)}
            >
              {"<"}
            </button>
          </div>
        ) : null}
        <div
          className={styles.track}
          ref={listRef} onPointerDown={handlePointerDown} onPointerMove={handlePointerMove} onPointerUp={endDrag} onPointerLeave={endDrag}
          onScroll={handleScroll}
          data-can-left={canLeft ? 'true' : 'false'}
          data-can-right={canRight ? 'true' : 'false'}
        >
          {items.map((entry, index) => {
            const baseId = getEntryId(entry);
            const key = `${baseId}::${index}`;
            const vars = entry.kind === "preset" ? entry.preset.vars : entry.saved.vars;
            const preview = buildThemePreview(vars);
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
              description = "Capsule AI custom theme";
            }
            const isActive = activeId === baseId;
            const isEditable = entry.kind === "saved" && !entry.saved.id.startsWith("placeholder-");
            const showPreviewMeta = groupBadges.length > 0 || palette.length > 0;
            return (
              <div key={key} className={styles.slide}>
                <div
                  className={`${promo.tile} ${isActive ? styles.activeTile : ""}`.trim()}
                  tabIndex={0}
                  onMouseEnter={() => startPreview(entry)}
                  onMouseLeave={stopPreview}
                  onFocus={() => startPreview(entry)}
                  onBlur={stopPreview}
                >
                  <div className={styles.tileHeader}>
                    <div className={styles.tileTitle}>{entry.kind === "preset" ? entry.preset.title : entry.saved.title}</div>
                    <div className={styles.tileBadge}>{entry.kind === "saved" ? "Saved" : "Preset"}</div>
                  </div>
                  <div className={`${promo.short} ${styles.previewHalf}`.trim()} style={buildPreviewStyle(vars)} aria-hidden>
                    <div className={styles.swatchBg} />
                    <div className={styles.swatchCard} />
                    {isActive ? <span className={styles.activeBadge}>Active</span> : null}
                  </div>
                  <div className={styles.descArea}>{description}</div>
                  {showPreviewMeta ? (
                    <div className={styles.previewMeta}>
                      {groupBadges.length ? (
                        <div className={styles.previewTags}>
                          {groupBadges.map(({ group }) => (
                            <span key={`${baseId}-group-${group.id}`} className={styles.previewTag}>
                              {group.label}
                            </span>
                          ))}
                        </div>
                      ) : null}
                      {palette.length ? (
                        <div className={styles.previewPalette} aria-hidden>
                          {palette.map((value, swatchIndex) => (
                            <span
                              key={`${baseId}-swatch-${swatchIndex}`}
                              className={styles.previewColor}
                              style={{ background: value }}
                            />
                          ))}
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                  <div className={styles.buttonRow}>
                    <Button variant="primary" size="sm" onClick={() => handleApply(entry)}>
                      Apply
                    </Button>
                    <Button variant="secondary" size="sm" onClick={() => isEditable && handleRename(entry)} disabled={!isEditable}>
                      Rename
                    </Button>
                    <Button variant="secondary" size="sm" onClick={() => isEditable && handleDelete(entry)} disabled={!isEditable}>
                      Delete
                    </Button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        {hasOverflow ? (
          <div className={`${styles.navOverlay} ${styles.navRight}`.trim()}>
            <button
              type="button"
              className={styles.navArrow}
              aria-label="Scroll right"
              onClick={() => scrollByPage(1)}
            >
              {">"}
            </button>
          </div>
        ) : null}
      </div>
      {loading ? <div className={styles.meta}>Loading...</div> : null}
    </div>
  );
}












