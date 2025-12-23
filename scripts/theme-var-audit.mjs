import fs from "fs";
import path from "path";

const schemaPath = path.join(process.cwd(), "src/lib/theme/theme.tokens.json");
const aliasPath = path.join(process.cwd(), "src/lib/theme/token-aliases.json");
const tokens = JSON.parse(fs.readFileSync(schemaPath, "utf8"));
const aliases = fs.existsSync(aliasPath) ? JSON.parse(fs.readFileSync(aliasPath, "utf8")) : {};

const registryVars = new Set(tokens.map((token) => token.cssVar));
const scanDirs = ["src"];
const targetExts = new Set([".css", ".module.css", ".ts", ".tsx", ".jsx", ".js", ".mdx"]);
const IGNORED_VARS = new Set();
const IGNORED_PREFIXES = [
  "--layout-",
  "--space-",
  "--spacing",
  "--radius",
  "--motion",
  "--rail-",
  "--ladder-",
  "--style-",
  "--memory-",
  "--panel-",
  "--home-poll",
  "--action-space",
];
const IGNORED_UNUSED = new Set();
const usedVars = new Set();
const failOnUnused = process.env.FAIL_ON_UNUSED === "true";

function scanFile(filePath) {
  const ext = path.extname(filePath);
  if (ext && !targetExts.has(ext) && !filePath.endsWith(".module.css")) {
    return;
  }
  const content = fs.readFileSync(filePath, "utf8");
  const varRegex = /var\(\s*(--[A-Za-z0-9-_]+)/g;
  let match;
  while ((match = varRegex.exec(content)) !== null) {
    const cssVar = match[1];
    if (IGNORED_VARS.has(cssVar)) continue;
    usedVars.add(aliases[cssVar] ?? cssVar);
  }
}

function walk(dirPath) {
  for (const entry of fs.readdirSync(dirPath)) {
    if (entry === "node_modules" || entry === ".next") continue;
    const entryPath = path.join(dirPath, entry);
    const stats = fs.statSync(entryPath);
    if (stats.isDirectory()) {
      walk(entryPath);
    } else {
      scanFile(entryPath);
    }
  }
}

for (const dir of scanDirs) {
  walk(path.join(process.cwd(), dir));
}

const missing = Array.from(usedVars)
  .filter((cssVar) => {
    if (!cssVar) return false;
    if (IGNORED_VARS.has(cssVar)) return false;
    if (IGNORED_PREFIXES.some((prefix) => cssVar.startsWith(prefix))) return false;
    return !registryVars.has(cssVar);
  })
  .sort();

const unused = Array.from(registryVars)
  .filter((cssVar) => !usedVars.has(cssVar) && !IGNORED_UNUSED.has(cssVar))
  .sort();

const summary = {
  missing,
  unused,
  totalUsed: usedVars.size,
  totalRegistered: registryVars.size,
};

console.log(JSON.stringify(summary, null, 2));
if (missing.length || (failOnUnused && unused.length)) {
  if (missing.length) {
    console.error(`Found ${missing.length} missing theme vars.`);
  }
  if (failOnUnused && unused.length) {
    console.error(`Found ${unused.length} unused theme vars lingering in the schema.`);
  }
  process.exit(1);
}

if (unused.length) {
  console.warn(`Detected ${unused.length} unused theme vars (non-fatal unless FAIL_ON_UNUSED=true).`);
}
