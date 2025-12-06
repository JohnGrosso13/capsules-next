import { fetchOpenAI, hasOpenAIApiKey } from "@/adapters/ai/openai/server";
import { z } from "zod";
import { STYLER_THEME_TOKEN_CSS_VARS, type ThemeTokenCssVar } from "@/lib/theme/token-registry";
import {
  buildPlanDetails,
  getDefaultStylerThemeVars,
  resolveStylerHeuristicPlan,
  type StylerPlan,
} from "@/lib/theme/styler-heuristics";
import {
  normalizeThemeVariantsInput,
  isVariantEmpty,
  type ThemeVariants,
} from "@/lib/theme/variants";

const OPENAI_MODEL =
  process.env.OPENAI_MODEL ?? process.env.AI_MODEL ?? process.env.GPT_MODEL ?? "gpt-4o-mini";

const RETRY_DELAYS_MS = [0, 800, 2000];
const DEFAULT_THEME_VARS = getDefaultStylerThemeVars();
const CSS_VAR_ALLOWLIST = Array.from(STYLER_THEME_TOKEN_CSS_VARS);
const BASE_SNAPSHOT_KEYS = [
  "--app-bg",
  "--accent-glow",
  "--text",
  "--text-2",
  "--text-on-brand",
  "--card-bg-1",
  "--card-bg-2",
  "--card-border",
  "--card-shadow",
  "--card-hover-bg-1",
  "--card-hover-bg-2",
  "--card-hover-border",
  "--header-glass-top",
  "--header-glass-bottom",
  "--header-tint-from",
  "--header-tint-to",
  "--header-border-color",
  "--header-shadow",
  "--header-scrim",
  "--pill-bg-1",
  "--pill-bg-2",
  "--pill-border",
  "--rail-bg-1",
  "--rail-bg-2",
  "--rail-border",
  "--cta-gradient",
  "--cta-button-gradient",
  "--cta-button-text",
  "--color-brand",
  "--color-brand-strong",
  "--color-brand-foreground",
  "--brand-gradient",
  "--feed-action-bg-1",
  "--feed-action-bg-2",
  "--feed-action-border",
  "--feed-action-border-hover",
  "--feed-action-shadow-hover",
  "--feed-icon-text",
];
const EXTRA_SNAPSHOT_KEYS = [
  "--surface-app",
  "--surface-muted",
  "--surface-elevated",
  "--surface-overlay",
  "--color-fg",
  "--color-fg-muted",
  "--color-fg-subtle",
  "--text-3",
  "--color-border",
  "--color-border-strong",
  "--border-default",
  "--border-strong",
  "--brand-from",
  "--brand-mid",
  "--brand-to",
  "--color-brand-muted",
  "--composer-accent",
  "--composer-accent-soft",
  "--app-feed-width",
  "--rail-action-shadow",
  "--color-danger",
  "--color-warning",
  "--color-success",
  "--color-info",
];

const SURFACE_GUIDE = [
  {
    name: "App shell",
    description: "Global background gradients, ambient glow, and overall vibe.",
    tokens: ["--app-bg", "--accent-glow"],
  },
  {
    name: "Feed cards & panels",
    description: "Primary content surfaces for posts, tiles, and glass panels.",
    tokens: [
      "--card-bg-1",
      "--card-bg-2",
      "--card-border",
      "--card-shadow",
      "--card-hover-bg-1",
      "--card-hover-bg-2",
      "--card-hover-border",
    ],
  },
  {
    name: "Header",
    description: "Navigation glass, tint, border, and scrim along the top bar.",
    tokens: [
      "--header-glass-top",
      "--header-glass-bottom",
      "--header-tint-from",
      "--header-tint-to",
      "--header-border-color",
      "--header-shadow",
      "--header-scrim",
    ],
  },
  {
    name: "Right rail",
    description: "Supplementary column housing widgets and quick actions.",
    tokens: ["--rail-bg-1", "--rail-bg-2", "--rail-border"],
  },
  {
    name: "Rails & layout",
    description: "Rail widths, offsets, and supporting shadows.",
    tokens: ["--app-rail-width", "--connections-rail-offset", "--rail-action-shadow"],
  },
  {
    name: "Pills & status chips",
    description: "Metadata tags, filters, and lightweight highlights.",
    tokens: ["--pill-bg-1", "--pill-bg-2", "--pill-border"],
  },
  {
    name: "Primary CTA & brand",
    description: "Buttons, gradients, and text colors tied to brand identity.",
    tokens: [
      "--cta-gradient",
      "--cta-button-gradient",
      "--cta-button-text",
      "--color-brand",
      "--color-brand-strong",
      "--color-brand-foreground",
      "--brand-gradient",
    ],
  },
  {
    name: "Feed action cards",
    description: "Quick action modules sitting above the feed (e.g. share prompts).",
    tokens: [
      "--feed-action-bg-1",
      "--feed-action-bg-2",
      "--feed-action-border",
      "--feed-action-border-hover",
      "--feed-action-shadow-hover",
      "--feed-icon-text",
    ],
  },
  {
    name: "Social tiles",
    description: "Friends, chats, and requests tiles on the home surface.",
    tokens: [
      "--style-friends-bg",
      "--style-friends-border",
      "--style-friends-text",
      "--style-chats-bg",
      "--style-chats-border",
      "--style-chats-text",
      "--style-requests-bg",
      "--style-requests-border",
      "--style-requests-text",
    ],
  },
  {
    name: "Storefront",
    description: "Store hero, filters, and purchase CTAs.",
    tokens: [
      "--store-hero-bg",
      "--store-hero-border",
      "--store-hero-shadow",
      "--store-filter-bg",
      "--store-filter-highlight",
      "--store-control-bg",
      "--store-control-highlight",
      "--store-filter-pill-bg",
      "--store-filter-pill-border",
      "--store-action-bg",
      "--store-action-border",
      "--store-action-shadow-hover",
      "--store-primary-bg",
      "--store-primary-shadow",
      "--store-step-badge-bg",
    ],
  },
  {
    name: "Studio workspace",
    description: "Create studio panels, scroll tracks, and focus treatments.",
    tokens: [
      "--studio-surface-panel",
      "--studio-surface-muted",
      "--studio-surface-glass",
      "--studio-surface-accent",
      "--studio-surface-highlight",
      "--studio-border-focus",
      "--studio-border-soft",
      "--studio-border-strong",
      "--studio-shadow-soft",
      "--studio-glow-strong",
      "--studio-glow-soft",
      "--studio-scroll-track",
      "--studio-scroll-thumb",
      "--studio-text-primary",
      "--studio-text-secondary",
      "--studio-text-tertiary",
      "--studio-pill-bg",
      "--studio-pill-border",
      "--studio-pill-muted",
    ],
  },
  {
    name: "Composer rails & panels",
    description: "Composer background, rails, panels, overlays, and tab chrome.",
    tokens: [
      "--composer-main-background",
      "--composer-panel-background",
      "--composer-overlay",
      "--composer-overlay-bg",
      "--composer-overlay-border",
      "--composer-overlay-card-bg",
      "--composer-overlay-card-border",
      "--composer-overlay-card-shadow",
      "--composer-rail-background",
      "--composer-rail-border",
      "--composer-rail-shell",
      "--composer-rail-scrollbar",
      "--composer-rail-tab-bg",
      "--composer-rail-tab-border",
      "--composer-rail-tab-color",
      "--composer-rail-tab-hover-color",
      "--composer-rail-tab-active-bg",
      "--composer-rail-tab-active-color",
      "--composer-rail-tab-active-shadow",
      "--composer-rail-tab-focus-shadow",
      "--composer-rail-button-bg",
      "--composer-rail-button-border",
      "--composer-rail-button-text",
      "--composer-rail-button-hover-border",
      "--composer-rail-button-active-border",
      "--composer-rail-button-active-shadow",
      "--composer-text",
      "--composer-shadow",
      "--composer-footer-background",
      "--composer-footer-border",
    ],
  },
  {
    name: "Composer prompt & controls",
    description: "Prompt surface, chips, icon buttons, send/vibe, presets, and voice indicators.",
    tokens: [
      "--composer-prompt-surface-bg",
      "--composer-prompt-surface-border",
      "--composer-prompt-surface-shadow",
      "--composer-prompt-icon-btn-bg",
      "--composer-prompt-icon-btn-border",
      "--composer-prompt-icon-btn-hover-border",
      "--composer-prompt-icon-btn-text",
      "--composer-prompt-input-text",
      "--composer-prompt-input-placeholder",
      "--composer-quick-chip-bg",
      "--composer-quick-chip-border",
      "--composer-quick-chip-hover-border",
      "--composer-quick-chip-text",
      "--composer-send-btn-text",
      "--composer-vibe-btn-bg",
      "--composer-vibe-btn-border",
      "--composer-vibe-btn-text",
      "--composer-preset-btn-bg",
      "--composer-preset-btn-border",
      "--composer-preset-btn-hover-border",
      "--composer-preset-btn-text",
    ],
  },
  {
    name: "Composer attachments & chat",
    description: "Attachment drops, overlay cards, chat badges, and bubble treatments.",
    tokens: [
      "--composer-overlay-bg",
      "--composer-overlay-border",
      "--composer-overlay-card-bg",
      "--composer-overlay-card-border",
      "--composer-overlay-card-shadow",
      "--composer-attachment-bg",
      "--composer-attachment-border",
      "--composer-attachment-hover-bg",
      "--composer-attachment-hover-border",
      "--composer-attachment-surface-bg",
      "--composer-attachment-surface-border",
      "--composer-attachment-surface-shadow",
      "--composer-attachment-ready-bg",
      "--composer-attachment-loading-text",
      "--composer-chat-badge-bg",
      "--composer-chat-badge-text",
      "--composer-chat-badge-shadow",
      "--composer-chat-bubble-bg",
      "--composer-chat-bubble-border",
      "--composer-chat-bubble-shadow",
      "--composer-chat-bubble-text",
      "--composer-chat-bubble-user-bg",
      "--composer-chat-bubble-user-border",
      "--composer-chat-bubble-ai-bg",
      "--composer-chat-streaming",
    ],
  },
  {
    name: "Settings",
    description: "Settings navigation, pills, and accent surfaces.",
    tokens: [
      "--settings-nav-item-background",
      "--settings-nav-item-border",
      "--settings-active-badge-background",
      "--settings-active-badge-border",
      "--settings-color-brand-base",
    ],
  },
  {
    name: "Live & party",
    description: "Live chat rails and party controls/hero surfaces.",
    tokens: [
      "--live-chat-bg",
      "--live-chat-border",
      "--live-chat-message-bg",
      "--live-chat-message-border",
      "--live-chat-message-shadow",
      "--party-hero-background",
      "--party-primary-background",
      "--party-primary-border",
      "--party-control-background",
      "--party-control-border",
      "--party-status-pill-border",
    ],
  },
  {
    name: "AI Studio",
    description: "AI studio cards, glows, chips, and status treatments.",
    tokens: [
      "--ai-studio-border",
      "--ai-studio-card-glare",
      "--ai-studio-card-glow",
      "--ai-studio-hero-glow-a",
      "--ai-studio-hero-glow-b",
      "--ai-studio-icon-bg",
      "--ai-studio-icon-fg",
      "--ai-studio-placeholder",
      "--ai-studio-preview-base",
      "--ai-studio-preview-glow-a",
      "--ai-studio-preview-glow-b",
      "--ai-studio-status-danger",
      "--ai-studio-status-success",
      "--ai-studio-status-danger-ring",
      "--ai-studio-status-success-ring",
      "--ai-studio-surface-muted",
      "--ai-studio-surface-soft",
      "--ai-studio-surface-strong",
      "--ai-studio-text-soft",
      "--ai-studio-text-strong",
      "--ai-studio-text-subtle",
      "--ai-studio-chip-bg",
      "--ai-studio-chip-border",
    ],
  },
  {
    name: "Glass & overlays",
    description: "Shared glassmorphism backgrounds and blur radii.",
    tokens: ["--glass-bg-1", "--glass-bg-2", "--glass-blur"],
  },
  {
    name: "Ladder builder",
    description: "Ladder panels, prompts, call-to-actions, and glow.",
    tokens: [
      "--ladder-surface",
      "--ladder-surface-strong",
      "--ladder-border",
      "--ladder-shadow",
      "--ladder-step-active-text",
      "--ladder-prompter-send-text",
      "--ladder-prompter-status",
    ],
  },
];

const THEME_SNAPSHOT_KEYS = Array.from(
  new Set([...BASE_SNAPSHOT_KEYS, ...SURFACE_GUIDE.flatMap((entry) => entry.tokens), ...EXTRA_SNAPSHOT_KEYS]),
);

const DEFAULT_THEME_SNAPSHOT = Object.fromEntries(
  THEME_SNAPSHOT_KEYS.map((key) => [key, DEFAULT_THEME_VARS[key]]).filter(
    ([, value]) => typeof value === "string" && value.length > 0,
  ),
);

const STYLER_SYSTEM_PROMPT = [
  "You are Capsules AI Styler, responsible for translating natural language into theme updates.",
  "You will receive a JSON contract describing the user's prompt, current theme snapshot, surface guide,",
  "allowed CSS variables, and output schema. Read the contract carefully.",
  'Respond with a JSON object that strictly follows the schema: { "summary": string, "description"?: string, "variants": { "light"?: Record<string,string>, "dark"?: Record<string,string> } }.',
  "Always include BOTH light and dark variants unless the user explicitly forbids one; populate both modes for cohesive coverage.",
  "Scope: theme the app shell, header, rails, cards, CTA, pills, composer (panel, prompt, attachments), ladder builder, store, studio, and feed surfaces; do not leave major surfaces untouched.",
  "Prioritize global surfaces/text/CTA first; add contextual tweaks only after the core is covered.",
  "Only include CSS custom properties from the provided allowlist.",
  "Values must be valid CSS colors, gradients, or shadows (no url(), no external references). Limit custom gradients to at most 3 and keep them readable.",
  "Maintain WCAG-appropriate contrast; keep text on brand/surfaces legible and adjust brand-on-color if needed.",
].join(" ");

const VARIANT_MAP_SCHEMA = z.record(z.string(), z.string());
const VARIANTS_OBJECT_SCHEMA = z.object({
  light: VARIANT_MAP_SCHEMA.optional(),
  dark: VARIANT_MAP_SCHEMA.optional(),
});

const STYLER_RESPONSE_SCHEMA = z
  .object({
    summary: z.string().optional(),
    description: z.string().optional(),
    variants: VARIANTS_OBJECT_SCHEMA.optional(),
    vars: VARIANT_MAP_SCHEMA.optional(),
  })
  .refine(
    (value) => {
      const variantMaps = value.variants ? Object.values(value.variants) : [];
      const hasVariantEntries = variantMaps.some((map) => map && Object.keys(map).length > 0);
      const hasFlatEntries = value.vars ? Object.keys(value.vars).length > 0 : false;
      return hasVariantEntries || hasFlatEntries;
    },
    { message: "variants or vars must include at least one entry" },
  );

const MAX_SUMMARY_LENGTH = 160;
const MAX_DESCRIPTION_LENGTH = 320;
// Allow the model to return a larger set while still under the validator budget (256 per mode)
export const MAX_RETURNED_VARS = 256;

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// High-impact tokens get priority when trimming to the budget.
const HIGH_IMPACT_TOKENS = new Set<ThemeTokenCssVar>([
  "--surface-app",
  "--surface-overlay",
  "--surface-elevated",
  "--surface-muted",
  "--app-bg",
  "--color-fg",
  "--color-fg-muted",
  "--color-fg-subtle",
  "--text-on-brand",
  "--color-brand",
  "--color-brand-strong",
  "--color-accent",
  "--cta-gradient",
  "--cta-button-gradient",
  "--cta-button-text",
  "--gradient-brand",
  "--pill-bg-1",
  "--pill-bg-2",
  "--pill-border",
  "--card-bg-1",
  "--card-bg-2",
  "--card-border",
  "--card-shadow",
  "--card-hover-bg-1",
  "--card-hover-bg-2",
  "--card-hover-border",
  "--header-glass-top",
  "--header-glass-bottom",
  "--header-border-color",
  "--header-shadow",
  "--rail-bg-1",
  "--rail-bg-2",
  "--rail-border",
  "--composer-panel-background",
  "--composer-main-background",
  "--composer-rail-background",
  "--composer-rail-tab-border",
  "--composer-rail-tab-active-bg",
  "--composer-rail-tab-active-color",
  "--composer-text",
  "--composer-shadow",
  "--composer-send-btn-text",
  "--composer-prompt-surface-bg",
  "--composer-prompt-surface-border",
  "--composer-attachment-bg",
  "--store-hero-bg",
  "--store-control-bg",
  "--store-primary-bg",
  "--studio-surface-panel",
  "--studio-text-primary",
]);

export function limitThemeVariants(
  variants: ThemeVariants,
  limit: number,
): ThemeVariants {
  if (limit <= 0) return {};

  const prioritizeEntries = (entries: Array<[string, string]>) => {
    if (entries.length <= limit) return entries;
    const highImpact: Array<[string, string]> = [];
    const exposed: Array<[string, string]> = [];
    const other: Array<[string, string]> = [];
    for (const entry of entries) {
      const [key] = entry;
      if (HIGH_IMPACT_TOKENS.has(key as ThemeTokenCssVar)) {
        highImpact.push(entry);
      } else if (STYLER_THEME_TOKEN_CSS_VARS.has(key as ThemeTokenCssVar)) {
        exposed.push(entry);
      } else {
        other.push(entry);
      }
    }
    return [...highImpact, ...exposed, ...other].slice(0, limit);
  };

  const limited: ThemeVariants = {};
  (["light", "dark"] as const).forEach((mode) => {
    const map = variants[mode];
    if (!map) return;
    const entries = Object.entries(map);
    if (!entries.length) return;
    const trimmedEntries = prioritizeEntries(entries);
    if (!trimmedEntries.length) return;
    limited[mode] = Object.fromEntries(trimmedEntries);
  });
  return limited;
}

function sanitizeLine(text: string, max: number, fallback: string): string {
  if (!text) return fallback;
  const normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized.length) return fallback;
  if (normalized.length <= max) return normalized;
  return `${normalized.slice(0, max - 1)}...`;
}

function buildContractPayload(prompt: string) {
  return {
    prompt,
    theme: {
      snapshot: DEFAULT_THEME_SNAPSHOT,
      brand: {
        primary: DEFAULT_THEME_VARS["--color-brand"] ?? "#2563eb",
        strong: DEFAULT_THEME_VARS["--color-brand-strong"] ?? "#1d4ed8",
        gradient:
          DEFAULT_THEME_VARS["--brand-gradient"] ??
          "linear-gradient(120deg, #3b82f6, #2563eb, #22d3ee)",
        textOnBrand: DEFAULT_THEME_VARS["--text-on-brand"] ?? "#ffffff",
      },
    },
    heuristics: null,
    surfaces: SURFACE_GUIDE.map(({ name, description, tokens }) => ({ name, description, tokens })),
    constraints: {
      allowedCssVariables: CSS_VAR_ALLOWLIST,
      maxVariables: MAX_RETURNED_VARS,
      valueRules: [
        "Use concise CSS color/gradient/shadow values.",
        "Avoid url(), @import, or custom property references outside the allowlist.",
        "Prefer gradients for shell + CTA, complementary tones for cards/rail/header.",
      ],
      brandRequirements: [
        "Keep CTA/button text legible on gradients.",
        "Brand gradients should feel premium and luminous.",
        "Respect dark-mode contrast unless user explicitly requests otherwise.",
      ],
    },
    output: {
      type: "json_object",
      schema: {
        summary: `string (<= ${MAX_SUMMARY_LENGTH} chars) describing the visual direction`,
        description: `optional string (<= ${MAX_DESCRIPTION_LENGTH} chars) with extra guidance`,
        variants: "object with optional light/dark dictionaries of allowed CSS variable updates",
      },
    },
  };
}

function buildChatMessages(prompt: string) {
  const contract = buildContractPayload(prompt);
  return [
    { role: "system" as const, content: STYLER_SYSTEM_PROMPT },
    { role: "user" as const, content: JSON.stringify(contract, null, 2) },
  ];
}

export async function resolveStylerPlan(prompt: string): Promise<StylerPlan | null> {
  const heuristic = resolveStylerHeuristicPlan(prompt);
  if (heuristic) {
    return heuristic;
  }
  return await runOpenAiStyler(prompt);
}

async function runOpenAiStyler(prompt: string): Promise<StylerPlan | null> {
  if (!hasOpenAIApiKey()) return null;

  const messages = buildChatMessages(prompt);
  const payload = {
    model: OPENAI_MODEL,
    response_format: { type: "json_object" as const },
    temperature: 0.4,
    messages,
  };

  const start = Date.now();
  let lastError: unknown = null;

  for (let attempt = 0; attempt < RETRY_DELAYS_MS.length; attempt++) {
    const delay = RETRY_DELAYS_MS[attempt] ?? 0;
    if (delay > 0) await wait(delay);

    try {
      const response = await fetchOpenAI("/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const rawText = await response.text();
      if (!response.ok) {
        const shouldRetry = response.status >= 500 || response.status === 429;
        lastError = new Error(`OpenAI request failed (${response.status})`);
        console.warn("styler ai response error", {
          status: response.status,
          attempt: attempt + 1,
          retriable: shouldRetry,
          body: rawText.slice(0, 1000),
        });
        if (shouldRetry && attempt < RETRY_DELAYS_MS.length - 1) {
          continue;
        }
        return null;
      }

      type OpenAIChatResponse = {
        choices?: Array<{ message?: { content?: string | null } | null } | null>;
      };
      let raw: OpenAIChatResponse | null = null;
      try {
        raw = JSON.parse(rawText) as OpenAIChatResponse;
      } catch (error) {
        lastError = error;
        console.warn("styler ai response parse error", error, rawText.slice(0, 1000));
        if (attempt < RETRY_DELAYS_MS.length - 1) continue;
        return null;
      }

      const content = raw?.choices?.[0]?.message?.content ?? null;
      if (!content) {
        console.warn("styler ai empty content", { attempt: attempt + 1 });
        if (attempt < RETRY_DELAYS_MS.length - 1) continue;
        return null;
      }

      let parsedJson: unknown;
      try {
        parsedJson = JSON.parse(content);
      } catch (error) {
        lastError = error;
        console.warn("styler ai content parse error", error, content.slice(0, 1000));
        if (attempt < RETRY_DELAYS_MS.length - 1) continue;
        return null;
      }

      const validation = STYLER_RESPONSE_SCHEMA.safeParse(parsedJson);
      if (!validation.success) {
        lastError = validation.error;
        console.warn("styler ai schema error", validation.error.issues);
        if (attempt < RETRY_DELAYS_MS.length - 1) continue;
        return null;
      }

      const summary = sanitizeLine(
        validation.data.summary ?? "",
        MAX_SUMMARY_LENGTH,
        "Updated your capsule style.",
      );
      const description = sanitizeLine(
        validation.data.description ?? "",
        MAX_DESCRIPTION_LENGTH,
        "",
      );

      const rawVariants = validation.data.variants ?? validation.data.vars ?? {};
      const normalizedVariants = normalizeThemeVariantsInput(rawVariants);
      const limitedVariants = limitThemeVariants(normalizedVariants, MAX_RETURNED_VARS);

      if (isVariantEmpty(limitedVariants)) {
        console.warn("styler ai produced no variants", { attempt: attempt + 1 });
        if (attempt < RETRY_DELAYS_MS.length - 1) continue;
        return null;
      }

      const detailsFromUsage = buildPlanDetails(prompt, limitedVariants);
      const combinedDetails = [description, detailsFromUsage]
        .map((value) => value?.trim())
        .filter(Boolean)
        .join(" - ");

      const plan: StylerPlan = {
        summary,
        variants: limitedVariants,
        source: "ai",
      };
      if (combinedDetails.length) {
        plan.details = combinedDetails;
      }

      console.info("styler_ai_telemetry", {
        prompt: prompt.length > 240 ? `${prompt.slice(0, 239)}...` : prompt,
        summary,
        varCount:
          (limitedVariants.light ? Object.keys(limitedVariants.light).length : 0) +
          (limitedVariants.dark ? Object.keys(limitedVariants.dark).length : 0),
        attempt: attempt + 1,
        durationMs: Date.now() - start,
      });

      return plan;
    } catch (error) {
      lastError = error;
      console.error("styler ai request error", error);
      if (attempt === RETRY_DELAYS_MS.length - 1) {
        return null;
      }
    }
  }

  console.error("styler ai request failed", lastError);
  return null;
}
