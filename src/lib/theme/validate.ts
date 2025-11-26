import {
  canonicalizeThemeVariantsInput,
  dropEmptyVariants,
  type ThemeMode,
  type ThemeVariants,
  THEME_MODES,
} from "./variants";
import { MAX_THEME_VAR_ENTRIES } from "./shared";

export type ThemeValidationIssue = {
  issue: "contrast" | "budget";
  message: string;
  token?: string;
  mode?: ThemeMode;
};

export type ThemeValidationResult = {
  ok: boolean;
  issues: ThemeValidationIssue[];
  variants: ThemeVariants;
  normalized: ThemeVariants;
};

type RGBA = { r: number; g: number; b: number; a: number };

const TARGETS: Array<{
  fg: string;
  bg: string;
  min: number;
  description: string;
}> = [
  {
    fg: "--color-fg",
    bg: "--surface-app",
    min: 4.5,
    description: "text on surface",
  },
  {
    fg: "--color-fg",
    bg: "--app-bg",
    min: 4.5,
    description: "text on app background",
  },
  {
    fg: "--text-on-brand",
    bg: "--color-brand",
    min: 4.5,
    description: "brand text",
  },
  {
    fg: "--color-success",
    bg: "--surface-elevated",
    min: 3,
    description: "success on elevated surface",
  },
  {
    fg: "--color-warning",
    bg: "--surface-elevated",
    min: 3,
    description: "warning on elevated surface",
  },
  {
    fg: "--color-danger",
    bg: "--surface-elevated",
    min: 3,
    description: "danger on elevated surface",
  },
];

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

function parseHexColor(raw: string): RGBA | null {
  const value = raw.trim();
  const match = value.match(/^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i);
  if (!match) return null;
  const hex = match[1];
  if (!hex) return null;

  if (hex.length === 3 || hex.length === 4) {
    const [rChar, gChar, bChar, aChar] = hex.split("");
    if (!rChar || !gChar || !bChar) return null;
    const r = parseInt(rChar + rChar, 16);
    const g = parseInt(gChar + gChar, 16);
    const b = parseInt(bChar + bChar, 16);
    const aChunk = (aChar ?? "f") + (aChar ?? "f");
    const alphaValue = parseInt(aChunk, 16);
    if ([r, g, b, alphaValue].some((component) => Number.isNaN(component))) return null;
    return { r, g, b, a: alphaValue / 255 };
  }

  if (hex.length === 6 || hex.length === 8) {
    const rChunk = hex.slice(0, 2);
    const gChunk = hex.slice(2, 4);
    const bChunk = hex.slice(4, 6);
    const aChunk = hex.length === 8 ? hex.slice(6, 8) : "ff";
    const r = parseInt(rChunk, 16);
    const g = parseInt(gChunk, 16);
    const b = parseInt(bChunk, 16);
    const alphaValue = parseInt(aChunk, 16);
    if ([r, g, b, alphaValue].some((component) => Number.isNaN(component))) return null;
    return { r, g, b, a: alphaValue / 255 };
  }

  return null;
}

function parseRgbColor(raw: string): RGBA | null {
  const match = raw.trim().match(/^rgba?\(([^)]+)\)$/i);
  if (!match) return null;
  const parts = match[1]?.split(",")?.map((part) => part.trim()) ?? [];
  if (parts.length < 3) return null;
  const [rPart, gPart, bPart, aPart] = parts;
  if (!rPart || !gPart || !bPart) return null;
  const parseChannel = (part: string): number | null => {
    if (part.endsWith("%")) {
      const value = parseFloat(part);
      if (Number.isNaN(value)) return null;
      return clamp((value / 100) * 255, 0, 255);
    }
    const value = parseFloat(part);
    if (Number.isNaN(value)) return null;
    return clamp(value, 0, 255);
  };
  const r = parseChannel(rPart);
  const g = parseChannel(gPart);
  const b = parseChannel(bPart);
  if (r == null || g == null || b == null) return null;
  const alpha = aPart ? clamp(parseFloat(aPart), 0, 1) : 1;
  if (Number.isNaN(alpha)) return null;
  return { r, g, b, a: alpha };
}

function parseHslColor(raw: string): RGBA | null {
  const match = raw.trim().match(/^hsla?\(([^)]+)\)$/i);
  if (!match) return null;
  const parts = match[1]?.split(",")?.map((part) => part.trim()) ?? [];
  if (parts.length < 3) return null;
  const [hPart, sPart, lPart, aPart] = parts;
  if (!hPart || !sPart || !lPart) return null;
  const h = parseFloat(hPart);
  const s = parseFloat(sPart);
  const l = parseFloat(lPart);
  if ([h, s, l].some((value) => Number.isNaN(value))) return null;
  const hNorm = ((h % 360) + 360) % 360;
  const sNorm = clamp(s / 100, 0, 1);
  const lNorm = clamp(l / 100, 0, 1);
  const c = (1 - Math.abs(2 * lNorm - 1)) * sNorm;
  const x = c * (1 - Math.abs(((hNorm / 60) % 2) - 1));
  const m = lNorm - c / 2;
  let r1 = 0;
  let g1 = 0;
  let b1 = 0;
  if (hNorm < 60) {
    r1 = c;
    g1 = x;
  } else if (hNorm < 120) {
    r1 = x;
    g1 = c;
  } else if (hNorm < 180) {
    g1 = c;
    b1 = x;
  } else if (hNorm < 240) {
    g1 = x;
    b1 = c;
  } else if (hNorm < 300) {
    r1 = x;
    b1 = c;
  } else {
    r1 = c;
    b1 = x;
  }
  return {
    r: Math.round((r1 + m) * 255),
    g: Math.round((g1 + m) * 255),
    b: Math.round((b1 + m) * 255),
    a: aPart ? clamp(parseFloat(aPart), 0, 1) : 1,
  };
}

function extractFirstColor(value: string): RGBA | null {
  const hexMatch = value.match(/#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})/i);
  if (hexMatch) {
    const color = parseHexColor(hexMatch[0]);
    if (color) return color;
  }
  const rgbaMatch = value.match(/rgba?\([^)]*\)/i);
  if (rgbaMatch) {
    const color = parseRgbColor(rgbaMatch[0]);
    if (color) return color;
  }
  const hslaMatch = value.match(/hsla?\([^)]*\)/i);
  if (hslaMatch) {
    const color = parseHslColor(hslaMatch[0]);
    if (color) return color;
  }
  return null;
}

function relativeLuminance(color: RGBA): number {
  const srgb = (channel: number) => {
    const norm = clamp(channel, 0, 255) / 255;
    return norm <= 0.03928 ? norm / 12.92 : Math.pow((norm + 0.055) / 1.055, 2.4);
  };
  const r = srgb(color.r);
  const g = srgb(color.g);
  const b = srgb(color.b);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrastRatio(a: RGBA, b: RGBA): number {
  const lumA = relativeLuminance(a);
  const lumB = relativeLuminance(b);
  const lighter = Math.max(lumA, lumB);
  const darker = Math.min(lumA, lumB);
  return (lighter + 0.05) / (darker + 0.05);
}

function resolveColor(map: Record<string, string>, key: string): RGBA | null {
  const value = map[key];
  if (!value) return null;
  return extractFirstColor(value);
}

function checkContrast(
  map: Record<string, string>,
  mode: ThemeMode,
  issues: ThemeValidationIssue[],
  fgKey: string,
  bgKey: string,
  min: number,
  description: string,
) {
  const fg = resolveColor(map, fgKey);
  const bg = resolveColor(map, bgKey);
  if (!fg || !bg) return;
  const ratio = contrastRatio(fg, bg);
  if (ratio < min) {
    issues.push({
      issue: "contrast",
      token: fgKey,
      mode,
      message: `${description} contrast ${ratio.toFixed(2)} is below ${min}:1`,
    });
  }
}

function validateMode(
  map: Record<string, string>,
  mode: ThemeMode,
  issues: ThemeValidationIssue[],
) {
  const entries = Object.keys(map).length;
  if (entries > MAX_THEME_VAR_ENTRIES) {
    issues.push({
      issue: "budget",
      mode,
      message: `Too many entries (${entries}/${MAX_THEME_VAR_ENTRIES})`,
    });
  }
  TARGETS.forEach(({ fg, bg, min, description }) =>
    checkContrast(map, mode, issues, fg, bg, min, description),
  );
}

export function validateThemeVariantsInput(input: unknown): ThemeValidationResult {
  const canonical = canonicalizeThemeVariantsInput(input);

  const issues: ThemeValidationIssue[] = [];
  THEME_MODES.forEach((mode) => validateMode(canonical[mode] ?? {}, mode, issues));

  const normalized = dropEmptyVariants(canonical);
  return {
    ok: issues.length === 0,
    issues,
    variants: normalized,
    normalized,
  };
}
