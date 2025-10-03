import { normalizeThemeVars } from "@/lib/theme/shared";
import {
  detectIntentGroupsFromPrompt,
  groupUsageFromVars,
  summarizeGroupLabels,
  type ThemeTokenGroupUsage,
} from "@/lib/theme/token-groups";
const OPENAI_API_KEY =
  process.env.OPENAI_API_KEY ?? process.env.OPENAI_KEY ?? process.env.OPENAI_SECRET_KEY ?? null;

const OPENAI_MODEL =
  process.env.OPENAI_MODEL ?? process.env.AI_MODEL ?? process.env.GPT_MODEL ?? "gpt-4o-mini";

export type StylerPlan = {
  summary: string;
  vars: Record<string, string>;
  source: "heuristic" | "ai";
  details?: string;
};

type RGB = { r: number; g: number; b: number };
type ColorSpec = { hex: string; rgb: RGB; label: string };

const COLOR_NAME_MAP = new Map<string, string>([
  ["white", "#ffffff"],
  ["black", "#111111"],
  ["blue", "#3b82f6"],
  ["light blue", "#60a5fa"],
  ["dark blue", "#1d4ed8"],
  ["sky", "#38bdf8"],
  ["navy", "#1e3a8a"],
  ["red", "#ef4444"],
  ["crimson", "#dc2626"],
  ["rose", "#f43f5e"],
  ["magenta", "#d946ef"],
  ["pink", "#ec4899"],
  ["purple", "#a855f7"],
  ["violet", "#8b5cf6"],
  ["indigo", "#6366f1"],
  ["plum", "#7e22ce"],
  ["green", "#22c55e"],
  ["emerald", "#10b981"],
  ["teal", "#14b8a6"],
  ["mint", "#34d399"],
  ["cyan", "#06b6d4"],
  ["aqua", "#22d3ee"],
  ["yellow", "#eab308"],
  ["gold", "#fbbf24"],
  ["amber", "#f59e0b"],
  ["orange", "#fb923c"],
  ["peach", "#fca5a5"],
  ["coral", "#fb7185"],
  ["brown", "#92400e"],
  ["chocolate", "#78350f"],
  ["beige", "#f5f5dc"],
  ["ivory", "#fffff0"],
  ["cream", "#f9f5e7"],
  ["silver", "#cbd5f5"],
  ["gray", "#9ca3af"],
  ["grey", "#9ca3af"],
  ["slate", "#64748b"],
  ["charcoal", "#1f2937"],
]);

const COLOR_MODIFIERS = ["light", "dark", "deep", "bright", "soft", "pale", "neon"] as const;
const COLOR_MODIFIER_SET = new Set<(typeof COLOR_MODIFIERS)[number]>(COLOR_MODIFIERS);

type Target = {
  id: "friends" | "chats" | "requests" | "background" | "theme" | "header" | "rail" | "buttons";
  label: string;
  type: "tile" | "background" | "site";
  keywords: string[];
};

const TARGETS: Target[] = [
  { id: "friends", label: "Friends tile", type: "tile", keywords: ["friend", "friends"] },
  { id: "chats", label: "Chats tile", type: "tile", keywords: ["chat", "chats", "messages"] },
  {
    id: "requests",
    label: "Requests tile",
    type: "tile",
    keywords: ["request", "requests", "invites"],
  },
  {
    id: "background",
    label: "app background",
    type: "background",
    keywords: ["background", "backdrop", "page", "app"],
  },
  // Site-wide or sectional styling
  {
    id: "theme",
    label: "site theme",
    type: "site",
    keywords: [
      "theme",
      "site",
      "overall",
      "brand",
      "primary",
      // generic terms that imply broad theme changes
      "posts",
      "cards",
    ],
  },
  { id: "header", label: "Header", type: "site", keywords: ["header", "navbar", "top bar", "nav"] },
  {
    id: "rail",
    label: "Right rail",
    type: "site",
    keywords: ["right rail", "rail", "sidebar", "right sidebar"],
  },
  { id: "buttons", label: "Buttons", type: "site", keywords: ["buttons", "button", "cta"] },
];

export async function resolveStylerPlan(prompt: string): Promise<StylerPlan | null> {
  const heuristic = buildHeuristicPlan(prompt);
  if (heuristic) {
    return heuristic;
  }
  return await runOpenAiStyler(prompt);
}

function buildHeuristicPlan(prompt: string): StylerPlan | null {
  const segments = splitSegments(prompt);
  if (!segments.length) return null;

  const vars: Record<string, string> = {};
  const descriptions: string[] = [];

  for (const segment of segments) {
    const target = detectTarget(segment);
    if (!target) continue;
    const color = extractColor(segment);
    if (!color) continue;

    if (target.type === "tile") {
      Object.assign(vars, buildTileVars(target.id as "friends" | "chats" | "requests", color));
    } else if (target.id === "background") {
      Object.assign(vars, buildBackgroundVars(color));
    } else if (target.id === "theme") {
      Object.assign(vars, buildSiteThemeVars(color));
    } else if (target.id === "header") {
      Object.assign(vars, buildHeaderOnlyVars(color));
    } else if (target.id === "rail") {
      Object.assign(vars, buildRailOnlyVars(color));
    } else if (target.id === "buttons") {
      Object.assign(vars, buildButtonsVars(color));
    }

    const descriptor = `${target.label} (${color.label})`;
    descriptions.push(descriptor);
  }

  let sanitized = normalizeThemeVars(vars);
  if (!Object.keys(sanitized).length) {
    const fallbackColor = extractColor(prompt);
    if (fallbackColor) {
      sanitized = normalizeThemeVars(buildSiteThemeVars(fallbackColor));
    }
  }
  if (!Object.keys(sanitized).length) return null;

  const summary = buildSummary(descriptions);
  const details = buildPlanDetails(prompt, sanitized);
  const plan: StylerPlan = { summary, vars: sanitized, source: "heuristic" };
  if (details) {
    plan.details = details;
  }
  return plan;
}

function splitSegments(prompt: string): string[] {
  return prompt
    .split(/(?:\band\b|[,;]|\n|\.|\!)/gi)
    .map((part) => part.trim())
    .filter(Boolean);
}

function detectTarget(segment: string): Target | null {
  const lower = segment.toLowerCase();
  for (const target of TARGETS) {
    if (target.keywords.some((keyword) => lower.includes(keyword))) {
      return target;
    }
  }
  return null;
}

function extractColor(segment: string): ColorSpec | null {
  const lower = segment.toLowerCase();

  const hexMatch = lower.match(/#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})\b/i);
  if (hexMatch) {
    const hex = normalizeHex(hexMatch[0]);
    if (hex) {
      return { hex, rgb: hexToRgb(hex), label: hex.toUpperCase() };
    }
  }

  for (const [name, hex] of COLOR_NAME_MAP.entries()) {
    if (!lower.includes(name)) continue;
    const modifier = findModifier(lower, name);
    const rgb = hexToRgb(hex);
    const adjusted = modifier ? adjustColor(rgb, modifier) : rgb;
    const hexValue = rgbToHex(adjusted);
    const label = formatColorLabel(modifier, name);
    return { hex: hexValue, rgb: adjusted, label };
  }

  return null;
}

function findModifier(text: string, name: string): (typeof COLOR_MODIFIERS)[number] | null {
  const index = text.indexOf(name);
  if (index <= 0) return null;
  const prefix = text.slice(Math.max(0, index - 12), index).trim();
  const parts = prefix.split(/\s+/);
  const last = parts[parts.length - 1];
  if (last && COLOR_MODIFIER_SET.has(last as (typeof COLOR_MODIFIERS)[number])) {
    return last as (typeof COLOR_MODIFIERS)[number];
  }
  return null;
}

function adjustColor(rgb: RGB, modifier: (typeof COLOR_MODIFIERS)[number]): RGB {
  const { r, g, b } = rgb;
  const clamp = (value: number) => Math.max(0, Math.min(255, Math.round(value)));
  switch (modifier) {
    case "light":
    case "soft":
    case "pale":
      return {
        r: clamp(r + (255 - r) * 0.35),
        g: clamp(g + (255 - g) * 0.35),
        b: clamp(b + (255 - b) * 0.35),
      };
    case "bright":
    case "neon":
      return {
        r: clamp(r * 1.1 + (255 - r) * 0.2),
        g: clamp(g * 1.1 + (255 - g) * 0.2),
        b: clamp(b * 1.1 + (255 - b) * 0.2),
      };
    case "dark":
    case "deep":
      return {
        r: clamp(r * 0.7),
        g: clamp(g * 0.7),
        b: clamp(b * 0.7),
      };
    default:
      return rgb;
  }
}

function buildTileVars(
  target: "friends" | "chats" | "requests",
  color: ColorSpec,
): Record<string, string> {
  const { rgb } = color;
  const accentA = rgba(rgb, 0.88);
  const accentB = rgba(rgb, 0.64);
  const gradient = `linear-gradient(160deg, ${accentA}, ${accentB})`;
  const border = rgba(rgb, 0.52);
  const shadow = `0 24px 48px ${rgba(rgb, 0.28)}`;
  const textColor = luminance(rgb) > 0.55 ? "rgba(14,16,36,0.92)" : "rgba(255,255,255,0.92)";
  const descColor = luminance(rgb) > 0.55 ? "rgba(14,16,36,0.7)" : "rgba(255,255,255,0.78)";
  const iconBg = luminance(rgb) > 0.55 ? rgba(rgb, 0.26) : "rgba(255,255,255,0.16)";
  const badgeBg = luminance(rgb) > 0.55 ? rgba(rgb, 0.2) : "rgba(255,255,255,0.88)";

  const prefix = `--style-${target}`;
  return {
    [`${prefix}-bg`]: gradient,
    [`${prefix}-border`]: border,
    [`${prefix}-text`]: textColor,
    [`${prefix}-shadow`]: shadow,
    [`${prefix}-icon-bg`]: iconBg,
    [`${prefix}-icon-color`]: textColor,
    [`${prefix}-desc`]: descColor,
    [`${prefix}-badge-bg`]: badgeBg,
    [`${prefix}-badge-color`]: textColor,
    [`${prefix}-border-hover`]: rgba(rgb, 0.62),
    [`${prefix}-shadow-hover`]: `0 28px 54px ${rgba(rgb, 0.32)}`,
  };
}

function buildBackgroundVars(color: ColorSpec): Record<string, string> {
  const { rgb } = color;
  const topLeft = rgba(rgb, 0.18);
  const topRight = rgba(rgb, 0.12);
  const horizStart = rgba(rgb, 0.1);
  const horizMid = rgba(rgb, 0.04);
  const bottom = rgba(rgb, 0.08);
  const gradient = [
    `radial-gradient(1200px 720px at 0% 0%, ${topLeft}, transparent 60%)`,
    `radial-gradient(1020px 680px at 100% 0%, ${topRight}, transparent 62%)`,
    `linear-gradient(90deg, ${horizStart} 0%, ${horizMid} 20%, rgba(5,10,27,0) 55%, ${horizMid} 82%, ${horizStart} 100%)`,
    `radial-gradient(880px 560px at 50% 108%, ${bottom}, transparent 74%)`,
    "#050a1b",
  ].join(", ");
  return {
    "--app-bg": gradient,
  };
}

function pick<T extends Record<string, string>>(obj: T, keys: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const k of keys) {
    if (obj[k] != null) out[k] = obj[k]!;
  }
  return out;
}

function buildHeaderOnlyVars(color: ColorSpec): Record<string, string> {
  const full = buildSiteThemeVars(color);
  return pick(full, [
    "--header-glass-top",
    "--header-glass-bottom",
    "--header-tint-from",
    "--header-tint-to",
    "--header-border-color",
    "--header-shadow",
    "--header-scrim",
  ]);
}

function buildRailOnlyVars(color: ColorSpec): Record<string, string> {
  const full = buildSiteThemeVars(color);
  return pick(full, ["--rail-bg-1", "--rail-bg-2", "--rail-border"]);
}

function buildButtonsVars(color: ColorSpec): Record<string, string> {
  const full = buildSiteThemeVars(color);
  // Ensure primary button, links, rings derive from brand tokens
  const vars = pick(full, ["--cta-gradient", "--cta-button-gradient", "--cta-button-text"]);
  // Map site brand tokens used by Tailwind theme
  vars["--color-brand"] = full["--brand-mid"] ?? color.hex;
  vars["--color-brand-strong"] = full["--brand-to"] ?? color.hex;
  vars["--color-brand-foreground"] =
    full["--text-on-brand"] ?? (luminance(color.rgb) > 0.55 ? "#0e1024" : "#f8fafc");
  // Keep brand gradient in sync with any usages
  // Ensure a string type even if keys are missing at compile time
  vars["--gradient-brand"] = (full["--brand-gradient"] ?? full["--cta-gradient"] ?? "") as string;
  return vars;
}

function mix(a: RGB, b: RGB, t: number): RGB {
  const clamp = (n: number) => Math.max(0, Math.min(255, Math.round(n)));
  return {
    r: clamp(a.r + (b.r - a.r) * t),
    g: clamp(a.g + (b.g - a.g) * t),
    b: clamp(a.b + (b.b - a.b) * t),
  };
}

function tint(rgb: RGB, amount: number): RGB {
  return mix(rgb, { r: 255, g: 255, b: 255 }, amount);
}

function shade(rgb: RGB, amount: number): RGB {
  return mix(rgb, { r: 0, g: 0, b: 0 }, amount);
}

// --- Contrast utilities (WCAG) ---
function relLuminance({ r, g, b }: RGB): number {
  const srgb = [r, g, b].map((v) => v / 255);
  const lin = srgb.map((c) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)));
  const [rLin, gLin, bLin] = lin as [number, number, number];
  return 0.2126 * rLin + 0.7152 * gLin + 0.0722 * bLin;
}

function contrastRatioRGB(a: RGB, b: RGB): number {
  const L1 = relLuminance(a);
  const L2 = relLuminance(b);
  const lighter = Math.max(L1, L2);
  const darker = Math.min(L1, L2);
  return (lighter + 0.05) / (darker + 0.05);
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

function blendOver(bg: RGB, fg: RGB, alpha: number): RGB {
  const a = clamp01(alpha);
  return {
    r: Math.round(fg.r * a + bg.r * (1 - a)),
    g: Math.round(fg.g * a + bg.g * (1 - a)),
    b: Math.round(fg.b * a + bg.b * (1 - a)),
  };
}

function enforceContrastRgb(bg: RGB, text: RGB, minRatio: number): RGB {
  if (contrastRatioRGB(bg, text) >= minRatio) return bg;
  const textLum = relLuminance(text);
  const bgLum = relLuminance(bg);
  const target: RGB = textLum > bgLum ? { r: 0, g: 0, b: 0 } : { r: 255, g: 255, b: 255 };

  let lo = 0;
  let hi = 1;
  let best = 1;
  for (let i = 0; i < 18; i++) {
    const mid = (lo + hi) / 2;
    const candidate = mix(bg, target, mid);
    if (contrastRatioRGB(candidate, text) >= minRatio) {
      best = mid;
      hi = mid;
    } else {
      lo = mid;
    }
  }

  const adjusted = mix(bg, target, best);
  if (contrastRatioRGB(adjusted, text) >= minRatio) return adjusted;
  return target;
}

function pickTextBaseFor(bg: RGB): RGB {
  // Choose the base (opaque) text color that yields higher contrast on bg.
  const dark: RGB = { r: 0, g: 0, b: 0 };
  const light: RGB = { r: 255, g: 255, b: 255 };
  const cDark = contrastRatioRGB(dark, bg);
  const cLight = contrastRatioRGB(light, bg);
  return cDark >= cLight ? dark : light;
}

function solveTextAlphaForContrast(bg: RGB, textBase: RGB, minRatio: number): number {
  // Find minimum alpha in [0,1] such that contrast(blendOver(bg, textBase, a), bg) >= minRatio
  // If even alpha=1 fails, return 1.
  if (contrastRatioRGB(textBase, bg) < minRatio) return 1;
  let lo = 0,
    hi = 1,
    best = 1;
  for (let i = 0; i < 16; i++) {
    const mid = (lo + hi) / 2;
    const blended = blendOver(bg, textBase, mid);
    const cr = contrastRatioRGB(blended, bg);
    if (cr >= minRatio) {
      best = mid;
      hi = mid;
    } else {
      lo = mid;
    }
  }
  return clamp01(best);
}

function solveOverlayAlphaForContrast(bg: RGB, overlay: RGB, text: RGB, minRatio: number): number {
  // Find minimum overlay alpha in [0, 0.9] so that contrast(text, blendOver(bg, overlay, a)) >= minRatio
  // If cannot reach, return 0.9 (strong overlay) to maximize.
  const maxA = 0.9;
  if (contrastRatioRGB(text, bg) >= minRatio) return 0;
  let lo = 0,
    hi = maxA,
    best = maxA;
  for (let i = 0; i < 18; i++) {
    const mid = (lo + hi) / 2;
    const adjustedBg = blendOver(bg, overlay, mid);
    const cr = contrastRatioRGB(text, adjustedBg);
    if (cr >= minRatio) {
      best = mid;
      hi = mid;
    } else {
      lo = mid;
    }
  }
  return clamp01(best);
}

function buildSiteThemeVars(color: ColorSpec): Record<string, string> {
  const { rgb } = color;
  const isLight = luminance(rgb) > 0.55;

  const neutralBase = isLight ? { r: 246, g: 248, b: 255 } : { r: 10, g: 12, b: 30 };
  const neutralAlt = isLight ? { r: 235, g: 240, b: 252 } : { r: 14, g: 18, b: 36 };
  const neutralDeep = isLight ? { r: 220, g: 226, b: 245 } : { r: 5, g: 8, b: 20 };

  const surfaceStrength = isLight ? 0.18 : 0.26;
  const surfaceAltStrength = isLight ? 0.12 : 0.2;

  let cardBg1Rgb = mix(neutralBase, rgb, surfaceStrength);
  let cardBg2Rgb = mix(neutralAlt, rgb, surfaceAltStrength);
  let cardHoverBg1Rgb = mix(neutralBase, rgb, surfaceStrength + (isLight ? 0.04 : 0.05));
  let cardHoverBg2Rgb = mix(neutralAlt, rgb, surfaceAltStrength + (isLight ? 0.05 : 0.06));
  const cardBorderRgb = mix(neutralAlt, rgb, isLight ? 0.08 : 0.18);

  let railBgRgb = mix(neutralAlt, rgb, isLight ? 0.1 : 0.22);
  let railBg2Rgb = mix(neutralDeep, rgb, isLight ? 0.08 : 0.18);
  const railBorderRgb = mix(neutralAlt, rgb, isLight ? 0.06 : 0.16);

  let headerTopRgb = mix(neutralBase, rgb, isLight ? 0.1 : 0.24);
  let headerBottomRgb = mix(neutralAlt, rgb, isLight ? 0.08 : 0.2);
  let headerTintFromRgb = mix(rgb, neutralAlt, isLight ? 0.2 : 0.28);
  let headerTintToRgb = mix(rgb, neutralDeep, isLight ? 0.14 : 0.26);

  const brandFromRgb = tint(rgb, isLight ? 0.3 : 0.18);
  const brandMidRgb = rgb;
  const brandToRgb = shade(rgb, isLight ? 0.15 : 0.25);

  let glassBg1Rgb = mix(neutralAlt, rgb, isLight ? 0.08 : 0.16);
  let glassBg2Rgb = mix(neutralAlt, rgb, isLight ? 0.05 : 0.12);
  let pillBg1Rgb = mix(neutralAlt, rgb, isLight ? 0.08 : 0.18);
  let pillBg2Rgb = mix(neutralAlt, rgb, isLight ? 0.05 : 0.16);

  const MIN_PRIMARY = 16;
  const MIN_SECONDARY = 12;
  const MIN_BRAND_TARGET = 16;
  const MIN_BRAND_FALLBACK = 12;

  let textBase = pickTextBaseFor(cardBg1Rgb);
  cardBg1Rgb = enforceContrastRgb(cardBg1Rgb, textBase, MIN_PRIMARY);
  textBase = pickTextBaseFor(cardBg1Rgb);

  const adjustPrimary = (value: RGB) => enforceContrastRgb(value, textBase, MIN_PRIMARY);
  const adjustSecondary = (value: RGB) => enforceContrastRgb(value, textBase, MIN_SECONDARY);

  cardBg2Rgb = adjustSecondary(cardBg2Rgb);
  cardHoverBg1Rgb = adjustPrimary(cardHoverBg1Rgb);
  cardHoverBg2Rgb = adjustPrimary(cardHoverBg2Rgb);
  railBgRgb = adjustPrimary(railBgRgb);
  railBg2Rgb = adjustPrimary(railBg2Rgb);
  headerTopRgb = adjustPrimary(headerTopRgb);
  headerBottomRgb = adjustPrimary(headerBottomRgb);
  headerTintFromRgb = adjustSecondary(headerTintFromRgb);
  headerTintToRgb = adjustSecondary(headerTintToRgb);
  glassBg1Rgb = adjustSecondary(glassBg1Rgb);
  glassBg2Rgb = adjustSecondary(glassBg2Rgb);
  pillBg1Rgb = adjustSecondary(pillBg1Rgb);
  pillBg2Rgb = adjustSecondary(pillBg2Rgb);

  const appBaseRgb = enforceContrastRgb(
    mix(neutralDeep, rgb, isLight ? 0.06 : 0.14),
    textBase,
    MIN_SECONDARY,
  );
  // Layered background highlights to avoid a flat backdrop
  const appLayer1 = rgba(mix(rgb, neutralBase, isLight ? 0.18 : 0.26), isLight ? 0.22 : 0.18);
  const appLayer2 = rgba(mix(rgb, neutralAlt, isLight ? 0.14 : 0.24), isLight ? 0.18 : 0.16);
  const appLayer3 = rgba(mix(rgb, neutralDeep, isLight ? 0.1 : 0.2), isLight ? 0.12 : 0.14);

  const textAlpha = solveTextAlphaForContrast(cardBg1Rgb, textBase, MIN_PRIMARY);
  const text = rgba(textBase, textAlpha);

  const text2Alpha = solveTextAlphaForContrast(cardBg1Rgb, textBase, MIN_SECONDARY);
  const text2 = rgba(textBase, text2Alpha);

  const brandTextBase = pickTextBaseFor(brandMidRgb);
  const brandTextIsLight = brandTextBase.r > 128;
  const overlayColor: RGB = brandTextIsLight ? { r: 0, g: 0, b: 0 } : { r: 255, g: 255, b: 255 };
  let overlayForBrand = solveOverlayAlphaForContrast(
    brandMidRgb,
    overlayColor,
    brandTextBase,
    MIN_BRAND_TARGET,
  );
  let brandMidAdjusted = blendOver(brandMidRgb, overlayColor, overlayForBrand);
  if (contrastRatioRGB(brandTextBase, brandMidAdjusted) < MIN_BRAND_TARGET) {
    overlayForBrand = solveOverlayAlphaForContrast(
      brandMidRgb,
      overlayColor,
      brandTextBase,
      MIN_BRAND_FALLBACK,
    );
    brandMidAdjusted = blendOver(brandMidRgb, overlayColor, overlayForBrand);
  }
  const brandFromAdjusted = blendOver(brandFromRgb, overlayColor, overlayForBrand);
  const brandToAdjusted = blendOver(brandToRgb, overlayColor, overlayForBrand);
  const textOnBrand = rgba(brandTextBase, 1);

  const brandGradient = `linear-gradient(120deg, ${rgbToHex(brandFromAdjusted)}, ${rgbToHex(brandMidAdjusted)}, ${rgbToHex(brandToAdjusted)})`;
  const ctaOverlayAlpha = Math.min(0.95, overlayForBrand + 0.08);
  const ctaFrom = blendOver(brandFromRgb, overlayColor, ctaOverlayAlpha);
  const ctaMid = blendOver(brandMidRgb, overlayColor, ctaOverlayAlpha);
  const ctaTo = blendOver(brandToRgb, overlayColor, ctaOverlayAlpha);
  const ctaGradient = `linear-gradient(120deg, ${rgbToHex(ctaFrom)}, ${rgbToHex(ctaMid)}, ${rgbToHex(ctaTo)})`;

  const textIsLight = textBase.r > 128;
  const accentGlow = textIsLight ? rgba(tint(rgb, 0.35), 0.3) : rgba(shade(rgb, 0.3), 0.24);
  const headerScrim = textIsLight ? "rgba(7,9,22,0.90)" : "rgba(255,255,255,0.92)";

  const vars: Record<string, string> = {
    "--app-bg": [
      `radial-gradient(1200px 720px at 0% 0%, ${appLayer1}, transparent 60%)`,
      `radial-gradient(1020px 680px at 100% 0%, ${appLayer2}, transparent 62%)`,
      `linear-gradient(90deg, ${appLayer1} 0%, ${appLayer3} 32%, rgba(5,10,27,0) 55%, ${appLayer3} 78%, ${appLayer1} 100%)`,
      `radial-gradient(880px 560px at 50% 108%, ${appLayer2}, transparent 74%)`,
      rgbToHex(appBaseRgb),
    ].join(", "),
    "--text": text,
    "--text-2": text2,
    "--text-on-brand": textOnBrand,
    "--accent-glow": accentGlow,
    "--card-bg-1": rgbToHex(cardBg1Rgb),
    "--card-bg-2": rgbToHex(cardBg2Rgb),
    "--card-border": rgba(cardBorderRgb, textIsLight ? 0.32 : 0.22),
    "--card-shadow": `0 18px 40px ${rgba(shade(cardBg1Rgb, textIsLight ? 0.45 : 0.65), textIsLight ? 0.28 : 0.24)}`,
    "--card-hover-bg-1": rgbToHex(cardHoverBg1Rgb),
    "--card-hover-bg-2": rgbToHex(cardHoverBg2Rgb),
    "--card-hover-border": rgba(cardBorderRgb, textIsLight ? 0.36 : 0.28),
    "--card-hover-shadow": `0 22px 46px ${rgba(shade(cardBg1Rgb, textIsLight ? 0.55 : 0.75), textIsLight ? 0.32 : 0.28)}`,
    "--header-glass-top": rgba(headerTopRgb, isLight ? 0.65 : 0.32),
    "--header-glass-bottom": rgba(headerBottomRgb, isLight ? 0.45 : 0.24),
    "--header-tint-from": rgba(headerTintFromRgb, textIsLight ? 0.35 : 0.28),
    "--header-tint-to": rgba(headerTintToRgb, textIsLight ? 0.32 : 0.26),
    "--header-border-color": rgba(headerTintFromRgb, textIsLight ? 0.28 : 0.22),
    "--header-shadow": `0 18px 36px ${rgba(shade(headerBottomRgb, textIsLight ? 0.5 : 0.4), textIsLight ? 0.35 : 0.24)}`,
    "--header-scrim": headerScrim,
    "--pill-border": rgba(pillBg1Rgb, textIsLight ? 0.42 : 0.28),
    "--pill-bg-1": rgbToHex(pillBg1Rgb),
    "--pill-bg-2": rgbToHex(pillBg2Rgb),
    "--rail-bg-1": rgba(railBgRgb, isLight ? 0.92 : 0.18),
    "--rail-bg-2": rgba(railBg2Rgb, isLight ? 0.86 : 0.15),
    "--rail-border": rgba(railBorderRgb, textIsLight ? 0.28 : 0.2),
    "--cta-gradient": brandGradient,
    "--brand-from": rgbToHex(brandFromAdjusted),
    "--brand-mid": rgbToHex(brandMidAdjusted),
    "--brand-to": rgbToHex(brandToAdjusted),
    "--brand-gradient": brandGradient,
    // Tailwind-driven brand tokens so primary buttons/links follow the theme color
    "--color-brand": rgbToHex(brandMidAdjusted),
    "--color-brand-strong": rgbToHex(brandToAdjusted),
    "--color-brand-foreground": textOnBrand,
    "--gradient-brand": brandGradient,
    "--cta-button-gradient": ctaGradient,
    "--cta-button-text": textOnBrand,
    "--glass-bg-1": rgbToHex(glassBg1Rgb),
    "--glass-bg-2": rgbToHex(glassBg2Rgb),
  };

  const baseLabel = color.label || "Theme";
  const chatsRgb = tint(rgb, 0.18);
  const requestsRgb = shade(rgb, 0.12);

  Object.assign(vars, buildTileVars("friends", color));
  Object.assign(
    vars,
    buildTileVars("chats", {
      hex: rgbToHex(chatsRgb),
      rgb: chatsRgb,
      label: `${baseLabel} Light`,
    }),
  );
  Object.assign(
    vars,
    buildTileVars("requests", {
      hex: rgbToHex(requestsRgb),
      rgb: requestsRgb,
      label: `${baseLabel} Deep`,
    }),
  );

  return vars;
}

function buildPlanDetails(prompt: string, vars: Record<string, string>): string | undefined {
  const usage = groupUsageFromVars(vars);
  const detailsFromVars = summarizeGroupLabels(usage);
  if (detailsFromVars) return detailsFromVars;
  const promptGroups = detectIntentGroupsFromPrompt(prompt);
  if (promptGroups.length) {
    const syntheticUsage: ThemeTokenGroupUsage[] = promptGroups.map((group) => ({ group, count: 1 }));
    return summarizeGroupLabels(syntheticUsage);
  }
  return undefined;
}
function buildSummary(parts: string[]): string {
  if (!parts.length) return "Updated your capsule style.";
  if (parts.length === 1) return `Styled ${parts[0]}.`;
  if (parts.length === 2) return `Styled ${parts[0]} and ${parts[1]}.`;
  return `Styled ${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}.`;
}

function rgba({ r, g, b }: RGB, alpha: number): string {
  const value = Math.max(0, Math.min(1, alpha));
  return `rgba(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)}, ${value.toFixed(2)})`;
}

function luminance({ r, g, b }: RGB): number {
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}

function normalizeHex(raw: string): string | null {
  const value = raw.trim().replace(/^#/, "");
  if (value.length === 3) {
    return `#${value[0]}${value[0]}${value[1]}${value[1]}${value[2]}${value[2]}`.toLowerCase();
  }
  if (value.length === 6) {
    return `#${value.toLowerCase()}`;
  }
  if (value.length === 8) {
    return `#${value.slice(0, 6).toLowerCase()}`;
  }
  return null;
}

function hexToRgb(hex: string): RGB {
  const normalized = normalizeHex(hex) ?? "#000000";
  const value = normalized.replace(/^#/, "");
  const r = parseInt(value.slice(0, 2), 16);
  const g = parseInt(value.slice(2, 4), 16);
  const b = parseInt(value.slice(4, 6), 16);
  return { r, g, b };
}

function rgbToHex({ r, g, b }: RGB): string {
  const toHex = (n: number) => n.toString(16).padStart(2, "0");
  return `#${toHex(Math.max(0, Math.min(255, Math.round(r))))}${toHex(Math.max(0, Math.min(255, Math.round(g))))}${toHex(Math.max(0, Math.min(255, Math.round(b))))}`;
}

function formatColorLabel(modifier: string | null, baseName: string): string {
  const prettyBase = baseName
    .split(/\s+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
  if (!modifier) return prettyBase;
  const prettyModifier = modifier.charAt(0).toUpperCase() + modifier.slice(1);
  return `${prettyModifier} ${prettyBase}`;
}

async function runOpenAiStyler(prompt: string): Promise<StylerPlan | null> {
  if (!OPENAI_API_KEY) return null;
  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: OPENAI_MODEL,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content: [
              "You are Capsules AI Styler. Interpret styling prompts for the Capsules interface.",
              'Respond ONLY with JSON of the shape {"summary": string, "vars": { "--css-variable": "value" }}.',
              "Prefer variables that drive the whole site: --app-bg, --text, --text-2, --text-on-brand, --card-bg-1, --card-bg-2, --card-border, --card-shadow, --card-hover-bg-1, --card-hover-bg-2, --card-hover-border, --card-hover-shadow, --header-glass-top, --header-glass-bottom, --header-tint-from, --header-tint-to, --header-border-color, --header-shadow, --header-scrim, --pill-bg-1, --pill-bg-2, --pill-border, --rail-bg-1, --rail-bg-2, --rail-border, --cta-gradient.",
              "You may also set tile-specific tokens like --style-friends-*, --style-chats-*, --style-requests-*.",
            ].join(" "),
          },
          { role: "user", content: prompt },
        ],
      }),
    });

    const raw = (await response.json().catch(() => null)) as {
      choices?: Array<{ message?: { content?: string } }>;
    } | null;
    if (!response.ok || !raw) {
      console.warn("styler ai response error", raw);
      return null;
    }
    const content = raw.choices?.[0]?.message?.content;
    if (!content) return null;
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(content) as Record<string, unknown>;
    } catch (error) {
      console.warn("styler ai parse error", error, content);
      return null;
    }
    const summaryRaw = typeof parsed.summary === "string" ? parsed.summary.trim() : "";
    const varsRaw = parsed.vars as Record<string, unknown> | undefined;
    const sanitized = normalizeThemeVars(varsRaw ? (varsRaw as Record<string, string>) : {});
    const details = buildPlanDetails(prompt, sanitized);
    const plan: StylerPlan = {
      summary: summaryRaw || "Updated your capsule style.",
      vars: sanitized,
      source: "ai",
    };
    if (details) {
      plan.details = details;
    }
    return plan;
  } catch (error) {
    console.error("styler ai request failed", error);
    return null;
  }
}













