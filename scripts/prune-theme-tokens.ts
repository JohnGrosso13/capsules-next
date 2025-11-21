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

const KEEP_UNUSED_EXPOSED = process.env.KEEP_UNUSED_EXPOSED === "true";
const DRY_RUN = process.env.DRY_RUN === "true";

const varRegex = /var\(\s*(--[A-Za-z0-9_-]+)\s*/g;
const aliasMap: Record<string, string> = fs.existsSync(ALIAS_PATH)
  ? JSON.parse(fs.readFileSync(ALIAS_PATH, "utf8"))
  : {};

function scanFile(filePath: string, used: Set<string>) {
  const ext = path.extname(filePath);
  if (!ALLOWED_EXTS.has(ext) && !filePath.endsWith(".module.css")) return;
  const content = fs.readFileSync(filePath, "utf8");
  let match: RegExpExecArray | null;
  while ((match = varRegex.exec(content)) !== null) {
    const cssVar = match[1]!;
    used.add(aliasMap[cssVar] ?? cssVar);
  }
}

function walk(dir: string, used: Set<string>) {
  for (const entry of fs.readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = path.join(dir, entry);
    const stat = fs.statSync(full);
    if (stat.isDirectory()) {
      walk(full, used);
    } else {
      scanFile(full, used);
    }
  }
}

function main() {
  const tokens: Token[] = JSON.parse(fs.readFileSync(TOKEN_PATH, "utf8"));
  const usedVars = new Set<string>();
  walk(SRC_DIR, usedVars);

  const keep = tokens.filter((token) => {
    if (usedVars.has(token.cssVar)) return true;
    if (KEEP_UNUSED_EXPOSED && token.exposeToStyler !== false && token.layer !== "component") {
      return true;
    }
    return false;
  });

  const removed = tokens.length - keep.length;
  console.log(
    `Prune theme tokens: start=${tokens.length}, keep=${keep.length}, removed=${removed}` +
      (KEEP_UNUSED_EXPOSED ? " (kept unused exposed)" : ""),
  );

  if (removed === 0) {
    console.log("No tokens removed.");
    return;
  }

  if (DRY_RUN) {
    console.log("DRY_RUN=true, not writing changes.");
    return;
  }

  // Sort by cssVar for stable output.
  keep.sort((a, b) => a.cssVar.localeCompare(b.cssVar));
  fs.writeFileSync(TOKEN_PATH, `${JSON.stringify(keep, null, 2)}\n`, "utf8");
}

main();
