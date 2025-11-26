export type IdentityAccent = {
  primary: string;
  glow: string;
  surface: string;
  border: string;
  text: string;
  initials: string;
};

const HUE_PRESETS = [226, 18, 208, 288, 42, 158, 342, 98, 266, 12];

const paletteCache = new Map<string, IdentityAccent>();

const DEFAULT_ACCENT: IdentityAccent = {
  primary: "var(--identity-color, hsl(226deg 80% 64%))",
  glow: "var(--identity-glow, hsla(226deg 88% 64% / 0.45))",
  surface: "var(--identity-surface, hsla(226deg 82% 64% / 0.18))",
  border: "var(--identity-border, hsla(226deg 88% 74% / 0.55))",
  text: "var(--identity-text, #050b1f)",
  initials: "#",
};

function hashString(value: string): number {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(index);
    hash |= 0; // Convert to 32bit integer
  }
  return Math.abs(hash);
}

function resolveInitials(value: string): string {
  const normalized = value.trim();
  if (!normalized.length) return "#";
  const letters = normalized
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word[0] ?? "")
    .filter((char): char is string => Boolean(char) && /[A-Za-z0-9]/.test(char));
  if (letters.length >= 2) {
    const [first, second] = letters;
    return `${first}${second}`.toUpperCase();
  }
  if (letters.length === 1) {
    return letters[0]!.toUpperCase();
  }
  return normalized.slice(0, 2).toUpperCase();
}

export function getIdentityAccent(source: string, fallbackIndex = 0): IdentityAccent {
  const key = `${source}::${fallbackIndex}`;
  if (paletteCache.has(key)) {
    return paletteCache.get(key) ?? DEFAULT_ACCENT;
  }
  const base = source && source.trim().length ? source : `fallback-${fallbackIndex}`;
  const hash = hashString(base);
  const hue = HUE_PRESETS[hash % HUE_PRESETS.length] ?? HUE_PRESETS[fallbackIndex % HUE_PRESETS.length];
  const accent: IdentityAccent = {
    primary: `var(--identity-color, hsl(${hue}deg 78% 63%))`,
    glow: `var(--identity-glow, hsla(${hue}deg 86% 64% / 0.45))`,
    surface: `var(--identity-surface, hsla(${hue}deg 88% 64% / 0.16))`,
    border: `var(--identity-border, hsla(${hue}deg 92% 72% / 0.55))`,
    text: `var(--identity-text, #050b1f)`,
    initials: resolveInitials(base),
  };
  paletteCache.set(key, accent);
  return accent;
}
