import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const MIGRATIONS_DIR = path.join(__dirname, "..", "supabase", "migrations");
const OUTPUT_PATH = path.join(__dirname, "..", "supabase", "schema_consolidated.sql");

async function main() {
  const entries = await fs.readdir(MIGRATIONS_DIR, { withFileTypes: true });
  const files = entries
    .filter((e) => e.isFile() && e.name.endsWith(".sql"))
    .map((e) => e.name)
    .sort();

  let out = "";
  out += `-- Consolidated schema snapshot (generated)\n`;
  out += `-- Source: supabase/migrations/*.sql\n`;
  out += `-- Generated at: ${new Date().toISOString()}\n`;
  out += `-- Note: This file is for bootstrapping dev databases from scratch.\n`;
  out += `--       It concatenates ordered migrations and relies on IF NOT EXISTS guards.\n`;
  out += `\n`;

  for (const file of files) {
    const p = path.join(MIGRATIONS_DIR, file);
    const sql = await fs.readFile(p, "utf8");
    out += `\n-- ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::\n`;
    out += `-- BEGIN MIGRATION: ${file}\n`;
    out += `-- ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::\n\n`;
    out += sql.trim();
    out += `\n\n-- ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::\n`;
    out += `-- END MIGRATION: ${file}\n`;
    out += `-- ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::\n\n`;
  }

  await fs.writeFile(OUTPUT_PATH, out, "utf8");
  console.log(`Wrote consolidated schema: ${path.relative(process.cwd(), OUTPUT_PATH)}`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
