const VIDEO_KEYWORDS = [
  "video",
  "clip",
  "reel",
  "short",
  "story",
  "highlight",
  "montage",
  "edit",
  "b-roll",
  "broll",
  "trailer",
  "promo",
  "teaser",
  "cut",
  "footage",
];

export const VIDEO_INTENT_REGEX = new RegExp(
  `\\b(${VIDEO_KEYWORDS.map((keyword) => keyword.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&")).join("|")})\\b`,
  "i",
);

export function detectVideoIntent(input: string | null | undefined): boolean {
  if (typeof input !== "string") return false;
  return VIDEO_INTENT_REGEX.test(input);
}

export function extractPreferHints(options: Record<string, unknown> | null | undefined): string[] {
  if (!options || typeof options !== "object") return [];
  const hints: string[] = [];
  const preferRaw = typeof (options as { prefer?: unknown }).prefer === "string"
    ? (options as { prefer: string }).prefer
    : null;
  if (preferRaw) {
    hints.push(preferRaw.toLowerCase());
  }
  const kindRaw = typeof (options as { kind?: unknown }).kind === "string"
    ? (options as { kind: string }).kind
    : null;
  if (kindRaw) {
    hints.push(kindRaw.toLowerCase());
  }
  return hints;
}
