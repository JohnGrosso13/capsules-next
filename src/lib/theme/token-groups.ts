import {
  themeTokenRegistry,
  type ThemeTokenCategory,
  type ThemeTokenCssVar,
  type ThemeTokenDefinition,
} from "./token-registry";

export type ThemeTokenIntentGroupId =
  | "brand"
  | "surface"
  | "typography"
  | "borders"
  | "shadow"
  | "spacing"
  | "motion"
  | "feedback"
  | "utility";

export type ThemeTokenIntentGroup = {
  readonly id: ThemeTokenIntentGroupId;
  readonly label: string;
  readonly categories: readonly ThemeTokenCategory[];
  readonly keywords: readonly string[];
  readonly highlightCssVars?: readonly ThemeTokenCssVar[];
};

const GROUP_DEFINITIONS: ThemeTokenIntentGroup[] = [
  {
    id: "brand",
    label: "Brand & Accent",
    categories: ["brand"],
    keywords: [
      "brand",
      "primary",
      "accent",
      "cta",
      "call to action",
      "button",
      "buttons",
      "highlight",
      "vivid",
      "colorful",
    ],
    highlightCssVars: ["--gradient-brand", "--color-brand", "--color-accent"],
  },
  {
    id: "surface",
    label: "Surfaces & Panels",
    categories: ["surface", "card", "glass", "dock"],
    keywords: [
      "background",
      "surface",
      "panel",
      "panels",
      "card",
      "cards",
      "glass",
      "dock",
      "shell",
      "canvas",
      "app background",
      "backdrop",
    ],
    highlightCssVars: ["--surface-app", "--card-bg-1", "--card-bg-2"],
  },
  {
    id: "typography",
    label: "Typography & Copy",
    categories: ["text", "typography"],
    keywords: [
      "text",
      "copy",
      "font",
      "fonts",
      "type",
      "typography",
      "headline",
      "title",
      "body",
      "label",
    ],
    highlightCssVars: ["--color-fg", "--color-fg-muted", "--font-sans"],
  },
  {
    id: "borders",
    label: "Borders & Strokes",
    categories: ["border"],
    keywords: ["border", "borders", "outline", "stroke", "divider", "frame", "rim"],
    highlightCssVars: ["--color-border", "--color-border-strong"],
  },
  {
    id: "shadow",
    label: "Shadow & Depth",
    categories: ["shadow", "ring"],
    keywords: [
      "shadow",
      "shadows",
      "glow",
      "glows",
      "depth",
      "elevation",
      "focus",
      "ring",
      "halo",
      "lift",
    ],
    highlightCssVars: ["--shadow-md", "--shadow-glow", "--ring-primary"],
  },
  {
    id: "spacing",
    label: "Spacing & Layout",
    categories: ["spacing", "layout", "radius"],
    keywords: [
      "spacing",
      "space",
      "gap",
      "gaps",
      "layout",
      "grid",
      "padding",
      "margin",
      "rounded",
      "round",
      "pill",
      "corners",
      "radius",
      "stack",
    ],
    highlightCssVars: ["--layout-page-gap", "--layout-column-gap", "--radius-md"],
  },
  {
    id: "motion",
    label: "Motion & Timing",
    categories: ["motion"],
    keywords: [
      "motion",
      "animation",
      "animations",
      "transition",
      "transitions",
      "timing",
      "speed",
      "snappy",
      "slow",
      "fast",
      "ease",
    ],
    highlightCssVars: ["--motion-duration-medium", "--motion-ease-standard"],
  },
  {
    id: "feedback",
    label: "Status & Feedback",
    categories: ["feedback", "presence"],
    keywords: [
      "status",
      "feedback",
      "success",
      "warning",
      "danger",
      "error",
      "alert",
      "presence",
      "online",
      "offline",
      "indicator",
    ],
    highlightCssVars: ["--color-success", "--color-warning", "--presence-online-dot"],
  },
  {
    id: "utility",
    label: "Utility",
    categories: ["utility"],
    keywords: ["utility", "ring", "offset", "helper", "misc"],
    highlightCssVars: ["--ring-offset"],
  },
];

export const THEME_TOKEN_INTENT_GROUPS = GROUP_DEFINITIONS as readonly ThemeTokenIntentGroup[];

const GROUP_BY_ID = new Map<ThemeTokenIntentGroupId, ThemeTokenIntentGroup>(
  THEME_TOKEN_INTENT_GROUPS.map((group) => [group.id, group]),
);

const CATEGORY_TO_GROUP = new Map<ThemeTokenCategory, ThemeTokenIntentGroupId>();
THEME_TOKEN_INTENT_GROUPS.forEach((group) => {
  group.categories.forEach((category) => {
    if (!CATEGORY_TO_GROUP.has(category)) {
      CATEGORY_TO_GROUP.set(category, group.id);
    }
  });
});

const TOKEN_GROUP_BY_CSS_VAR = new Map<ThemeTokenCssVar, ThemeTokenIntentGroupId>();

const mapTokenToGroup = (token: ThemeTokenDefinition) => {
  const groupId = CATEGORY_TO_GROUP.get(token.category);
  if (groupId) {
    TOKEN_GROUP_BY_CSS_VAR.set(token.cssVar as ThemeTokenCssVar, groupId);
  }
};

themeTokenRegistry.forEach(mapTokenToGroup);

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const buildMatcher = (keyword: string): ((text: string) => boolean) => {
  const term = keyword.toLowerCase();
  if (term.includes(" ")) {
    const normalized = term.replace(/\s+/g, " ");
    return (text) => text.includes(normalized);
  }
  const pattern = new RegExp(`\\b${escapeRegExp(term)}\\b`, "i");
  return (text) => pattern.test(text);
};

const GROUP_KEYWORD_MATCHERS = THEME_TOKEN_INTENT_GROUPS.map((group) => ({
  group,
  matchers: group.keywords.map(buildMatcher),
}));

export type ThemeTokenGroupUsage = {
  readonly group: ThemeTokenIntentGroup;
  readonly count: number;
};

export function detectIntentGroupsFromPrompt(prompt: string): ThemeTokenIntentGroup[] {
  const text = (prompt || "").toLowerCase();
  if (!text.trim()) return [];
  const matched = new Set<ThemeTokenIntentGroupId>();
  for (const { group, matchers } of GROUP_KEYWORD_MATCHERS) {
    if (matchers.some((matcher) => matcher(text))) {
      matched.add(group.id);
    }
  }
  return THEME_TOKEN_INTENT_GROUPS.filter((group) => matched.has(group.id));
}

export function groupUsageFromVars(vars: Record<string, string>): ThemeTokenGroupUsage[] {
  const counts = new Map<ThemeTokenIntentGroupId, number>();
  for (const key of Object.keys(vars)) {
    const groupId = TOKEN_GROUP_BY_CSS_VAR.get(key as ThemeTokenCssVar);
    if (!groupId) continue;
    counts.set(groupId, (counts.get(groupId) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([id, count]) => ({ group: GROUP_BY_ID.get(id)!, count }))
    .filter((entry) => entry.group != null)
    .sort((a, b) => b.count - a.count || a.group.label.localeCompare(b.group.label));
}

export function summarizeGroupLabels(
  usages: ReadonlyArray<ThemeTokenGroupUsage>,
  limit = 3,
): string {
  if (!usages.length) return "";
  const labels = usages.slice(0, limit).map((usage) => usage.group.label);
  if (labels.length === 1) return labels[0]!;
  if (labels.length === 2) return `${labels[0]!} & ${labels[1]!}`;
  return `${labels.slice(0, -1).join(", ")} & ${labels[labels.length - 1]!}`;
}

const PALETTE_PRIORITY: ThemeTokenCssVar[] = [
  "--gradient-brand",
  "--color-brand",
  "--color-brand-strong",
  "--color-accent",
  "--surface-app",
  "--card-bg-1",
  "--card-bg-2",
];

const UNIQUE_BOUNDARY = 6;

export function extractThemePalette(vars: Record<string, string>, limit = 4): string[] {
  const palette: string[] = [];
  const seen = new Set<string>();

  const pushValue = (value: string | undefined) => {
    if (!value) return;
    const trimmed = value.trim();
    if (!trimmed) return;
    if (seen.has(trimmed)) return;
    seen.add(trimmed);
    palette.push(trimmed);
  };

  for (const key of PALETTE_PRIORITY) {
    pushValue(vars[key]);
    if (palette.length >= limit) return palette.slice(0, limit);
  }

  if (palette.length < limit) {
    for (const [key, value] of Object.entries(vars)) {
      if (palette.length >= UNIQUE_BOUNDARY) break;
      if (palette.length >= limit) break;
      const groupId = TOKEN_GROUP_BY_CSS_VAR.get(key as ThemeTokenCssVar);
      if (groupId === "brand" || groupId === "surface" || groupId === "feedback") {
        pushValue(value);
      }
    }
  }

  return palette.slice(0, limit);
}

export type ThemePreviewInsight = {
  readonly palette: readonly string[];
  readonly usages: readonly ThemeTokenGroupUsage[];
};

export function buildThemePreview(vars: Record<string, string>): ThemePreviewInsight {
  const usages = groupUsageFromVars(vars);
  const palette = extractThemePalette(vars);
  return { usages, palette };
}

export function getIntentGroupById(id: ThemeTokenIntentGroupId): ThemeTokenIntentGroup | undefined {
  return GROUP_BY_ID.get(id);
}
