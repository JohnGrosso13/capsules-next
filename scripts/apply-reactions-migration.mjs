import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { Client } from "pg";

async function main() {
  const cwd = process.cwd();
  const migrationPath = path.join(cwd, "supabase", "migrations", "0007_chat_message_reactions.sql");
  const connectionString = process.env.SUPABASE_DB_URL || process.env.DATABASE_URL;
  if (!connectionString) {
    console.error("Missing SUPABASE_DB_URL (or DATABASE_URL) environment variable.");
    process.exit(1);
  }

  const sql = fs.readFileSync(migrationPath, "utf8");
  const client = new Client({ connectionString, ssl: { rejectUnauthorized: false } });

  try {
    await client.connect();
    await client.query("BEGIN");
    await client.query(sql);
    await client.query("COMMIT");
    console.log("Applied 0007_chat_message_reactions.sql to remote database.");
  } catch (error) {
    try { await client.query("ROLLBACK"); } catch {}
    console.error("Migration failed:", error?.message || error);
    process.exitCode = 1;
  } finally {
    try { await client.end(); } catch {}
  }
}

main();

