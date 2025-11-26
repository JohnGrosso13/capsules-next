/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck
import type { Appearance } from "@clerk/types";

type AppearanceOverrides = Partial<Appearance> & {
  elements?: Appearance["elements"];
  variables?: Appearance["variables"];
  layout?: Appearance["layout"];
};

const glassPanel: Record<string, unknown> = {
  background:
    "linear-gradient(145deg, color-mix(in srgb, var(--surface-elevated, rgba(17,22,45,0.9)) 86%, rgba(255,255,255,0.1) 14%), color-mix(in srgb, var(--surface-overlay, rgba(10,14,30,0.72)) 90%, rgba(34,211,238,0.12) 10%))",
  border:
    "1px solid color-mix(in srgb, var(--color-border, rgba(255,255,255,0.14)) 76%, var(--color-brand, #6366f1) 24%)",
  boxShadow:
    "0 20px 48px color-mix(in srgb, var(--color-brand, #6366f1) 20%, rgba(5,10,30,0.55)), inset 0 1px 0 rgba(255,255,255,0.14)",
  backdropFilter: "blur(18px) saturate(140%)",
  WebkitBackdropFilter: "blur(18px) saturate(140%)",
  color: "var(--color-fg, #f8fafc)",
  borderRadius: "18px",
} satisfies Appearance["elements"][string];

const softAction: Record<string, unknown> = {
  borderRadius: "14px",
  background:
    "linear-gradient(155deg, color-mix(in srgb, var(--surface-elevated, rgba(17,22,45,0.86)) 88%, rgba(255,255,255,0.12) 12%), color-mix(in srgb, var(--surface-muted, rgba(17,22,45,0.8)) 90%, rgba(99,102,241,0.14) 10%))",
  border:
    "1px solid color-mix(in srgb, var(--color-border, rgba(255,255,255,0.16)) 78%, var(--color-brand, #6366f1) 22%)",
  boxShadow:
    "inset 0 1px 0 rgba(255,255,255,0.12), inset 0 -1px 0 color-mix(in srgb, var(--app-bg, #050a1b) 22%, transparent), 0 12px 30px color-mix(in srgb, var(--color-brand, #6366f1) 20%, rgba(5,10,30,0.36))",
  color: "var(--color-fg, #f8fafc)",
} satisfies Appearance["elements"][string];

const iconBadge: Record<string, unknown> = {
  background:
    "linear-gradient(135deg, color-mix(in srgb, var(--color-brand, #6366f1) 32%, transparent), color-mix(in srgb, var(--color-accent, #22d3ee) 18%, transparent))",
  border: "1px solid color-mix(in srgb, var(--color-brand, #6366f1) 55%, transparent)",
  boxShadow:
    "0 8px 18px color-mix(in srgb, var(--color-brand, #6366f1) 22%, rgba(5,10,30,0.35)), inset 0 1px 0 rgba(255,255,255,0.25)",
  color: "var(--color-brand-foreground, #f8fafc)",
} satisfies Appearance["elements"][string];

const mutedText: Record<string, unknown> = {
  color: "var(--color-fg-muted, rgba(255,255,255,0.78))",
};

export const clerkAppearance: Appearance = {
  layout: { shimmer: false },
  variables: {
    colorPrimary: "var(--color-brand, #6366f1)",
    colorText: "var(--color-fg, #f8fafc)",
    colorTextSecondary: "var(--color-fg-muted, rgba(255,255,255,0.78))",
    colorBackground: "transparent",
    colorModalBackdrop: "rgba(5,10,26,0.78)",
    colorInputBackground:
      "color-mix(in srgb, var(--surface-elevated, rgba(17,22,45,0.86)) 90%, rgba(255,255,255,0.08) 10%)",
    colorInputText: "var(--color-fg, #f8fafc)",
    colorShimmer: "color-mix(in srgb, var(--color-brand, #6366f1) 35%, rgba(255,255,255,0.25))",
    borderRadius: "16px",
    fontFamily: 'var(--font-sans, "Inter", "Segoe UI Variable", system-ui, sans-serif)',
  },
    elements: {
      rootBox: { color: "var(--color-fg, #f8fafc)" },
    card: { ...glassPanel, padding: "18px" },
    headerTitle: { letterSpacing: "-0.01em", color: "var(--color-fg, #f8fafc)" },
    headerSubtitle: mutedText,
    footer: mutedText,
    avatarBox: {
      boxShadow:
        "inset 0 0 0 1px color-mix(in srgb, var(--color-border, rgba(255,255,255,0.14)) 82%, transparent), 0 10px 24px rgba(5,10,30,0.32)",
      background:
        "linear-gradient(180deg, color-mix(in srgb, var(--surface-elevated, rgba(17,22,45,0.86)) 88%, rgba(255,255,255,0.12) 12%), color-mix(in srgb, var(--surface-muted, rgba(17,22,45,0.8)) 90%, rgba(99,102,241,0.12) 10%))",
      border:
        "1px solid color-mix(in srgb, var(--color-border, rgba(255,255,255,0.16)) 70%, var(--color-brand, #6366f1) 30%)",
    },
    formButtonPrimary: {
      ...softAction,
      background:
        "linear-gradient(120deg, color-mix(in srgb, var(--color-brand, #6366f1) 82%, var(--color-accent, #22d3ee) 18%), color-mix(in srgb, var(--color-accent, #22d3ee) 64%, #7ce0ff 36%))",
      color: "var(--color-brand-foreground, #f8fafc)",
      boxShadow:
        "0 16px 32px color-mix(in srgb, var(--color-brand, #6366f1) 32%, rgba(5,10,30,0.38)), inset 0 1px 0 rgba(255,255,255,0.22)",
    },
    formFieldInput: {
      ...glassPanel,
      background:
        "color-mix(in srgb, var(--surface-elevated, rgba(17,22,45,0.86)) 92%, rgba(255,255,255,0.08) 8%)",
      boxShadow:
        "inset 0 1px 0 rgba(255,255,255,0.12), inset 0 -1px 0 color-mix(in srgb, var(--app-bg, #050a1b) 18%, transparent)",
      padding: "12px 14px",
    },
    userButtonPopoverCard: { ...glassPanel, padding: "14px" },
    userButtonPopoverMain: { padding: "4px 0 0", gap: "10px" },
    userButtonPopoverActions: { display: "grid", gap: "10px" },
    userButtonPopoverActionButton: softAction,
    userButtonPopoverActionButton__signOut: {
      ...softAction,
      background:
        "linear-gradient(155deg, color-mix(in srgb, rgba(248,113,113,0.18) 60%, var(--surface-elevated, rgba(17,22,45,0.86)) 40%), color-mix(in srgb, rgba(248,113,113,0.14), rgba(255,255,255,0.04)))",
      border: "1px solid color-mix(in srgb, var(--color-danger, #f87171) 55%, rgba(255,255,255,0.14))",
    },
    userButtonPopoverActionButtonIconBox: iconBadge,
    userButtonPopoverCustomItemButton: softAction,
    userButtonPopoverCustomItemButtonIconBox: iconBadge,
    userButtonPopoverFooter: {
      ...mutedText,
      background:
        "linear-gradient(180deg, color-mix(in srgb, var(--surface-elevated, rgba(17,22,45,0.86)) 90%, rgba(255,255,255,0.06) 10%), color-mix(in srgb, var(--surface-muted, rgba(17,22,45,0.8)) 92%, rgba(34,211,238,0.1) 8%))",
      borderTop:
        "1px solid color-mix(in srgb, var(--color-border, rgba(255,255,255,0.16)) 75%, var(--color-brand, #6366f1) 25%)",
      boxShadow: "inset 0 1px 0 rgba(255,255,255,0.1)",
      paddingTop: "12px",
    },
    modalBackdrop: {
      background:
        "radial-gradient(120% 120% at 50% 20%, rgba(12,16,32,0.66), transparent 65%), rgba(5,10,26,0.82)",
      backdropFilter: "blur(14px)",
      WebkitBackdropFilter: "blur(14px)",
    },
    modalContent: {
      ...glassPanel,
      background:
        "linear-gradient(185deg, color-mix(in srgb, var(--surface-elevated, rgba(10,14,30,0.94)) 88%, rgba(255,255,255,0.08) 12%), color-mix(in srgb, var(--surface-muted, rgba(10,14,30,0.9)) 92%, rgba(99,102,241,0.12) 8%))",
      border: "1px solid color-mix(in srgb, var(--color-border, rgba(255,255,255,0.18)) 75%, var(--color-brand, #6366f1) 25%)",
    },
  },
} as Appearance;

export function buildClerkAppearance(overrides?: AppearanceOverrides): Appearance {
  if (!overrides) return clerkAppearance;
  return {
    ...clerkAppearance,
    ...overrides,
    layout: { ...clerkAppearance.layout, ...(overrides.layout ?? {}) },
    variables: { ...clerkAppearance.variables, ...(overrides.variables ?? {}) },
    elements: { ...clerkAppearance.elements, ...(overrides.elements ?? {}) } as Appearance["elements"],
  } as Appearance;
}

export function buildUserButtonAppearance(options?: {
  avatarBoxClassName?: string;
  elements?: Appearance["elements"];
}): Appearance {
  const elementOverrides: Appearance["elements"] = {
    rootBox: { width: "100%", height: "100%" },
    userButtonTrigger: {
      width: "100%",
      height: "100%",
      padding: 0,
      borderRadius: "999px",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      overflow: "hidden",
    },
    userButtonAvatarBox: {
      width: "100%",
      height: "100%",
      borderRadius: "999px",
    },
    ...(options?.avatarBoxClassName ? { avatarBox: options.avatarBoxClassName } : {}),
    ...(options?.elements ?? {}),
  };
  return buildClerkAppearance({ elements: elementOverrides }) as Appearance;
}
