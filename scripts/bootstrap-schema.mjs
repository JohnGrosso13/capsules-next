#!/usr/bin/env node
/*
 * Dev helper: apply supabase/schema_consolidated.sql to a Postgres database.
 *
 * Usage:
 *   DATABASE_URL=postgres://postgres:postgres@localhost:54322/postgres \
 *   node ./scripts/bootstrap-schema.mjs [--reset]
 *
 * Env fallbacks:
 *   - SUPABASE_DB_URL or DATABASE_URL
 *   - If neither provided, defaults to Supabase CLI local: postgres://postgres:postgres@127.0.0.1:54322/postgres
 */

import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { Client } from "pg";

const args = new Set(process.argv.slice(2));
const shouldReset = args.has("--reset") || process.env.RESET === "1" || process.env.DROP_SCHEMA === "1";

const defaultUrl = "postgres://postgres:postgres@127.0.0.1:54322/postgres";
const dbUrl = process.env.SUPABASE_DB_URL || process.env.DATABASE_URL || defaultUrl;

const schemaPath = path.resolve("supabase", "schema_consolidated.sql");

async function main() {
  const sql = await fs.readFile(schemaPath, "utf8");
  const client = new Client({ connectionString: dbUrl });
  await client.connect();

  try {
    if (shouldReset) {
      // Drop and recreate public schema for a clean bootstrap. Requires sufficient privileges.
      process.stdout.write("[bootstrap] Resetting schema public...\n");
      await client.query("DROP SCHEMA IF EXISTS public CASCADE;");
      await client.query("CREATE SCHEMA public;");
      await client.query("GRANT ALL ON SCHEMA public TO public;");
    }

    process.stdout.write("[bootstrap] Applying consolidated schema...\n");
    await client.query(sql);
    process.stdout.write("[bootstrap] Done.\n");
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error("[bootstrap] Failed:", err?.message || err);
  process.exitCode = 1;
});

