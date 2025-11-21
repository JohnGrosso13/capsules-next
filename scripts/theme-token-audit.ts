import fs from "fs";
import path from "path";

type Token = {
  id: string;
  cssVar: string;
  label: string;
  category: string;
  valueKind: string;
  fallback?: string;
  lightFallback?: string;
  exposeToStyler?: boolean;
  layer?: string;
};

type Usage = {
  count: number;
  files: Set<string>;
};

const ROOT = process.cwd();
const SRC_DIR = path.join(ROOT, "src");
const TOKEN_PATH = path.join(ROOT, "src", "lib", "theme", "theme.tokens.json");
const ALIAS_PATH = path.join(ROOT, "src", "lib", "theme", "token-aliases.json");

const ALLOWED_EXTS = new Set([
  ".css",
  ".module.css",
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".mdx",
]);

const SKIP_DIRS = new Set(["node_modules", ".next", ".git", ".tmp-tsbuild"]);

const tokens: Token[] = JSON.parse(fs.readFileSync(TOKEN_PATH, "utf8"));
const aliasMap: Record<string, string> = fs.existsSync(ALIAS_PATH)
  ? JSON.parse(fs.readFileSync(ALIAS_PATH, "utf8"))
  : {};
const tokenMap = new Map<string, Token>(tokens.map((t) => [t.cssVar, t]));
const exposed = tokens.filter((t) => t.exposeToStyler !== false && t.layer !== "component");

const varUsage = new Map<string, Usage>();
const declared = new Set<string>();
const missingVars = new Set<string>();

const varRegex = /var\(\s*(--[A-Za-z0-9_-]+)\s*/g;
const declarationRegex = /--([A-Za-z0-9_-]+)\s*:/g;

function trackUsage(cssVar: string, file: string) {
  const canonical = aliasMap[cssVar] ?? cssVar;
  const entry = varUsage.get(canonical) ?? { count: 0, files: new Set<string>() };
  entry.count += 1;
  entry.files.add(file);
  varUsage.set(canonical, entry);
}

function scanFile(filePath: string) {
  const ext = path.extname(filePath);
  if (!ALLOWED_EXTS.has(ext) && !filePath.endsWith(".module.css")) return;

  const content = fs.readFileSync(filePath, "utf8");

  let match: RegExpExecArray | null;
  while ((match = varRegex.exec(content)) !== null) {
    const cssVar = match[1];
    const canonical = aliasMap[cssVar];
    if (!tokenMap.has(cssVar) && !tokenMap.has(canonical ?? "")) missingVars.add(cssVar);
    trackUsage(cssVar, filePath);
  }

  while ((match = declarationRegex.exec(content)) !== null) {
    declared.add(`--${match[1]}`);
  }
}

function walk(dir: string) {
  for (const entry of fs.readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = path.join(dir, entry);
    const stat = fs.statSync(full);
    if (stat.isDirectory()) {
      walk(full);
    } else {
      scanFile(full);
    }
  }
}

walk(SRC_DIR);

const usedVars = new Set(varUsage.keys());

const unusedTokens = tokens.filter((t) => !usedVars.has(t.cssVar));
const unusedExposed = exposed.filter((t) => !usedVars.has(t.cssVar));

const duplicates = new Map<string, Token[]>();
tokens.forEach((token) => {
  const key = `${token.fallback ?? ""}||${token.lightFallback ?? ""}`;
  const bucket = duplicates.get(key);
  if (bucket) {
    bucket.push(token);
  } else {
    duplicates.set(key, [token]);
  }
});
const duplicateBuckets = Array.from(duplicates.values()).filter((list) => list.length > 1);

const summary = {
  totalTokens: tokens.length,
  exposedTokens: exposed.length,
  usedVars: usedVars.size,
  unusedTokens: unusedTokens.length,
  unusedExposed: unusedExposed.length,
  missingVars: missingVars.size,
  duplicateValueBuckets: duplicateBuckets.length,
};

const report = {
  summary,
  missingVars: Array.from(missingVars).sort(),
  unusedTokens: unusedTokens
    .map((t) => ({ cssVar: t.cssVar, id: t.id, layer: t.layer ?? "foundation" }))
    .slice(0, 120),
  unusedExposed: unusedExposed
    .map((t) => ({ cssVar: t.cssVar, id: t.id, layer: t.layer ?? "foundation" }))
    .slice(0, 120),
  heavyHitters: Array.from(varUsage.entries())
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 40)
    .map(([cssVar, usage]) => ({
      cssVar,
      count: usage.count,
      files: Array.from(usage.files).map((file) => path.relative(ROOT, file)).slice(0, 5),
    })),
  duplicateValues: duplicateBuckets
    .map((bucket) => ({
      fallback: bucket[0]?.fallback ?? "",
      lightFallback: bucket[0]?.lightFallback ?? null,
      tokens: bucket.map((t) => ({ cssVar: t.cssVar, id: t.id, layer: t.layer ?? "foundation" })),
    }))
    .filter((entry) => entry.tokens.length > 1)
    .slice(0, 50),
};

if (process.argv.includes("--json")) {
  console.log(JSON.stringify(report, null, 2));
  process.exit(0);
}

const divider = () => console.log("".padEnd(80, "-"));

console.log("Theme token audit (non-destructive)");
divider();
console.log(`Total tokens:      ${summary.totalTokens}`);
console.log(`Exposed (styler):  ${summary.exposedTokens}`);
console.log(`Vars used in code: ${summary.usedVars}`);
console.log(`Unused tokens:     ${summary.unusedTokens}`);
console.log(`Unused exposed:    ${summary.unusedExposed}`);
console.log(`Missing vars:      ${summary.missingVars}`);
console.log(`Duplicate buckets: ${summary.duplicateValueBuckets}`);
divider();

if (report.missingVars.length) {
  console.log("Missing vars (used in code, not in registry):");
  report.missingVars.forEach((name) => console.log(`- ${name}`));
  divider();
} else {
  console.log("No missing vars detected.");
  divider();
}

if (report.unusedExposed.length) {
  console.log("Unused exposed tokens (first 20):");
  report.unusedExposed.slice(0, 20).forEach((token) => {
    console.log(`- ${token.cssVar} (${token.id}) [${token.layer}]`);
  });
  divider();
}

if (report.duplicateValues.length) {
  console.log("Potential duplicate values (first 10 buckets):");
  report.duplicateValues.slice(0, 10).forEach((entry) => {
    console.log(
      `- ${entry.tokens.map((t) => t.cssVar).join(", ")} -> fallback: ${entry.fallback}${
        entry.lightFallback ? ` | light: ${entry.lightFallback}` : ""
      }`,
    );
  });
  divider();
}

console.log("Top referenced vars:");
report.heavyHitters.forEach((entry) => {
  console.log(`- ${entry.cssVar} (${entry.count} refs)`);
});
console.log("");
