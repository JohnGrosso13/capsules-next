import { THEME_TOKEN_CSS_VARS, themeTokenMetaByCssVar } from "./token-registry";

export const MAX_THEME_VAR_KEY_LENGTH = 80;
export const MAX_THEME_VAR_VALUE_LENGTH = 400;
export const MAX_THEME_VAR_ENTRIES = 72;

const ALLOWED_THEME_VAR_KEYS_ARRAY = Object.freeze(Array.from(THEME_TOKEN_CSS_VARS));
const ALLOWED_THEME_VAR_SET = new Set<string>(ALLOWED_THEME_VAR_KEYS_ARRAY);
const THEME_TOKEN_META = themeTokenMetaByCssVar as Record<string, { valueKind: string }>;

type ThemeVarRecord = Record<string, string>;

type NormalizeThemeVarsImpl = (
  input: unknown,
  allowed: Set<string>,
  maxKeyLength: number,
  maxValueLength: number,
  meta: Record<string, { valueKind: string }>,
  maxEntries?: number,
) => ThemeVarRecord;

const normalizeThemeVarsImpl: NormalizeThemeVarsImpl = (
  input,
  allowed,
  maxKeyLength,
  maxValueLength,
  meta,
  maxEntries = MAX_THEME_VAR_ENTRIES,
) => {
  if (!input || typeof input !== "object") return {};
  const entries = Object.entries(input as Record<string, unknown>);
  if (!entries.length) return {};

  const safeValueRegex = /^[A-Za-z0-9#(),.%\/_\-\s:+*'"!]+$/;
  const cssVarReferenceRegex = /^var\(--[a-z0-9\-_]+\)$/i;
  const hexColorRegex = /^#(?:[0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
  const rgbColorRegex = /^rgba?\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}(?:\s*,\s*(?:0|1|0?\.\d+))?\s*\)$/i;
  const hslColorRegex = /^hsla?\(\s*\d{1,3}(?:deg|rad|turn)?\s*,\s*\d{1,3}%\s*,\s*\d{1,3}%(?:\s*,\s*(?:0|1|0?\.\d+))?\s*\)$/i;
  const colorMixRegex = /^color-mix\(/i;
  const colorFunctionRegex = /^(?:color|lab|lch|oklab|oklch|hwb)\(/i;
  const gradientRegex = /\bgradient\(/i;
  const shadowRegex = /(?:^|,)\s*(?:inset\s+)?-?\d+(?:\.\d+)?(?:px|rem|em|vh|vw|%)\s+-?\d+(?:\.\d+)?(?:px|rem|em|vh|vw|%)/i;
  const dimensionRegex = /^-?\d+(?:\.\d+)?(?:px|rem|em|vh|vw|%)$/i;
  const timeRegex = /^-?\d+(?:\.\d+)?(?:ms|s)$/i;
  const calcRegex = /^calc\([^)]*\)$/i;
  const timingFunctionKeywords = new Set([
    "linear",
    "ease",
    "ease-in",
    "ease-out",
    "ease-in-out",
    "step-start",
    "step-end",
  ]);

  const isCssVarReference = (value: string): boolean => cssVarReferenceRegex.test(value);
  const hasSafeCharacters = (value: string): boolean => safeValueRegex.test(value);

  const isColorValue = (value: string): boolean =>
    hexColorRegex.test(value) ||
    rgbColorRegex.test(value) ||
    hslColorRegex.test(value) ||
    colorMixRegex.test(value) ||
    colorFunctionRegex.test(value) ||
    isCssVarReference(value) ||
    /^(transparent|currentcolor|inherit)$/i.test(value);

  const isGradientValue = (value: string): boolean => gradientRegex.test(value) || isCssVarReference(value);
  const isShadowValue = (value: string): boolean =>
    shadowRegex.test(value) || value.includes("shadow") || isCssVarReference(value);
  const isDimensionValue = (value: string): boolean =>
    dimensionRegex.test(value) || calcRegex.test(value) || isCssVarReference(value);
  const isRadiusValue = (value: string): boolean => isDimensionValue(value) || /^999px$/i.test(value);
  const isTimeValue = (value: string): boolean => timeRegex.test(value) || calcRegex.test(value) || isCssVarReference(value);
  const isTimingFunctionValue = (value: string): boolean =>
    value.startsWith("cubic-bezier(") ||
    value.startsWith("steps(") ||
    timingFunctionKeywords.has(value.toLowerCase()) ||
    isCssVarReference(value);
  const isFontFamilyValue = (value: string): boolean => /^[A-Za-z0-9\s,'"-]+$/.test(value) || isCssVarReference(value);

  const isValueAllowedForKind = (kind: string, value: string): boolean => {
    switch (kind) {
      case "color":
        return isColorValue(value);
      case "gradient":
        return isGradientValue(value);
      case "shadow":
        return isShadowValue(value);
      case "radius":
        return isRadiusValue(value);
      case "dimension":
        return isDimensionValue(value);
      case "fontFamily":
        return isFontFamilyValue(value);
      case "time":
        return isTimeValue(value);
      case "timingFunction":
        return isTimingFunctionValue(value);
      default:
        return true;
    }
  };

  const map: ThemeVarRecord = {};
  let count = 0;

  for (const [rawKey, rawValue] of entries) {
    if (typeof rawKey !== "string" || typeof rawValue !== "string") continue;
    const key = rawKey.trim();
    if (!key.startsWith("--") || key.length > maxKeyLength) continue;
    if (!allowed.has(key)) continue;

    const metaForKey = meta[key];
    if (!metaForKey) continue;

    const value = rawValue.trim();
    if (!value || value.length > maxValueLength) continue;
    if (!hasSafeCharacters(value)) continue;
    const lower = value.toLowerCase();
    if (lower.includes("url(") || lower.includes("expression(")) continue;
    if (!isValueAllowedForKind(metaForKey.valueKind, value)) continue;

    map[key] = value;
    count += 1;
    if (count >= maxEntries) break;
  }

  return map;
};

export const ALLOWED_THEME_VAR_KEYS = ALLOWED_THEME_VAR_KEYS_ARRAY;

export function normalizeThemeVars(input: unknown): ThemeVarRecord {
  return normalizeThemeVarsImpl(
    input,
    ALLOWED_THEME_VAR_SET,
    MAX_THEME_VAR_KEY_LENGTH,
    MAX_THEME_VAR_VALUE_LENGTH,
    THEME_TOKEN_META,
    MAX_THEME_VAR_ENTRIES,
  );
}

const NORMALIZE_THEME_VARS_IMPL_SOURCE = normalizeThemeVarsImpl.toString();
const ALLOWED_THEME_VAR_KEYS_SOURCE = JSON.stringify(ALLOWED_THEME_VAR_KEYS_ARRAY);
const THEME_TOKEN_META_SOURCE = JSON.stringify(THEME_TOKEN_META);

export const NORMALIZE_THEME_VARS_BOOTSTRAP_SOURCE = `(function(){
  const allowed = new Set(${ALLOWED_THEME_VAR_KEYS_SOURCE});
  const maxKeyLength = ${MAX_THEME_VAR_KEY_LENGTH};
  const maxValueLength = ${MAX_THEME_VAR_VALUE_LENGTH};
  const meta = ${THEME_TOKEN_META_SOURCE};
  const maxEntries = ${MAX_THEME_VAR_ENTRIES};
  const impl = ${NORMALIZE_THEME_VARS_IMPL_SOURCE};
  return function(input){
    return impl(input, allowed, maxKeyLength, maxValueLength, meta, maxEntries);
  };
})()`;
