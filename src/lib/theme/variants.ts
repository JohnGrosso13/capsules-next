import { normalizeThemeVars } from "./shared";

export type ThemeMode = "light" | "dark";
export type ThemeVariants = Partial<Record<ThemeMode, Record<string, string>>>;
export type ThemeVariantsInput = ThemeVariants | Record<string, unknown> | null | undefined;


export const THEME_MODES: readonly ThemeMode[] = ["light", "dark"] as const;

function prepareVariantMap(input: unknown): Record<string, string> {
  const normalized = normalizeThemeVars(input);
  if (!Object.keys(normalized).length) return {};
  return normalized;
}

function ensureVariantMaps(input: unknown): Record<ThemeMode, Record<string, string>> {
  const canonical: Record<ThemeMode, Record<string, string>> = { light: {}, dark: {} };
  if (!input || typeof input !== "object") {
    return canonical;
  }

  const candidate = input as Record<string, unknown>;
  const hasLight = candidate.light && typeof candidate.light === "object";
  const hasDark = candidate.dark && typeof candidate.dark === "object";

  if (hasLight || hasDark) {
    const light = hasLight ? prepareVariantMap(candidate.light) : {};
    const dark = hasDark ? prepareVariantMap(candidate.dark) : {};
    canonical.light = Object.keys(light).length ? light : {};
    canonical.dark = Object.keys(dark).length ? dark : {};
  } else {
    const fallback = prepareVariantMap(candidate);
    canonical.light = Object.keys(fallback).length ? { ...fallback } : {};
    canonical.dark = Object.keys(fallback).length ? { ...fallback } : {};
  }

  const hasLightValues = Object.keys(canonical.light).length > 0;
  const hasDarkValues = Object.keys(canonical.dark).length > 0;

  if (hasLightValues && !hasDarkValues) {
    canonical.dark = { ...canonical.light };
  } else if (!hasLightValues && hasDarkValues) {
    canonical.light = { ...canonical.dark };
  }

  return canonical;
}

export function canonicalizeThemeVariantsInput(input: unknown): Record<ThemeMode, Record<string, string>> {
  return ensureVariantMaps(input);
}

export function dropEmptyVariants(variants: Record<ThemeMode, Record<string, string>>): ThemeVariants {
  const result: ThemeVariants = {};
  for (const mode of THEME_MODES) {
    const map = variants[mode];
    if (map && Object.keys(map).length) {
      result[mode] = map;
    }
  }
  return result;
}

export function normalizeThemeVariantsInput(input: unknown): ThemeVariants {
  const canonical = canonicalizeThemeVariantsInput(input);
  return dropEmptyVariants(canonical);
}

export function expandThemeVariants(variants: ThemeVariants): Record<ThemeMode, Record<string, string>> {
  return ensureVariantMaps(variants);
}

export function isVariantEmpty(variants: ThemeVariants): boolean {
  return !THEME_MODES.some((mode) => {
    const map = variants[mode];
    return map && Object.keys(map).length > 0;
  });
}

export function variantForMode(variants: ThemeVariants, mode: ThemeMode): Record<string, string> {
  const direct = variants[mode];
  if (direct && Object.keys(direct).length) return direct;
  const fallback = variants[mode === "light" ? "dark" : "light"];
  return fallback ? { ...fallback } : {};
}

function canonicalizeForCompare(variants: ThemeVariants): Record<ThemeMode, Record<string, string>> {
  const expanded = expandThemeVariants(variants);
  const light = expanded.light;
  const dark = expanded.dark;
  const resolvedLight = Object.keys(light).length ? light : dark;
  const resolvedDark = Object.keys(dark).length ? dark : light;
  return {
    light: { ...resolvedLight },
    dark: { ...resolvedDark },
  };
}

export function variantsEqual(a: ThemeVariants, b: ThemeVariants): boolean {
  const canonicalA = canonicalizeForCompare(a);
  const canonicalB = canonicalizeForCompare(b);
  return THEME_MODES.every((mode) => {
    const mapA = canonicalA[mode];
    const mapB = canonicalB[mode];
    const keysA = Object.keys(mapA);
    const keysB = Object.keys(mapB);
    if (keysA.length !== keysB.length) return false;
    return keysA.every((key) => mapA[key] === mapB[key]);
  });
}

export function collectVariantKeys(variants: ThemeVariants | Record<ThemeMode, Record<string, string>>): string[] {
  const keys = new Set<string>();
  for (const mode of THEME_MODES) {
    const map = (variants as Record<string, Record<string, string> | undefined>)[mode];
    if (!map) continue;
    Object.keys(map).forEach((key) => {
      if (key.startsWith("--")) {
        keys.add(key);
      }
    });
  }
  return Array.from(keys);
}
