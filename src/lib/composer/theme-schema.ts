import { z } from "zod";

type Rgb = { r: number; g: number; b: number };

const COLOR_PATTERN =
  /^#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
const SHADOW_PATTERN = /^[0-9\s.px,%()-]+(?:rgba?|hsla?)?[0-9\s.px,%(),.-]*$/i;
const MAX_SHADOW_LENGTH = 140;

const colorString = z
  .string()
  .trim()
  .refine((value) => COLOR_PATTERN.test(value) || value.toLowerCase().startsWith("rgb") || value.toLowerCase().startsWith("hsl"), {
    message: "color must be hex or rgb/hsl",
  });

const radiusValue = z.union([z.number(), z.string().trim()]).transform((value) => {
  const numeric =
    typeof value === "number"
      ? value
      : Number.parseFloat(value.toString().replace(/px$/i, "").trim());
  const clamped = Number.isFinite(numeric) ? Math.min(Math.max(numeric, 0), 32) : 0;
  return clamped;
});

const gapValue = z.union([z.number(), z.string().trim()]).transform((value) => {
  const numeric =
    typeof value === "number"
      ? value
      : Number.parseFloat(value.toString().replace(/px$/i, "").trim());
  const clamped = Number.isFinite(numeric) ? Math.min(Math.max(numeric, 4), 28) : 4;
  return clamped;
});

const shadowValue = z
  .string()
  .trim()
  .max(MAX_SHADOW_LENGTH)
  .refine((value) => SHADOW_PATTERN.test(value), { message: "shadow supports px offsets only" });

const glassinessValue = z.number().min(0).max(1);

const ThemeValuesSchema = z.object({
  accent: colorString,
  surface: colorString,
  card: colorString,
  rail: colorString,
  border: colorString,
  text: colorString,
  textSubtle: colorString,
  shadow: shadowValue,
  radius: radiusValue,
  gap: gapValue,
  glassiness: glassinessValue,
  gradientAccent: colorString.optional(),
  gradientSurface: colorString.optional(),
  gradientRail: colorString.optional(),
});

const ThemeSchema = z.union([
  ThemeValuesSchema,
  z.object({
    light: ThemeValuesSchema,
    dark: ThemeValuesSchema,
  }),
]);

export type ThemeInput = z.input<typeof ThemeSchema>;
export type ThemeValues = z.output<typeof ThemeValuesSchema>;
export type CanonicalTheme = {
  light: ThemeValues;
  dark?: ThemeValues;
};

function hexToRgb(hex: string): Rgb | null {
  const normalized = hex.replace("#", "");
  const expand =
    normalized.length === 3 || normalized.length === 4
      ? normalized
          .split("")
          .map((ch) => ch + ch)
          .join("")
      : normalized;
  if (![6, 8].includes(expand.length)) return null;
  const int = Number.parseInt(expand.slice(0, 6), 16);
  return {
    r: (int >> 16) & 255,
    g: (int >> 8) & 255,
    b: int & 255,
  };
}

function rgbStringToRgb(value: string): Rgb | null {
  const match = value.replace(/\s+/g, "").match(/^rgba?\(([^)]+)\)$/i);
  if (!match) return null;
  const parts = match[1]?.split(',') ?? [];
  const [rStr = '0', gStr = '0', bStr = '0'] = parts.slice(0, 3);
  const r = Number.parseFloat(rStr);
  const g = Number.parseFloat(gStr);
  const b = Number.parseFloat(bStr);
  if ([r, g, b].some((n) => !Number.isFinite(n))) return null;
  return { r, g, b };
}

function hslStringToRgb(value: string): Rgb | null {
  const match = value.replace(/\s+/g, "").match(/^hsla?\(([^)]+)\)$/i);
  if (!match) return null;
  const parts = match[1]?.split(',') ?? [];
  const [hStr = '0', sStr = '0', lStr = '0'] = parts;
  const h = Number.parseFloat(hStr);
  const s = Number.parseFloat(sStr);
  const l = Number.parseFloat(lStr);
  if ([h, s, l].some((n) => !Number.isFinite(n))) return null;
  const hNorm = ((h % 360) + 360) % 360;
  const sNorm = Math.min(Math.max(s / 100, 0), 1);
  const lNorm = Math.min(Math.max(l / 100, 0), 1);
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
  };
}

function parseColor(value: string): Rgb | null {
  if (COLOR_PATTERN.test(value)) return hexToRgb(value);
  if (value.toLowerCase().startsWith("rgb")) return rgbStringToRgb(value);
  if (value.toLowerCase().startsWith("hsl")) return hslStringToRgb(value);
  return null;
}

function relativeLuminance({ r, g, b }: Rgb): number {
  const linear = (channel: number) => {
    const c = channel / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  const nr = linear(r);
  const ng = linear(g);
  const nb = linear(b);
  return 0.2126 * nr + 0.7152 * ng + 0.0722 * nb;
}

function contrastRatio(foreground: string, background: string): number {
  const fg = parseColor(foreground);
  const bg = parseColor(background);
  if (!fg || !bg) return 1;
  const l1 = relativeLuminance(fg);
  const l2 = relativeLuminance(bg);
  const [lighter, darker] = l1 > l2 ? [l1, l2] : [l2, l1];
  return (lighter + 0.05) / (darker + 0.05);
}

function enforceContrast(theme: ThemeValues) {
  const contrastSurface = contrastRatio(theme.text, theme.surface);
  const contrastCard = contrastRatio(theme.text, theme.card);
  if (contrastSurface < 3 || contrastCard < 3) {
    throw new Error("text contrast must be at least 3:1 against surface and card");
  }
}

function normalizeSingleTheme(input: z.input<typeof ThemeValuesSchema>): ThemeValues {
  const parsed = ThemeValuesSchema.parse(input);
  enforceContrast(parsed);
  return parsed;
}

export function normalizeTheme(theme: ThemeInput): CanonicalTheme {
  if ("light" in theme || "dark" in theme) {
    const light = normalizeSingleTheme((theme as { light: ThemeValues }).light);
    const darkInput = (theme as { dark?: ThemeValues }).dark;
    const dark = darkInput ? normalizeSingleTheme(darkInput) : undefined;
    return { light, ...(dark ? { dark } : {}) };
  }
  const single = normalizeSingleTheme(theme as z.input<typeof ThemeValuesSchema>);
  return { light: single };
}

export function toCssVars(theme: CanonicalTheme): Record<string, string> {
  const entries: Record<string, string> = {};

  const assign = (prefix: string, values: ThemeValues) => {
    const p = prefix ? `${prefix}-` : "";
    entries[`--composer-${p}accent`] = values.accent;
    entries[`--composer-${p}surface`] = values.surface;
    entries[`--composer-${p}card`] = values.card;
    entries[`--composer-${p}rail`] = values.rail;
    entries[`--composer-${p}border`] = values.border;
    entries[`--composer-${p}text`] = values.text;
    entries[`--composer-${p}text-subtle`] = values.textSubtle;
    entries[`--composer-${p}shadow`] = values.shadow;
    entries[`--composer-${p}radius`] = `${values.radius}px`;
    entries[`--composer-${p}gap`] = `${values.gap}px`;
    entries[`--composer-${p}glassiness`] = values.glassiness.toString();
    if (values.gradientAccent) entries[`--composer-${p}gradient-accent`] = values.gradientAccent;
    if (values.gradientSurface)
      entries[`--composer-${p}gradient-surface`] = values.gradientSurface;
    if (values.gradientRail) entries[`--composer-${p}gradient-rail`] = values.gradientRail;
  };

  assign("", theme.light);
  if (theme.dark) {
    assign("dark", theme.dark);
  }

  return entries;
}

export { ThemeSchema };
