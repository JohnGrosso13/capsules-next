export const MAX_THEME_VAR_KEY_LENGTH = 80;
export const MAX_THEME_VAR_VALUE_LENGTH = 400;

export function normalizeThemeVars(input: unknown): Record<string, string> {
  if (!input || typeof input !== "object") return {};
  const entries = Object.entries(input as Record<string, unknown>);
  if (!entries.length) return {};
  const map: Record<string, string> = {};
  for (const [rawKey, rawValue] of entries) {
    if (typeof rawKey !== "string") continue;
    const key = rawKey.trim();
    if (!key.startsWith("--") || key.length > MAX_THEME_VAR_KEY_LENGTH) continue;
    if (typeof rawValue !== "string") continue;
    const value = rawValue.trim();
    if (!value || value.length > MAX_THEME_VAR_VALUE_LENGTH) continue;
    const lower = value.toLowerCase();
    if (lower.includes("url(") || lower.includes("expression(")) continue;
    map[key] = value;
  }
  return map;
}
