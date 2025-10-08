import fs from "fs";
import path from "path";

const registryPath = path.join(process.cwd(), "src/lib/theme/token-registry.ts");
const registrySource = fs.readFileSync(registryPath, "utf8");
const tokenVarRegex = /cssVar:\s*"(--[^"]+)"/g;
const registryVars = new Set();
let tokenMatch;
while ((tokenMatch = tokenVarRegex.exec(registrySource)) !== null) {
  registryVars.add(tokenMatch[1]);
}

const scanDirs = ["src"];
const targetExts = new Set([".css", ".module.css", ".ts", ".tsx", ".jsx", ".js", ".mdx"]);
const usedVars = new Set();

function scanFile(filePath) {
  const ext = path.extname(filePath);
  if (ext && !targetExts.has(ext) && !filePath.endsWith(".module.css")) {
    return;
  }
  const content = fs.readFileSync(filePath, "utf8");
  const varRegex = /var\((--[A-Za-z0-9-_]+)/g;
  let match;
  while ((match = varRegex.exec(content)) !== null) {
    usedVars.add(match[1]);
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

const missing = Array.from(usedVars).filter((cssVar) => !registryVars.has(cssVar)).sort();
console.log(JSON.stringify({ missing, totalUsed: usedVars.size, totalRegistered: registryVars.size }, null, 2));
