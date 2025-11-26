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
  tags?: string[];
  semantics?: string;
  aliases?: string[];
};

const ROOT = process.cwd();
const TOKEN_PATH = path.join(ROOT, "src", "lib", "theme", "theme.tokens.json");
const ALIAS_PATH = path.join(ROOT, "src", "lib", "theme", "token-aliases.json");

function main() {
  const tokens: Token[] = JSON.parse(fs.readFileSync(TOKEN_PATH, "utf8"));
  const buckets = new Map<string, Token[]>();

  for (const token of tokens) {
    const key = `${token.fallback ?? ""}||${token.lightFallback ?? ""}`;
    const bucket = buckets.get(key);
    if (bucket) bucket.push(token);
    else buckets.set(key, [token]);
  }

  const keep: Token[] = [];
  const aliasMap: Record<string, string> = {};

  for (const [, bucket] of buckets) {
    if (bucket.length === 1) {
      keep.push(bucket[0]!);
      continue;
    }
    const sorted = bucket.sort((a, b) => a.cssVar.localeCompare(b.cssVar));
    const canonical = sorted[0];
    if (!canonical) continue;
    const rest = sorted.slice(1);
    keep.push(canonical);
    rest.forEach((alias) => {
      aliasMap[alias.cssVar] = canonical.cssVar;
    });
  }

  keep.sort((a, b) => a.cssVar.localeCompare(b.cssVar));

  fs.writeFileSync(TOKEN_PATH, `${JSON.stringify(keep, null, 2)}\n`, "utf8");
  fs.writeFileSync(ALIAS_PATH, `${JSON.stringify(aliasMap, null, 2)}\n`, "utf8");

  const removed = tokens.length - keep.length;
  console.log(
    `Merged duplicate tokens via aliases. Kept ${keep.length}, removed ${removed}, alias count ${
      Object.keys(aliasMap).length
    }.`,
  );
}

main();
