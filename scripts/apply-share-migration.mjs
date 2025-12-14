import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import pg from "pg";

const { Client } = pg;

async function main() {
  const dbUrl = process.env.SUPABASE_DB_URL;
  if (!dbUrl) {
    console.error("SUPABASE_DB_URL is required to run this script.");
    process.exitCode = 1;
    return;
  }

  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  const migrationPath = path.resolve(__dirname, "..", "supabase", "migrations", "20251214_add_post_shares.sql");

  let sql;
  try {
    sql = await fs.readFile(migrationPath, "utf8");
  } catch (error) {
    console.error("Failed to read migration file:", error);
    process.exitCode = 1;
    return;
  }

  const client = new Client({
    connectionString: dbUrl,
    ssl: { rejectUnauthorized: false },
  });

  try {
    await client.connect();
    await client.query(sql);
    console.log("Share tracking migration applied successfully.");
  } catch (error) {
    console.error("Failed to apply share tracking migration:", error);
    process.exitCode = 1;
  } finally {
    try {
      await client.end();
    } catch {
      // ignore shutdown errors
    }
  }
}

void main();
