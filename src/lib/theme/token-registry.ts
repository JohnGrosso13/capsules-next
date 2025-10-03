/**
 * Registry of semantic design tokens that map to CSS custom properties.
 * This powers Tailwind integration, runtime sanitisation, and AI styling prompts.
 */
export type CSSVariableName = `--${string}`;

export type ThemeTokenCategory =
  | "surface"
  | "text"
  | "border"
  | "brand"
  | "feedback"
  | "typography"
  | "radius"
  | "shadow"
  | "ring"
  | "glass"
  | "card"
  | "dock"
  | "presence"
  | "layout"
  | "spacing"
  | "motion"
  | "utility";

export type ThemeTokenValueKind =
  | "color"
  | "gradient"
  | "shadow"
  | "fontFamily"
  | "radius"
  | "dimension"
  | "time"
  | "timingFunction"
  | "other";

type TailwindGroup = "colors" | "borderRadius" | "fontFamily" | "boxShadow" | "backgroundImage" | "spacing" | "transitionDuration" | "transitionTimingFunction";

export interface ThemeTokenDefinition {
  readonly id: string;
  readonly label: string;
  readonly cssVar: CSSVariableName;
  readonly category: ThemeTokenCategory;
  readonly valueKind: ThemeTokenValueKind;
  readonly description?: string;
  readonly tags?: readonly string[];
  readonly tailwind?: {
    readonly path: readonly [TailwindGroup, ...string[]];
  };
}

export const themeTokenRegistry = [
  {
    id: "surface.app",
    label: "Surface / App Base",
    cssVar: "--surface-app",
    category: "surface",
    valueKind: "color",
    tags: ["background", "app"],
    tailwind: {
      path: ["colors", "background"],
    },
  },
  {
    id: "surface.muted",
    label: "Surface / Muted Panel",
    cssVar: "--surface-muted",
    category: "surface",
    valueKind: "color",
    tags: ["panel", "muted"],
    tailwind: {
      path: ["colors", "surface", "muted"],
    },
  },
  {
    id: "surface.elevated",
    label: "Surface / Elevated Panel",
    cssVar: "--surface-elevated",
    category: "surface",
    valueKind: "color",
    tags: ["panel", "elevated"],
    tailwind: {
      path: ["colors", "surface", "elevated"],
    },
  },
  {
    id: "surface.overlay",
    label: "Surface / Overlay",
    cssVar: "--surface-overlay",
    category: "surface",
    valueKind: "color",
    tags: ["overlay", "scrim"],
    tailwind: {
      path: ["colors", "surface", "overlay"],
    },
  },
  {
    id: "surface.app-fallback",
    label: "Surface / App Fallback",
    cssVar: "--app-bg",
    category: "surface",
    valueKind: "gradient",
    tags: ["background", "fallback"],
  },
  {
    id: "text.default",
    label: "Text / Default",
    cssVar: "--color-fg",
    category: "text",
    valueKind: "color",
    tags: ["text", "primary"],
    tailwind: {
      path: ["colors", "fg", "DEFAULT"],
    },
  },
  {
    id: "text.muted",
    label: "Text / Muted",
    cssVar: "--color-fg-muted",
    category: "text",
    valueKind: "color",
    tags: ["text", "muted"],
    tailwind: {
      path: ["colors", "fg", "muted"],
    },
  },
  {
    id: "text.subtle",
    label: "Text / Subtle",
    cssVar: "--color-fg-subtle",
    category: "text",
    valueKind: "color",
    tags: ["text", "subtle"],
    tailwind: {
      path: ["colors", "fg", "subtle"],
    },
  },
  {
    id: "text.on-brand",
    label: "Text / On Brand",
    cssVar: "--text-on-brand",
    category: "text",
    valueKind: "color",
    tags: ["text", "brand", "contrast"],
  },
  {
    id: "border.default",
    label: "Border / Default",
    cssVar: "--color-border",
    category: "border",
    valueKind: "color",
    tags: ["border", "divider"],
    tailwind: {
      path: ["colors", "border", "DEFAULT"],
    },
  },
  {
    id: "border.strong",
    label: "Border / Strong",
    cssVar: "--color-border-strong",
    category: "border",
    valueKind: "color",
    tags: ["border", "strong"],
    tailwind: {
      path: ["colors", "border", "strong"],
    },
  },
  {
    id: "brand.primary",
    label: "Brand / Primary",
    cssVar: "--color-brand",
    category: "brand",
    valueKind: "color",
    tags: ["brand", "accent"],
    tailwind: {
      path: ["colors", "brand", "DEFAULT"],
    },
  },
  {
    id: "brand.strong",
    label: "Brand / Strong",
    cssVar: "--color-brand-strong",
    category: "brand",
    valueKind: "color",
    tags: ["brand", "emphasis"],
    tailwind: {
      path: ["colors", "brand", "strong"],
    },
  },
  {
    id: "brand.foreground",
    label: "Brand / Foreground",
    cssVar: "--color-brand-foreground",
    category: "brand",
    valueKind: "color",
    tags: ["brand", "contrast"],
    tailwind: {
      path: ["colors", "brand", "foreground"],
    },
  },
  {
    id: "brand.muted",
    label: "Brand / Muted",
    cssVar: "--color-brand-muted",
    category: "brand",
    valueKind: "color",
    tags: ["brand", "muted"],
    tailwind: {
      path: ["colors", "brand", "muted"],
    },
  },
  {
    id: "brand.gradient",
    label: "Brand / Gradient",
    cssVar: "--gradient-brand",
    category: "brand",
    valueKind: "gradient",
    tags: ["brand", "gradient"],
    tailwind: {
      path: ["backgroundImage", "brand-gradient"],
    },
  },
  {
    id: "brand.cta-gradient",
    label: "Brand / CTA Gradient",
    cssVar: "--cta-gradient",
    category: "brand",
    valueKind: "gradient",
    tags: ["brand", "cta"],
  },
  {
    id: "brand.cta-text",
    label: "Brand / CTA Text",
    cssVar: "--cta-button-text",
    category: "brand",
    valueKind: "color",
    tags: ["brand", "cta", "text"],
  },
  {
    id: "brand.accent",
    label: "Brand / Accent",
    cssVar: "--color-accent",
    category: "brand",
    valueKind: "color",
    tags: ["accent", "highlight"],
    tailwind: {
      path: ["colors", "accent"],
    },
  },
  {
    id: "feedback.info",
    label: "Feedback / Info",
    cssVar: "--color-info",
    category: "feedback",
    valueKind: "color",
    tags: ["info", "status"],
    tailwind: {
      path: ["colors", "info"],
    },
  },
  {
    id: "feedback.success",
    label: "Feedback / Success",
    cssVar: "--color-success",
    category: "feedback",
    valueKind: "color",
    tags: ["success", "status"],
    tailwind: {
      path: ["colors", "success"],
    },
  },
  {
    id: "feedback.warning",
    label: "Feedback / Warning",
    cssVar: "--color-warning",
    category: "feedback",
    valueKind: "color",
    tags: ["warning", "status"],
    tailwind: {
      path: ["colors", "warning"],
    },
  },
  {
    id: "feedback.danger",
    label: "Feedback / Danger",
    cssVar: "--color-danger",
    category: "feedback",
    valueKind: "color",
    tags: ["danger", "status"],
    tailwind: {
      path: ["colors", "danger"],
    },
  },
  {
    id: "typography.sans",
    label: "Typography / Sans",
    cssVar: "--font-sans",
    category: "typography",
    valueKind: "fontFamily",
    tags: ["font", "sans"],
    tailwind: {
      path: ["fontFamily", "sans"],
    },
  },
  {
    id: "typography.display",
    label: "Typography / Display",
    cssVar: "--font-display",
    category: "typography",
    valueKind: "fontFamily",
    tags: ["font", "display"],
    tailwind: {
      path: ["fontFamily", "display"],
    },
  },
  {
    id: "typography.mono",
    label: "Typography / Mono",
    cssVar: "--font-mono",
    category: "typography",
    valueKind: "fontFamily",
    tags: ["font", "mono"],
    tailwind: {
      path: ["fontFamily", "mono"],
    },
  },
  {
    id: "radius.xs",
    label: "Radius / XS",
    cssVar: "--radius-xs",
    category: "radius",
    valueKind: "radius",
    tags: ["radius", "xs"],
    tailwind: {
      path: ["borderRadius", "xs"],
    },
  },
  {
    id: "radius.sm",
    label: "Radius / SM",
    cssVar: "--radius-sm",
    category: "radius",
    valueKind: "radius",
    tags: ["radius", "sm"],
    tailwind: {
      path: ["borderRadius", "sm"],
    },
  },
  {
    id: "radius.md",
    label: "Radius / MD",
    cssVar: "--radius-md",
    category: "radius",
    valueKind: "radius",
    tags: ["radius", "md"],
    tailwind: {
      path: ["borderRadius", "md"],
    },
  },
  {
    id: "radius.lg",
    label: "Radius / LG",
    cssVar: "--radius-lg",
    category: "radius",
    valueKind: "radius",
    tags: ["radius", "lg"],
    tailwind: {
      path: ["borderRadius", "lg"],
    },
  },
  {
    id: "radius.xl",
    label: "Radius / XL",
    cssVar: "--radius-xl",
    category: "radius",
    valueKind: "radius",
    tags: ["radius", "xl"],
    tailwind: {
      path: ["borderRadius", "xl"],
    },
  },
  {
    id: "radius.2xl",
    label: "Radius / 2XL",
    cssVar: "--radius-2xl",
    category: "radius",
    valueKind: "radius",
    tags: ["radius", "2xl"],
    tailwind: {
      path: ["borderRadius", "2xl"],
    },
  },
  {
    id: "radius.pill",
    label: "Radius / Pill",
    cssVar: "--radius-pill",
    category: "radius",
    valueKind: "radius",
    tags: ["radius", "pill"],
    tailwind: {
      path: ["borderRadius", "pill"],
    },
  },
  {
    id: "shadow.xs",
    label: "Shadow / XS",
    cssVar: "--shadow-xs",
    category: "shadow",
    valueKind: "shadow",
    tags: ["shadow", "xs"],
    tailwind: {
      path: ["boxShadow", "xs"],
    },
  },
  {
    id: "shadow.sm",
    label: "Shadow / SM",
    cssVar: "--shadow-sm",
    category: "shadow",
    valueKind: "shadow",
    tags: ["shadow", "sm"],
    tailwind: {
      path: ["boxShadow", "sm"],
    },
  },
  {
    id: "shadow.md",
    label: "Shadow / MD",
    cssVar: "--shadow-md",
    category: "shadow",
    valueKind: "shadow",
    tags: ["shadow", "md"],
    tailwind: {
      path: ["boxShadow", "md"],
    },
  },
  {
    id: "shadow.lg",
    label: "Shadow / LG",
    cssVar: "--shadow-lg",
    category: "shadow",
    valueKind: "shadow",
    tags: ["shadow", "lg"],
    tailwind: {
      path: ["boxShadow", "lg"],
    },
  },
  {
    id: "shadow.xl",
    label: "Shadow / XL",
    cssVar: "--shadow-xl",
    category: "shadow",
    valueKind: "shadow",
    tags: ["shadow", "xl"],
    tailwind: {
      path: ["boxShadow", "xl"],
    },
  },
  {
    id: "shadow.glow",
    label: "Shadow / Glow",
    cssVar: "--shadow-glow",
    category: "shadow",
    valueKind: "shadow",
    tags: ["shadow", "glow", "brand"],
    tailwind: {
      path: ["boxShadow", "glow"],
    },
  },
  {
    id: "ring.primary",
    label: "Ring / Primary",
    cssVar: "--ring-primary",
    category: "ring",
    valueKind: "shadow",
    tags: ["ring", "focus"],
  },
  {
    id: "ring.offset",
    label: "Ring / Offset",
    cssVar: "--ring-offset",
    category: "ring",
    valueKind: "shadow",
    tags: ["ring", "offset"],
  },
  {
    id: "glass.bg-1",
    label: "Glass / Background 1",
    cssVar: "--glass-bg-1",
    category: "glass",
    valueKind: "color",
    tags: ["glass", "background"],
  },
  {
    id: "glass.bg-2",
    label: "Glass / Background 2",
    cssVar: "--glass-bg-2",
    category: "glass",
    valueKind: "color",
    tags: ["glass", "background"],
  },
  {
    id: "card.bg-1",
    label: "Card / Background 1",
    cssVar: "--card-bg-1",
    category: "card",
    valueKind: "color",
    tags: ["card", "background"],
  },
  {
    id: "card.bg-2",
    label: "Card / Background 2",
    cssVar: "--card-bg-2",
    category: "card",
    valueKind: "color",
    tags: ["card", "background"],
  },
  {
    id: "card.border",
    label: "Card / Border",
    cssVar: "--card-border",
    category: "card",
    valueKind: "color",
    tags: ["card", "border"],
  },
  {
    id: "dock.bg-1",
    label: "Dock / Background 1",
    cssVar: "--dock-bg-1",
    category: "dock",
    valueKind: "color",
    tags: ["dock", "background"],
  },
  {
    id: "dock.bg-2",
    label: "Dock / Background 2",
    cssVar: "--dock-bg-2",
    category: "dock",
    valueKind: "color",
    tags: ["dock", "background"],
  },
  {
    id: "dock.border",
    label: "Dock / Border",
    cssVar: "--dock-border",
    category: "dock",
    valueKind: "color",
    tags: ["dock", "border"],
  },
  {
    id: "dock.shadow",
    label: "Dock / Shadow",
    cssVar: "--dock-shadow",
    category: "dock",
    valueKind: "shadow",
    tags: ["dock", "shadow"],
  },
  {
    id: "dock.text-muted",
    label: "Dock / Text Muted",
    cssVar: "--dock-text-muted",
    category: "dock",
    valueKind: "color",
    tags: ["dock", "text"],
  },
  {
    id: "dock.btn-bg-1",
    label: "Dock Button / Background 1",
    cssVar: "--dock-btn-bg-1",
    category: "dock",
    valueKind: "color",
    tags: ["dock", "button"],
  },
  {
    id: "dock.btn-bg-2",
    label: "Dock Button / Background 2",
    cssVar: "--dock-btn-bg-2",
    category: "dock",
    valueKind: "color",
    tags: ["dock", "button"],
  },
  {
    id: "dock.btn-border",
    label: "Dock Button / Border",
    cssVar: "--dock-btn-border",
    category: "dock",
    valueKind: "color",
    tags: ["dock", "button", "border"],
  },
  {
    id: "dock.btn-border-hover",
    label: "Dock Button / Border Hover",
    cssVar: "--dock-btn-hover-border",
    category: "dock",
    valueKind: "color",
    tags: ["dock", "button", "hover"],
  },
  {
    id: "dock.active-shadow",
    label: "Dock / Active Shadow",
    cssVar: "--dock-active-shadow",
    category: "dock",
    valueKind: "shadow",
    tags: ["dock", "active"],
  },
  {
    id: "dock.active-glow",
    label: "Dock / Active Glow",
    cssVar: "--dock-active-glow",
    category: "dock",
    valueKind: "color",
    tags: ["dock", "active"],
  },
  {
    id: "dock.sheet-bg-1",
    label: "Dock Sheet / Background 1",
    cssVar: "--dock-sheet-bg-1",
    category: "dock",
    valueKind: "color",
    tags: ["dock", "sheet"],
  },
  {
    id: "dock.sheet-bg-2",
    label: "Dock Sheet / Background 2",
    cssVar: "--dock-sheet-bg-2",
    category: "dock",
    valueKind: "color",
    tags: ["dock", "sheet"],
  },
  {
    id: "dock.sheet-border",
    label: "Dock Sheet / Border",
    cssVar: "--dock-sheet-border",
    category: "dock",
    valueKind: "color",
    tags: ["dock", "sheet", "border"],
  },
  {
    id: "dock.sheet-shadow",
    label: "Dock Sheet / Shadow",
    cssVar: "--dock-sheet-shadow",
    category: "dock",
    valueKind: "shadow",
    tags: ["dock", "sheet", "shadow"],
  },
  {
    id: "presence.online-dot",
    label: "Presence / Online Dot",
    cssVar: "--presence-online-dot",
    category: "presence",
    valueKind: "color",
    tags: ["presence", "online"],
  },
  {
    id: "presence.online-dot-bright",
    label: "Presence / Online Dot Bright",
    cssVar: "--presence-online-dot-bright",
    category: "presence",
    valueKind: "color",
    tags: ["presence", "online", "glow"],
  },
  {
    id: "presence.online-ring",
    label: "Presence / Online Ring",
    cssVar: "--presence-online-ring",
    category: "presence",
    valueKind: "color",
    tags: ["presence", "online"],
  },
  {
    id: "presence.away-dot",
    label: "Presence / Away Dot",
    cssVar: "--presence-away-dot",
    category: "presence",
    valueKind: "color",
    tags: ["presence", "away"],
  },
  {
    id: "presence.away-ring",
    label: "Presence / Away Ring",
    cssVar: "--presence-away-ring",
    category: "presence",
    valueKind: "color",
    tags: ["presence", "away"],
  },
  {
    id: "presence.offline-dot",
    label: "Presence / Offline Dot",
    cssVar: "--presence-offline-dot",
    category: "presence",
    valueKind: "color",
    tags: ["presence", "offline"],
  },
  {
    id: "presence.offline-ring",
    label: "Presence / Offline Ring",
    cssVar: "--presence-offline-ring",
    category: "presence",
    valueKind: "color",
    tags: ["presence", "offline"],
  },
  {
    id: "space.3xs",
    label: "Space / 3XS",
    cssVar: "--space-3xs",
    category: "spacing",
    valueKind: "dimension",
    tags: ["spacing", "micro"],
    tailwind: {
      path: ["spacing", "space-3xs"],
    },
  },
  {
    id: "space.2xs",
    label: "Space / 2XS",
    cssVar: "--space-2xs",
    category: "spacing",
    valueKind: "dimension",
    tags: ["spacing", "dense"],
    tailwind: {
      path: ["spacing", "space-2xs"],
    },
  },
  {
    id: "space.xs",
    label: "Space / XS",
    cssVar: "--space-xs",
    category: "spacing",
    valueKind: "dimension",
    tags: ["spacing", "compact"],
    tailwind: {
      path: ["spacing", "space-xs"],
    },
  },
  {
    id: "space.sm",
    label: "Space / SM",
    cssVar: "--space-sm",
    category: "spacing",
    valueKind: "dimension",
    tags: ["spacing", "baseline"],
    tailwind: {
      path: ["spacing", "space-sm"],
    },
  },
  {
    id: "space.sm-plus",
    label: "Space / SM Plus",
    cssVar: "--space-sm-plus",
    category: "spacing",
    valueKind: "dimension",
    tags: ["spacing", "baseline"],
    tailwind: {
      path: ["spacing", "space-sm-plus"],
    },
  },
  {
    id: "space.md",
    label: "Space / MD",
    cssVar: "--space-md",
    category: "spacing",
    valueKind: "dimension",
    tags: ["spacing", "default"],
    tailwind: {
      path: ["spacing", "space-md"],
    },
  },
  {
    id: "space.md-plus",
    label: "Space / MD Plus",
    cssVar: "--space-md-plus",
    category: "spacing",
    valueKind: "dimension",
    tags: ["spacing", "default"],
    tailwind: {
      path: ["spacing", "space-md-plus"],
    },
  },
  {
    id: "space.lg",
    label: "Space / LG",
    cssVar: "--space-lg",
    category: "spacing",
    valueKind: "dimension",
    tags: ["spacing", "comfortable"],
    tailwind: {
      path: ["spacing", "space-lg"],
    },
  },
  {
    id: "space.lg-plus",
    label: "Space / LG Plus",
    cssVar: "--space-lg-plus",
    category: "spacing",
    valueKind: "dimension",
    tags: ["spacing", "comfortable"],
    tailwind: {
      path: ["spacing", "space-lg-plus"],
    },
  },
  {
    id: "space.xl",
    label: "Space / XL",
    cssVar: "--space-xl",
    category: "spacing",
    valueKind: "dimension",
    tags: ["spacing", "roomy"],
    tailwind: {
      path: ["spacing", "space-xl"],
    },
  },
  {
    id: "space.xl-plus",
    label: "Space / XL Plus",
    cssVar: "--space-xl-plus",
    category: "spacing",
    valueKind: "dimension",
    tags: ["spacing", "roomy"],
    tailwind: {
      path: ["spacing", "space-xl-plus"],
    },
  },
  {
    id: "space.2xl",
    label: "Space / 2XL",
    cssVar: "--space-2xl",
    category: "spacing",
    valueKind: "dimension",
    tags: ["spacing", "section"],
    tailwind: {
      path: ["spacing", "space-2xl"],
    },
  },
  {
    id: "space.3xl",
    label: "Space / 3XL",
    cssVar: "--space-3xl",
    category: "spacing",
    valueKind: "dimension",
    tags: ["spacing", "section"],
    tailwind: {
      path: ["spacing", "space-3xl"],
    },
  },
  {
    id: "space.4xl",
    label: "Space / 4XL",
    cssVar: "--space-4xl",
    category: "spacing",
    valueKind: "dimension",
    tags: ["spacing", "section"],
    tailwind: {
      path: ["spacing", "space-4xl"],
    },
  },
  {
    id: "space.5xl",
    label: "Space / 5XL",
    cssVar: "--space-5xl",
    category: "spacing",
    valueKind: "dimension",
    tags: ["spacing", "section"],
    tailwind: {
      path: ["spacing", "space-5xl"],
    },
  },
  {
    id: "space.6xl",
    label: "Space / 6XL",
    cssVar: "--space-6xl",
    category: "spacing",
    valueKind: "dimension",
    tags: ["spacing", "section"],
    tailwind: {
      path: ["spacing", "space-6xl"],
    },
  },
  {
    id: "space.7xl",
    label: "Space / 7XL",
    cssVar: "--space-7xl",
    category: "spacing",
    valueKind: "dimension",
    tags: ["spacing", "section"],
    tailwind: {
      path: ["spacing", "space-7xl"],
    },
  },
  {
    id: "space.8xl",
    label: "Space / 8XL",
    cssVar: "--space-8xl",
    category: "spacing",
    valueKind: "dimension",
    tags: ["spacing", "hero"],
    tailwind: {
      path: ["spacing", "space-8xl"],
    },
  },
  {
    id: "space.9xl",
    label: "Space / 9XL",
    cssVar: "--space-9xl",
    category: "spacing",
    valueKind: "dimension",
    tags: ["spacing", "hero"],
    tailwind: {
      path: ["spacing", "space-9xl"],
    },
  },
  {
    id: "layout.header-offset",
    label: "Layout / Header Offset",
    cssVar: "--layout-header-offset",
    category: "layout",
    valueKind: "dimension",
    tags: ["layout", "header", "offset"],
  },
  {
    id: "layout.desktop-bottom-padding",
    label: "Layout / Desktop Bottom Padding",
    cssVar: "--layout-desktop-bottom-padding",
    category: "layout",
    valueKind: "dimension",
    tags: ["layout", "spacing", "desktop"],
  },
  {
    id: "layout.page-width-offset",
    label: "Layout / Page Width Offset",
    cssVar: "--layout-page-width-offset",
    category: "layout",
    valueKind: "dimension",
    tags: ["layout", "spacing", "desktop"],
  },
  {
    id: "layout.page-gap",
    label: "Layout / Page Gap",
    cssVar: "--layout-page-gap",
    category: "layout",
    valueKind: "dimension",
    tags: ["layout", "spacing", "stack"],
  },
  {
    id: "layout.column-gap",
    label: "Layout / Column Gap",
    cssVar: "--layout-column-gap",
    category: "layout",
    valueKind: "dimension",
    tags: ["layout", "spacing", "grid"],
  },
  {
    id: "layout.mobile-top-offset",
    label: "Layout / Mobile Top Offset",
    cssVar: "--layout-mobile-top-offset",
    category: "layout",
    valueKind: "dimension",
    tags: ["layout", "spacing", "mobile"],
  },
  {
    id: "layout.mobile-bottom-offset",
    label: "Layout / Mobile Bottom Offset",
    cssVar: "--layout-mobile-bottom-offset",
    category: "layout",
    valueKind: "dimension",
    tags: ["layout", "spacing", "mobile"],
  },
  {
    id: "layout.mobile-outer-padding-bottom",
    label: "Layout / Mobile Outer Padding Bottom",
    cssVar: "--layout-mobile-outer-padding-bottom",
    category: "layout",
    valueKind: "dimension",
    tags: ["layout", "spacing", "mobile"],
  },
  {
    id: "layout.mobile-section-gap",
    label: "Layout / Mobile Section Gap",
    cssVar: "--layout-mobile-section-gap",
    category: "layout",
    valueKind: "dimension",
    tags: ["layout", "spacing", "mobile"],
  },
  {
    id: "layout.prompter-margin-bottom",
    label: "Layout / Prompter Margin Bottom",
    cssVar: "--layout-prompter-margin-bottom",
    category: "layout",
    valueKind: "dimension",
    tags: ["layout", "spacing", "prompter"],
  },
  {
    id: "layout.prompter-margin-bottom-mobile",
    label: "Layout / Prompter Margin Bottom Mobile",
    cssVar: "--layout-prompter-margin-bottom-mobile",
    category: "layout",
    valueKind: "dimension",
    tags: ["layout", "spacing", "prompter", "mobile"],
  },
  {
    id: "layout.dock-gap",
    label: "Layout / Dock Gap",
    cssVar: "--layout-dock-gap",
    category: "layout",
    valueKind: "dimension",
    tags: ["layout", "spacing", "dock"],
  },
  {
    id: "layout.dock-padding",
    label: "Layout / Dock Padding",
    cssVar: "--layout-dock-padding",
    category: "layout",
    valueKind: "dimension",
    tags: ["layout", "spacing", "dock"],
  },
  {
    id: "layout.dock-bottom-padding",
    label: "Layout / Dock Bottom Padding",
    cssVar: "--layout-dock-bottom-padding",
    category: "layout",
    valueKind: "dimension",
    tags: ["layout", "spacing", "dock"],
  },
  {
    id: "layout.dock-sheet-offset",
    label: "Layout / Dock Sheet Offset",
    cssVar: "--layout-dock-sheet-offset",
    category: "layout",
    valueKind: "dimension",
    tags: ["layout", "spacing", "dock"],
  },
  {
    id: "layout.dock-sheet-padding",
    label: "Layout / Dock Sheet Padding",
    cssVar: "--layout-dock-sheet-padding",
    category: "layout",
    valueKind: "dimension",
    tags: ["layout", "spacing", "dock"],
  },
  {
    id: "layout.mobile-page-gutter",
    label: "Layout / Mobile Page Gutter",
    cssVar: "--mobile-page-gutter",
    category: "layout",
    valueKind: "dimension",
    tags: ["layout", "spacing", "mobile"],
  },
  {
    id: "layout.mobile-dock-height",
    label: "Layout / Mobile Dock Height",
    cssVar: "--mobile-dock-height",
    category: "layout",
    valueKind: "dimension",
    tags: ["layout", "height", "mobile"],
  },
  {
    id: "motion.duration.quick",
    label: "Motion / Duration Quick",
    cssVar: "--motion-duration-quick",
    category: "motion",
    valueKind: "time",
    tags: ["motion", "duration", "quick"],
    tailwind: {
      path: ["transitionDuration", "quick"],
    },
  },
  {
    id: "motion.duration.medium",
    label: "Motion / Duration Medium",
    cssVar: "--motion-duration-medium",
    category: "motion",
    valueKind: "time",
    tags: ["motion", "duration", "base"],
    tailwind: {
      path: ["transitionDuration", "medium"],
    },
  },
  {
    id: "motion.duration.slow",
    label: "Motion / Duration Slow",
    cssVar: "--motion-duration-slow",
    category: "motion",
    valueKind: "time",
    tags: ["motion", "duration", "slow"],
    tailwind: {
      path: ["transitionDuration", "slow"],
    },
  },
  {
    id: "motion.easing.standard",
    label: "Motion / Easing Standard",
    cssVar: "--motion-ease-standard",
    category: "motion",
    valueKind: "timingFunction",
    tags: ["motion", "easing", "standard"],
    tailwind: {
      path: ["transitionTimingFunction", "standard"],
    },
  },
  {
    id: "motion.easing.emphasized-in",
    label: "Motion / Easing Emphasized In",
    cssVar: "--motion-ease-emphasized-in",
    category: "motion",
    valueKind: "timingFunction",
    tags: ["motion", "easing", "emphasized"],
    tailwind: {
      path: ["transitionTimingFunction", "emphasized-in"],
    },
  },
  {
    id: "motion.easing.emphasized-out",
    label: "Motion / Easing Emphasized Out",
    cssVar: "--motion-ease-emphasized-out",
    category: "motion",
    valueKind: "timingFunction",
    tags: ["motion", "easing", "emphasized"],
    tailwind: {
      path: ["transitionTimingFunction", "emphasized-out"],
    },
  },
  {
    id: "utility.presence-ring-offset",
    label: "Utility / Ring Offset",
    cssVar: "--ring-offset",
    category: "utility",
    valueKind: "shadow",
    tags: ["offset", "ring"],
  },
] as const satisfies readonly ThemeTokenDefinition[];

export type ThemeTokenId = (typeof themeTokenRegistry)[number]["id"];
export type ThemeTokenCssVar = (typeof themeTokenRegistry)[number]["cssVar"];

export type ThemeTokenMeta = {
  readonly id: ThemeTokenId;
  readonly cssVar: ThemeTokenCssVar;
  readonly category: ThemeTokenCategory;
  readonly valueKind: ThemeTokenValueKind;
  readonly label: string;
  readonly tags: readonly string[];
};

const THEME_TOKEN_META_ENTRIES = themeTokenRegistry.map((token) => [
  token.cssVar,
  {
    id: token.id as ThemeTokenId,
    cssVar: token.cssVar as ThemeTokenCssVar,
    category: token.category,
    valueKind: token.valueKind,
    label: token.label,
    tags: token.tags ?? [],
  },
] as const);

export const themeTokenMetaByCssVar = Object.freeze(
  Object.fromEntries(THEME_TOKEN_META_ENTRIES),
) as unknown as Record<ThemeTokenCssVar, ThemeTokenMeta>;
export const themeTokensById: ReadonlyMap<ThemeTokenId, ThemeTokenDefinition> = new Map(
  themeTokenRegistry.map((token) => [token.id as ThemeTokenId, token]),
);

export const themeTokensByCssVar: ReadonlyMap<ThemeTokenCssVar, ThemeTokenDefinition> = new Map(
  themeTokenRegistry.map((token) => [token.cssVar as ThemeTokenCssVar, token]),
);

export const THEME_TOKEN_CSS_VARS = new Set<ThemeTokenCssVar>(
  themeTokenRegistry.map((token) => token.cssVar),
);

export type TailwindThemeExtension = Partial<Record<TailwindGroup, Record<string, unknown>>>;

export function buildTailwindThemeExtension(
  tokens: readonly ThemeTokenDefinition[] = themeTokenRegistry,
): TailwindThemeExtension {
  const extend: TailwindThemeExtension = {};
  for (const token of tokens) {
    const binding = token.tailwind;
    if (!binding) continue;
    const [group, ...path] = binding.path;
    if (!path.length) continue;
    const base = (extend[group] ??= {});
    let cursor: Record<string, unknown> = base;
    for (let i = 0; i < path.length - 1; i++) {
      const key = path[i]!;
      const next = cursor[key];
      if (typeof next === "object" && next !== null) {
        cursor = next as Record<string, unknown>;
      } else {
        const fresh: Record<string, unknown> = {};
        cursor[key] = fresh;
        cursor = fresh;
      }
    }
    const leafKey = path[path.length - 1]!;
    cursor[leafKey] = `var(${token.cssVar})`;
  }
  return extend;
}

export function isThemeTokenVar(input: string): input is ThemeTokenCssVar {
  return THEME_TOKEN_CSS_VARS.has(input as ThemeTokenCssVar);
}

export function asCssVar(value: ThemeTokenCssVar): string {
  return `var(${value})`;
}

export const tailwindThemeExtension = buildTailwindThemeExtension();


