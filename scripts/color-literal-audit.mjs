import fs from "fs";
import path from "path";

/**
 * Fails if new raw color literals (hex/rgb/hsl) or Tailwind color utilities
 * slip into the codebase instead of tokens. Keeps CSS/TSX honest for theming.
 */

const ROOT = process.cwd();
const SCAN_DIRS = ["src"];
const ALLOWED_EXTS = new Set([".ts", ".tsx", ".jsx", ".js", ".mdx", ".css", ".module.css"]);
const SCAN_CSS = process.env.SCAN_CSS_COLORS === "true";

const ALLOW_PATH_SUBSTRINGS = [
  `${path.sep}__tests__${path.sep}`,
  `${path.sep}__mocks__${path.sep}`,
  `${path.sep}fixtures${path.sep}`,
  `${path.sep}stories${path.sep}`,
  `${path.sep}mock`,
  `${path.sep}lib${path.sep}theme${path.sep}`,
  `${path.sep}lib${path.sep}theme.ts`,
  `${path.sep}lib${path.sep}identity${path.sep}`,
  `${path.sep}server${path.sep}ai${path.sep}styler.ts`,
  `${path.sep}.venv${path.sep}`,
];

const ALLOW_FILES = new Set(
  [
    "src/app/globals.css",
    "src/app/light-theme.css",
    "src/app/theme-defaults.css",
    "src/lib/theme/token-registry.ts",
  ].map((p) => path.join(ROOT, p)),
);

const COLOR_HEX = /#(?:[0-9a-fA-F]{3,8})\b/;
const COLOR_RGB = /\brgba?\(/i;
const COLOR_HSL = /\bhsla?\(/i;
const TAILWIND_COLOR_UTILITY =
  /\b(?:text|bg|border|from|to|via)-(?:white|black|slate|gray|neutral|zinc|stone)(?:\/\d+)?\b/;

const findings = [];

function shouldSkipFile(filePath) {
  if (ALLOW_FILES.has(filePath)) return true;
  if (ALLOW_PATH_SUBSTRINGS.some((marker) => filePath.includes(marker))) return true;
  const ext = path.extname(filePath);
  if (!SCAN_CSS && (ext === ".css" || ext === ".module.css")) return true;
  if (!ALLOWED_EXTS.has(ext)) return true;
  return false;
}

function scanFile(filePath) {
  const content = fs.readFileSync(filePath, "utf8");
  const lines = content.split(/\r?\n/);
  lines.forEach((line, idx) => {
    // Allow literal fallbacks when wrapped in var()
    if (line.includes("var(")) return;
    const hasLiteral =
      COLOR_HEX.test(line) || COLOR_RGB.test(line) || COLOR_HSL.test(line) || TAILWIND_COLOR_UTILITY.test(line);
    if (hasLiteral) {
      findings.push({
        file: filePath,
        line: idx + 1,
        text: line.trim().slice(0, 180),
      });
    }
  });
}

function walk(dirPath) {
  for (const entry of fs.readdirSync(dirPath)) {
    if (entry === "node_modules" || entry === ".next") continue;
    const full = path.join(dirPath, entry);
    const stats = fs.statSync(full);
    if (stats.isDirectory()) {
      walk(full);
    } else if (!shouldSkipFile(full)) {
      scanFile(full);
    }
  }
}

for (const dir of SCAN_DIRS) {
  walk(path.join(ROOT, dir));
}

if (findings.length) {
  console.error(
    `Found ${findings.length} raw color literal${findings.length === 1 ? "" : "s"} (use tokens instead):`,
  );
  findings.forEach((f) => {
    console.error(`- ${path.relative(ROOT, f.file)}:${f.line} -> ${f.text}`);
  });
  process.exit(1);
} else {
  console.log("Color literal audit passed (no raw colors found).");
}
