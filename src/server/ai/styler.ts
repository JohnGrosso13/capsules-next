
import { z } from "zod";
import { ALLOWED_THEME_VAR_KEYS } from "@/lib/theme/shared";
import {
  buildPlanDetails,
  getDefaultStylerThemeVars,
  resolveStylerHeuristicPlan,
  type StylerPlan,
} from "@/lib/theme/styler-heuristics";
import { normalizeThemeVariantsInput, isVariantEmpty, type ThemeVariants } from "@/lib/theme/variants";

const OPENAI_API_KEY =
  process.env.OPENAI_API_KEY ?? process.env.OPENAI_KEY ?? process.env.OPENAI_SECRET_KEY ?? null;

const OPENAI_MODEL =
  process.env.OPENAI_MODEL ?? process.env.AI_MODEL ?? process.env.GPT_MODEL ?? "gpt-4o-mini";

const RETRY_DELAYS_MS = [0, 800, 2000];
const DEFAULT_THEME_VARS = getDefaultStylerThemeVars();
const CSS_VAR_ALLOWLIST = Array.from(ALLOWED_THEME_VAR_KEYS);
const THEME_SNAPSHOT_KEYS = [
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

const DEFAULT_THEME_SNAPSHOT = Object.fromEntries(
  THEME_SNAPSHOT_KEYS
    .map((key) => [key, DEFAULT_THEME_VARS[key]])
    .filter(([, value]) => typeof value === "string" && value.length > 0),
);

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
];

const STYLER_SYSTEM_PROMPT = [
  "You are Capsules AI Styler, responsible for translating natural language into theme updates.",
  "You will receive a JSON contract describing the user's prompt, current theme snapshot, surface guide,",
  "allowed CSS variables, and output schema. Read the contract carefully.",
  "Respond with a JSON object that strictly follows the schema: { "summary": string, "description"?: string, "variants": { "light"?: Record<string,string>, "dark"?: Record<string,string> } }.",
  "Always include both light and dark variants unless the prompt restricts to one mode.",
  "Only include CSS custom properties from the provided allowlist.",
  "Values must be valid CSS colors, gradients, or shadows (no url(), no external references).",
  "Prefer cohesive, site-wide updates. Cover app shell, cards, header, rail, CTA, and feed surfaces.",
  "Maintain legible contrast and keep text on brand surfaces readable.",
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
  .refine((value) => {
    const variantMaps = value.variants ? Object.values(value.variants) : [];
    const hasVariantEntries = variantMaps.some((map) => map && Object.keys(map).length > 0);
    const hasFlatEntries = value.vars ? Object.keys(value.vars).length > 0 : false;
    return hasVariantEntries || hasFlatEntries;
  }, { message: "variants or vars must include at least one entry" });

const MAX_SUMMARY_LENGTH = 160;
const MAX_DESCRIPTION_LENGTH = 320;
const MAX_RETURNED_VARS = 64;

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function limitThemeVariants(variants: ThemeVariants, limit: number): ThemeVariants {
  if (limit <= 0) return {};
  const limited: ThemeVariants = {};
  (["light", "dark"] as const).forEach((mode) => {
    const map = variants[mode];
    if (!map) return;
    const entries = Object.entries(map);
    if (!entries.length) return;
    limited[mode] = Object.fromEntries(entries.slice(0, limit));
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
        primary: DEFAULT_THEME_VARS["--color-brand"] ?? "#6366f1",
        strong: DEFAULT_THEME_VARS["--color-brand-strong"] ?? "#4f46e5",
        gradient: DEFAULT_THEME_VARS["--brand-gradient"] ?? "linear-gradient(120deg, #7b5cff, #6366f1, #22d3ee)",
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
  if (!OPENAI_API_KEY) return null;

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
      const response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${OPENAI_API_KEY}`,
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

      type OpenAIChatResponse = { choices?: Array<{ message?: { content?: string | null } | null } | null> };
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
        varCount: (limitedVariants.light ? Object.keys(limitedVariants.light).length : 0) + (limitedVariants.dark ? Object.keys(limitedVariants.dark).length : 0),
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





