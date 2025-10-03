import { THEME_TOKEN_CSS_VARS } from "./token-registry";

export const MAX_THEME_VAR_KEY_LENGTH = 80;
export const MAX_THEME_VAR_VALUE_LENGTH = 400;

const ALLOWED_THEME_VAR_KEYS_ARRAY = Object.freeze(Array.from(THEME_TOKEN_CSS_VARS));
const ALLOWED_THEME_VAR_SET = new Set<string>(ALLOWED_THEME_VAR_KEYS_ARRAY);

type ThemeVarRecord = Record<string, string>;

type NormalizeThemeVarsImpl = (
  input: unknown,
  allowed: Set<string>,
  maxKeyLength: number,
  maxValueLength: number,
) => ThemeVarRecord;

const normalizeThemeVarsImpl: NormalizeThemeVarsImpl = (
  input,
  allowed,
  maxKeyLength,
  maxValueLength,
) => {
  if (!input || typeof input !== "object") return {};
  const entries = Object.entries(input as Record<string, unknown>);
  if (!entries.length) return {};
  const map: ThemeVarRecord = {};
  for (const [rawKey, rawValue] of entries) {
    if (typeof rawKey !== "string") continue;
    const key = rawKey.trim();
    if (!key.startsWith("--") || key.length > maxKeyLength) continue;
    if (!allowed.has(key)) continue;
    if (typeof rawValue !== "string") continue;
    const value = rawValue.trim();
    if (!value || value.length > maxValueLength) continue;
    const lower = value.toLowerCase();
    if (lower.includes("url(") || lower.includes("expression(")) continue;
    map[key] = value;
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
  );
}

const NORMALIZE_THEME_VARS_IMPL_SOURCE = normalizeThemeVarsImpl.toString();
const ALLOWED_THEME_VAR_KEYS_SOURCE = JSON.stringify(ALLOWED_THEME_VAR_KEYS_ARRAY);

export const NORMALIZE_THEME_VARS_BOOTSTRAP_SOURCE = `(function(){
  const allowed = new Set(${ALLOWED_THEME_VAR_KEYS_SOURCE});
  const maxKeyLength = ${MAX_THEME_VAR_KEY_LENGTH};
  const maxValueLength = ${MAX_THEME_VAR_VALUE_LENGTH};
  const impl = ${NORMALIZE_THEME_VARS_IMPL_SOURCE};
  return function(input){
    return impl(input, allowed, maxKeyLength, maxValueLength);
  };
})()`;
