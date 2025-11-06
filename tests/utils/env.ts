import fs from "node:fs";
import path from "node:path";

function parseLine(line: string): { key: string; value: string } | null {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) return null;

  const match = trimmed.match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
  if (!match) return null;

  const [, keyMatch, raw = ""] = match;
  const key = keyMatch?.trim() ?? "";
  if (!key) return null;
  let value = raw.trim();
  if (value.length >= 2) {
    const first = value[0];
    const last = value[value.length - 1];
    if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
      value = value.slice(1, -1);
    }
  }

  return { key, value };
}

export function loadEnvFromFile(fileName: string): boolean {
  const fullPath = path.resolve(process.cwd(), fileName);
  if (!fs.existsSync(fullPath)) {
    return false;
  }

  const contents = fs.readFileSync(fullPath, "utf8");
  const lines = contents.split(/\r?\n/);
  for (const rawLine of lines) {
    const parsed = parseLine(rawLine);
    if (!parsed) continue;
    if (typeof process.env[parsed.key] === "undefined") {
      process.env[parsed.key] = parsed.value;
    }
  }

  return true;
}
