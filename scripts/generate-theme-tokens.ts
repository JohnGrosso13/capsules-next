import fs from "fs";
import path from "path";
import { pathToFileURL } from "url";
import { z } from "zod";

type TailwindGroup =
  | "colors"
  | "borderRadius"
  | "fontFamily"
  | "boxShadow"
  | "backgroundImage"
  | "spacing"
  | "transitionDuration"
  | "transitionTimingFunction";

const ROOT = process.cwd();
const SRC_DIR = path.join(ROOT, "src");
const THEME_DIR = path.join(SRC_DIR, "lib", "theme");
const SCHEMA_PATH = path.join(THEME_DIR, "theme.tokens.json");
const TOKEN_REGISTRY_PATH = path.join(THEME_DIR, "token-registry.ts");
const DEFAULT_THEME_PATH = path.join(SRC_DIR, "app", "theme-defaults.css");
const GLOBALS_CSS_PATH = path.join(SRC_DIR, "app", "globals.css");
const LIGHT_THEME_PATH = path.join(SRC_DIR, "app", "light-theme.css");
const ALIASES_PATH = path.join(THEME_DIR, "token-aliases.json");
const ALIASES_CSS_PATH = path.join(SRC_DIR, "app", "theme-aliases.css");
const DOCS_CONTRACT_PATH = path.join(ROOT, "docs", "theme-contract.md");
const INFER_MISSING_VARS = process.env.INFER_MISSING_VARS === "true";
const FAIL_ON_MISSING_VARS = process.env.FAIL_ON_MISSING_VARS === "true";

const CATEGORY_VALUES = [
  "surface",
  "text",
  "border",
  "brand",
  "feedback",
  "typography",
  "radius",
  "shadow",
  "ring",
  "glass",
  "card",
  "dock",
  "presence",
  "layout",
  "spacing",
  "motion",
  "utility",
] as const;

const KIND_VALUES = [
  "color",
  "gradient",
  "shadow",
  "fontFamily",
  "radius",
  "dimension",
  "time",
  "timingFunction",
  "other",
] as const;

const LAYER_VALUES = ["foundation", "semantic", "component", "utility"] as const;

const TokenInputSchema = z.object({
  id: z.string(),
  cssVar: z.string().regex(/^--/),
  label: z.string(),
  category: z.enum(CATEGORY_VALUES),
  valueKind: z.enum(KIND_VALUES),
  description: z.string().optional(),
  tags: z.array(z.string()).optional(),
  semantics: z.string().optional(),
  layer: z.enum(LAYER_VALUES).optional(),
  surfaces: z.array(z.string()).optional(),
  fallback: z.string().optional(),
  lightFallback: z.string().optional(),
  aliases: z.array(z.string()).optional(),
  exposeToStyler: z.boolean().optional(),
  tailwind: z
    .object({
      path: z.array(z.string()).min(2),
    })
    .optional(),
});

type TokenInput = z.infer<typeof TokenInputSchema>;
type TokenLayer = (typeof LAYER_VALUES)[number];

async function main() {
  const baseTokens = await loadBaseTokens();
  const aliases = loadAliases();
  const defaults = collectDefaultDeclarations();
  const lightDefaults = collectDeclarationsFromFile(LIGHT_THEME_PATH);

  const miscDefaults = collectDeclarationsFromTree(SRC_DIR, new Set([DEFAULT_THEME_PATH, LIGHT_THEME_PATH]));
  // direct defaults should win over misc defaults
  miscDefaults.forEach((value, key) => {
    if (!defaults.has(key)) defaults.set(key, value);
  });

  const usedVars = collectUsedVars(SRC_DIR);

  const merged = mergeTokens(baseTokens, defaults, lightDefaults, usedVars, aliases);
  const sorted = Array.from(merged.values()).sort((a, b) => a.cssVar.localeCompare(b.cssVar));

  writeSchema(sorted);
  writeRegistry(sorted);
  writeDefaultCss(sorted);
  writeLightCss(sorted);
  writeContract(sorted);
  writeAliasesCss(aliases);

  console.log(
    `Generated ${sorted.length} theme tokens. Defaults: ${defaults.size}, light overrides: ${lightDefaults.size}, used vars: ${usedVars.size}`,
  );
}

async function loadBaseTokens(): Promise<TokenInput[]> {
  if (fs.existsSync(SCHEMA_PATH)) {
    const json = JSON.parse(fs.readFileSync(SCHEMA_PATH, "utf8"));
    return z.array(TokenInputSchema.partial()).parse(json);
  }

  if (!fs.existsSync(TOKEN_REGISTRY_PATH)) return [];
  const mod = await import(pathToFileURL(TOKEN_REGISTRY_PATH).href);
  const registry: TokenInput[] = mod.themeTokenRegistry ?? [];
  return registry.map((token: TokenInput) => ({
    ...token,
    tags: token.tags ?? [],
  }));
}

function collectDeclarationsFromFile(filePath: string): Map<string, string> {
  const map = new Map<string, string>();
  if (!fs.existsSync(filePath)) return map;
  const content = fs.readFileSync(filePath, "utf8");
  const regex = /--([A-Za-z0-9\-_]+)\s*:\s*([^;]+);/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(content)) !== null) {
    const [, name, value] = match;
    map.set(`--${name}`, value.trim());
  }
  return map;
}

function collectDefaultDeclarations(): Map<string, string> {
  const map = new Map<string, string>();
  const sources = [DEFAULT_THEME_PATH, GLOBALS_CSS_PATH];
  for (const source of sources) {
    collectDeclarationsFromFile(source).forEach((value, key) => {
      if (!map.has(key)) map.set(key, value);
    });
  }
  return map;
}

function collectDeclarationsFromTree(root: string, ignore: Set<string>): Map<string, string> {
  const map = new Map<string, string>();
  const stack = [root];
  while (stack.length) {
    const dir = stack.pop()!;
    for (const entry of fs.readdirSync(dir)) {
      const full = path.join(dir, entry);
      if (ignore.has(full)) continue;
      const stat = fs.statSync(full);
      if (stat.isDirectory()) {
        if (entry === "node_modules" || entry === ".next" || entry === ".git") continue;
        stack.push(full);
      } else if (entry.endsWith(".css")) {
        collectDeclarationsFromFile(full).forEach((value, key) => {
          if (!map.has(key)) map.set(key, value);
        });
      }
    }
  }
  return map;
}

function collectUsedVars(root: string): Set<string> {
  const used = new Set<string>();
  const stack = [root];
  while (stack.length) {
    const dir = stack.pop()!;
    for (const entry of fs.readdirSync(dir)) {
      const full = path.join(dir, entry);
      const stat = fs.statSync(full);
      if (stat.isDirectory()) {
        if (entry === "node_modules" || entry === ".next" || entry === ".git") continue;
        stack.push(full);
      } else if (/\.(css|ts|tsx|jsx|js|mdx)$/.test(entry) || entry.endsWith(".module.css")) {
        const content = fs.readFileSync(full, "utf8");
        const regex = /var\(\s*(--[A-Za-z0-9\-_]+)/g;
        let match: RegExpExecArray | null;
        while ((match = regex.exec(content)) !== null) {
          used.add(match[1]);
        }
      }
    }
  }
  return used;
}

function mergeTokens(
  baseTokens: TokenInput[],
  defaults: Map<string, string>,
  lightDefaults: Map<string, string>,
  usedVars: Set<string>,
  aliases: Record<string, string>,
): Map<string, TokenInput> {
  const map = new Map<string, TokenInput>();
  const missing: string[] = [];

  for (const token of baseTokens) {
    const normalized = normalizeToken(token, defaults, lightDefaults);
    map.set(normalized.cssVar, normalized);
  }

  usedVars.forEach((cssVar) => {
    if (map.has(cssVar)) return;
    if (aliases[cssVar]) return;
    if (INFER_MISSING_VARS) {
      const fallback = defaults.get(cssVar) ?? "";
      map.set(cssVar, buildInferredToken(cssVar, fallback, lightDefaults.get(cssVar)));
    } else {
      missing.push(cssVar);
    }
  });

  if (missing.length) {
    console.warn(
      `Found ${missing.length} CSS vars used in code but missing from theme.tokens.json. ` +
        `Set INFER_MISSING_VARS=true to auto-generate them or add manually: ${missing.slice(0, 10).join(", ")}`,
    );
    if (FAIL_ON_MISSING_VARS) {
      throw new Error("Missing theme tokens (FAIL_ON_MISSING_VARS=true)");
    }
  }

  return map;
}

function normalizeToken(
  token: TokenInput,
  defaults: Map<string, string>,
  lightDefaults: Map<string, string>,
): TokenInput {
  const fallback = token.fallback ?? defaults.get(token.cssVar);
  const lightFallback = token.lightFallback ?? lightDefaults.get(token.cssVar);
  const layer = token.layer ?? inferLayer(token);

  return {
    ...token,
    semantics: token.semantics ?? token.label,
    tags: token.tags ?? [],
    fallback: fallback ?? defaultValueForKind(token.valueKind),
    lightFallback,
    layer,
    exposeToStyler: token.exposeToStyler ?? layer !== "component",
  };
}

function buildInferredToken(cssVar: string, fallback: string | undefined, lightFallback: string | undefined): TokenInput {
  const id = cssVar.replace(/^--/, "").replace(/-/g, ".");
  const label = toLabel(cssVar);
  const category = inferCategory(cssVar);
  const value = fallback ?? defaultValueForKind(inferValueKind(cssVar, fallback));
  const valueKind = inferValueKind(cssVar, fallback);
  const layer = inferLayer({ cssVar, category, id, label, valueKind, tags: [] });

  return {
    id,
    cssVar,
    label,
    category,
    valueKind,
    tags: [],
    semantics: label,
    fallback: value,
    lightFallback,
    layer,
    exposeToStyler: layer !== "component",
  };
}

function toLabel(cssVar: string): string {
  const withoutPrefix = cssVar.replace(/^--/, "");
  return withoutPrefix
    .split("-")
    .filter(Boolean)
    .map((part) => part[0]?.toUpperCase() + part.slice(1))
    .join(" ");
}

function inferCategory(cssVar: string): TokenInput["category"] {
  const key = cssVar.toLowerCase();
  if (key.includes("text")) return "text";
  if (key.includes("border") || key.includes("outline") || key.includes("stroke")) return "border";
  if (key.includes("shadow") || key.includes("glow")) return "shadow";
  if (key.includes("radius") || key.includes("round")) return "radius";
  if (key.includes("space") || key.includes("gap") || key.includes("padding")) return "spacing";
  if (key.includes("brand") || key.includes("accent") || key.includes("cta")) return "brand";
  if (key.includes("status") || key.includes("warning") || key.includes("danger") || key.includes("success"))
    return "feedback";
  if (key.includes("ring")) return "ring";
  if (key.includes("glass") || key.includes("blur")) return "glass";
  if (key.includes("dock")) return "dock";
  if (key.includes("card")) return "card";
  if (key.includes("font") || key.includes("type")) return "typography";
  if (key.includes("layout") || key.includes("width") || key.includes("height")) return "layout";
  return "surface";
}

function inferValueKind(cssVar: string, value?: string): TokenInput["valueKind"] {
  const val = value ?? "";
  if (val.includes("gradient(") || cssVar.includes("gradient")) return "gradient";
  if (/#|rgb|hsl|color-mix|oklab|oklch|transparent/i.test(val) || cssVar.includes("color") || cssVar.includes("fg"))
    return "color";
  if (/(\d|\.)+(px|rem|em|vh|vw|%)\b/.test(val) && cssVar.includes("radius")) return "radius";
  if (/(\d|\.)+(px|rem|em|vh|vw|%)\b/.test(val)) return "dimension";
  if (/cubic-bezier|steps|ease/.test(val)) return "timingFunction";
  if (/ms\b|s\b/.test(val)) return "time";
  if (val.includes("shadow") || cssVar.includes("shadow") || cssVar.includes("glow")) return "shadow";
  if (cssVar.includes("radius")) return "radius";
  if (cssVar.includes("font")) return "fontFamily";
  return "other";
}

function inferLayer(token: Pick<TokenInput, "id" | "cssVar" | "category">): TokenLayer {
  const id = token.id ?? token.cssVar.replace(/^--/, "");
  const lower = `${id}.${token.cssVar}`.toLowerCase();
  if (
    lower.includes("home.") ||
    lower.includes("promo") ||
    lower.includes("composer") ||
    lower.includes("feed") ||
    lower.includes("rail") ||
    lower.includes("store") ||
    lower.includes("studio") ||
    lower.includes("party") ||
    lower.includes("live") ||
    lower.includes("ai-studio") ||
    lower.includes("profile") ||
    lower.includes("settings")
  ) {
    return "component";
  }
  if (token.category === "utility") return "utility";
  if (token.category === "card" || token.category === "dock" || token.category === "glass" || token.category === "presence") {
    return "semantic";
  }
  return "foundation";
}

function defaultValueForKind(kind: TokenInput["valueKind"]): string {
  switch (kind) {
    case "color":
    case "gradient":
      return "transparent";
    case "shadow":
      return "none";
    case "radius":
      return "0px";
    case "dimension":
      return "0px";
    case "fontFamily":
      return "inherit";
    case "time":
      return "0ms";
    case "timingFunction":
      return "ease";
    default:
      return "initial";
  }
}

function writeSchema(tokens: TokenInput[]) {
  fs.mkdirSync(path.dirname(SCHEMA_PATH), { recursive: true });
  const content = `${JSON.stringify(tokens, null, 2)}\n`;
  fs.writeFileSync(SCHEMA_PATH, content, "utf8");
}

function writeRegistry(tokens: TokenInput[]) {
  const categories = CATEGORY_VALUES.map((v) => `"${v}"`).join(" | ");
  const kinds = KIND_VALUES.map((v) => `"${v}"`).join(" | ");
  const layers = LAYER_VALUES.map((v) => `"${v}"`).join(" | ");

  const file = `// Generated by scripts/generate-theme-tokens.ts. Do not edit directly.
import rawTokens from "./theme.tokens.json";
import { z } from "zod";

export type CSSVariableName = \`--\${string}\`;

export type ThemeTokenCategory = ${categories};

export type ThemeTokenValueKind = ${kinds};

export type ThemeTokenLayer = ${layers};

type TailwindGroup =
  | "colors"
  | "borderRadius"
  | "fontFamily"
  | "boxShadow"
  | "backgroundImage"
  | "spacing"
  | "transitionDuration"
  | "transitionTimingFunction";

const TokenSchema = z.object({
  id: z.string(),
  label: z.string(),
  cssVar: z.string().regex(/^--/),
  category: z.enum(${JSON.stringify(CATEGORY_VALUES)}),
  valueKind: z.enum(${JSON.stringify(KIND_VALUES)}),
  description: z.string().optional(),
  tags: z.array(z.string()).default([]),
  semantics: z.string().optional(),
  layer: z.enum(${JSON.stringify(LAYER_VALUES)}),
  surfaces: z.array(z.string()).optional(),
  fallback: z.string(),
  lightFallback: z.string().optional(),
  aliases: z.array(z.string()).optional(),
  exposeToStyler: z.boolean().optional(),
  tailwind: z
    .object({
      path: z.array(z.string()).min(2),
    })
    .optional(),
});

export type ThemeTokenDefinition = z.infer<typeof TokenSchema>;

export type ThemeTokenId = ThemeTokenDefinition["id"];
export type ThemeTokenCssVar = ThemeTokenDefinition["cssVar"];

const tokens = TokenSchema.array().parse(rawTokens);

export const themeTokenRegistry = tokens;

export type ThemeTokenMeta = {
  readonly id: ThemeTokenId;
  readonly cssVar: ThemeTokenCssVar;
  readonly category: ThemeTokenCategory;
  readonly valueKind: ThemeTokenValueKind;
  readonly label: string;
  readonly tags: readonly string[];
  readonly layer: ThemeTokenLayer;
};

const THEME_TOKEN_META_ENTRIES = tokens.map(
  (token) =>
    [
      token.cssVar,
      {
        id: token.id as ThemeTokenId,
        cssVar: token.cssVar as ThemeTokenCssVar,
        category: token.category,
        valueKind: token.valueKind,
        label: token.label,
        tags: token.tags ?? [],
        layer: token.layer,
      },
    ] as const,
);

export const themeTokenMetaByCssVar = Object.freeze(
  Object.fromEntries(THEME_TOKEN_META_ENTRIES),
) as unknown as Record<ThemeTokenCssVar, ThemeTokenMeta>;

export const themeTokensById: ReadonlyMap<ThemeTokenId, ThemeTokenDefinition> = new Map(
  tokens.map((token) => [token.id as ThemeTokenId, token]),
);

export const themeTokensByCssVar: ReadonlyMap<ThemeTokenCssVar, ThemeTokenDefinition> = new Map(
  tokens.map((token) => [token.cssVar as ThemeTokenCssVar, token]),
);

export const THEME_TOKEN_CSS_VARS = new Set<ThemeTokenCssVar>(
  tokens.map((token) => token.cssVar),
);

export const STYLER_THEME_TOKEN_CSS_VARS = new Set<ThemeTokenCssVar>(
  tokens.filter((token) => token.exposeToStyler !== false && token.layer !== "component").map((token) => token.cssVar as ThemeTokenCssVar),
);

export type TailwindThemeExtension = Partial<Record<TailwindGroup, Record<string, unknown>>>;

export function buildTailwindThemeExtension(
  registry: readonly ThemeTokenDefinition[] = tokens,
): TailwindThemeExtension {
  const extend: TailwindThemeExtension = {};
  for (const token of registry) {
    const binding = token.tailwind;
    if (!binding) continue;
    const [group, ...path] = binding.path;
    if (!path.length) continue;
    const base = (extend[group as TailwindGroup] ??= {});
    let cursor: Record<string, unknown> = base;
    for (let i = 0; i < path.length - 1; i++) {
      const key = path[i]!;
      const next = cursor[key];
      if (typeof next === "object" && next !== null) {
        cursor = next as Record<string, unknown>;
      } else {
        const fresh: Record<string, unknown> = {};
        cursor[key] = fresh;
        cursor = fresh;
      }
    }
    const leafKey = path[path.length - 1]!;
    cursor[leafKey] = \`var(\${token.cssVar})\`;
  }
  return extend;
}

export function isThemeTokenVar(input: string): input is ThemeTokenCssVar {
  return THEME_TOKEN_CSS_VARS.has(input as ThemeTokenCssVar);
}

export function asCssVar(value: ThemeTokenCssVar): string {
  return \`var(\${value})\`;
}

export const tailwindThemeExtension = buildTailwindThemeExtension();

const CONTEXTUAL_TOKEN_PREFIXES: readonly string[] = [
  "home.",
  "friends.",
  "chats.",
  "requests.",
  "party.",
  "prompter.",
  "surface.style.",
  "text.style.",
  "shadow.style.",
  "border.style.",
  "surface.friends.",
  "text.friends.",
  "border.friends.",
  "shadow.friends.",
  "surface.chats.",
  "text.chats.",
  "border.chats.",
  "shadow.chats.",
  "surface.party.",
  "text.party.",
  "border.party.",
  "shadow.party.",
  "surface.create.",
  "text.create.",
  "border.create.",
  "shadow.create.",
  "surface.settings.",
  "text.settings.",
  "border.settings.",
  "shadow.settings.",
  "surface.tile.",
  "text.tile.",
  "border.tile.",
  "shadow.tile.",
  "surface.studio.",
  "text.studio.",
  "border.studio.",
  "shadow.studio.",
  "ring.studio.",
  "surface.store.",
  "text.store.",
  "border.store.",
  "shadow.store.",
];

const isContextualToken = (token: ThemeTokenDefinition): boolean =>
  CONTEXTUAL_TOKEN_PREFIXES.some((prefix) => token.id.startsWith(prefix));

export const coreSiteThemeTokens = tokens.filter(
  (token) => token.layer !== "component" && !isContextualToken(token),
);

export const CORE_SITE_THEME_TOKEN_IDS = coreSiteThemeTokens.map(
  (token) => token.id as ThemeTokenId,
);

export const CORE_SITE_THEME_TOKEN_SET = new Set<ThemeTokenId>(CORE_SITE_THEME_TOKEN_IDS);

export const CORE_SITE_THEME_TOKEN_CSS_VARS = new Set<ThemeTokenCssVar>(
  coreSiteThemeTokens.map((token) => token.cssVar as ThemeTokenCssVar),
);
`;

  fs.writeFileSync(TOKEN_REGISTRY_PATH, file, "utf8");
}

function writeDefaultCss(tokens: TokenInput[]) {
  const lines: string[] = [];
  lines.push("/* Generated by scripts/generate-theme-tokens.ts. Do not edit directly. */");
  lines.push("@theme {");
  for (const token of tokens) {
    const value = token.fallback ?? defaultValueForKind(token.valueKind);
    lines.push(`  ${token.cssVar}: ${value};`);
  }
  lines.push("}");
  lines.push("");
  fs.writeFileSync(DEFAULT_THEME_PATH, lines.join("\n"), "utf8");
}

function writeLightCss(tokens: TokenInput[]) {
  const lines: string[] = [];
  lines.push("/* Generated by scripts/generate-theme-tokens.ts. Do not edit directly. */");
  lines.push("@layer base {");
  lines.push('  :root[data-theme="light"] {');
  tokens.forEach((token) => {
    if (!token.lightFallback) return;
    lines.push(`    ${token.cssVar}: ${token.lightFallback};`);
  });
  lines.push("  }");
  lines.push("}");
  lines.push("");
  fs.writeFileSync(LIGHT_THEME_PATH, lines.join("\n"), "utf8");
}

function writeAliasesCss(aliases: Record<string, string>) {
  const entries = Object.entries(aliases);
  const lines: string[] = [];
  lines.push("/* Generated by scripts/generate-theme-tokens.ts. Do not edit directly. */");
  lines.push("@layer base {");
  lines.push("  :root {");
  entries.forEach(([alias, target]) => {
    lines.push(`    ${alias}: var(${target});`);
  });
  lines.push("  }");
  lines.push("}");
  lines.push("");
  fs.writeFileSync(ALIASES_CSS_PATH, lines.join("\n"), "utf8");
}

function writeContract(tokens: TokenInput[]) {
  const exposed = tokens.filter((token) => token.exposeToStyler !== false && token.layer !== "component");
  const foundation = exposed.filter((token) => token.layer === "foundation");
  const semantic = exposed.filter((token) => token.layer === "semantic");

  const toSection = (title: string, list: TokenInput[]) => {
    const lines: string[] = [];
    lines.push(`## ${title}`);
    list.slice(0, 200).forEach((token) => {
      lines.push(`- \`${token.cssVar}\` — ${token.label}`);
    });
    lines.push("");
    return lines.join("\n");
  };

  const content =
    [
      "# Theme Token Contract",
      "",
      "Generated by `scripts/generate-theme-tokens.ts`. Tokens below are exposed to the AI Styler and represent the curated contract.",
      "",
      toSection("Foundation", foundation),
      toSection("Semantic", semantic),
    ].join("\n") + "\n";

  fs.mkdirSync(path.dirname(DOCS_CONTRACT_PATH), { recursive: true });
  fs.writeFileSync(DOCS_CONTRACT_PATH, content, "utf8");
}

main().catch((error) => {
  console.error("Failed to generate theme tokens", error);
  process.exit(1);
});
function loadAliases(): Record<string, string> {
  if (!fs.existsSync(ALIASES_PATH)) return {};
  try {
    const data = JSON.parse(fs.readFileSync(ALIASES_PATH, "utf8"));
    if (typeof data === "object" && data !== null) return data as Record<string, string>;
  } catch {
    // Ignore malformed alias file; treat as empty
  }
  return {};
}
