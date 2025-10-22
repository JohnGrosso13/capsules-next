#!/usr/bin/env node
/*
 * Dev helper: restore baseline Supabase grants on schema public.
 *
 * Usage:
 *   DATABASE_URL=postgres://postgres:postgres@localhost:54322/postgres \
 *   node ./scripts/grant-dev-privileges.mjs
 */

import process from "node:process";
import { Client } from "pg";

const defaultUrl = "postgres://postgres:postgres@127.0.0.1:54322/postgres";
const dbUrl = process.env.SUPABASE_DB_URL || process.env.DATABASE_URL || defaultUrl;

const SQL = `
-- Schema ownership and usage
alter schema public owner to postgres;
grant usage on schema public to anon, authenticated, service_role;
grant create on schema public to service_role;
grant all on schema public to postgres;

-- Existing objects
grant all on all tables in schema public to service_role;
grant select, insert, update, delete on all tables in schema public to authenticated, anon;
grant all on all sequences in schema public to service_role;
grant usage, select on all sequences in schema public to authenticated, anon;
grant execute on all functions in schema public to authenticated, anon, service_role;

-- Defaults for future objects created by owner (postgres)
alter default privileges in schema public grant all on tables to service_role;
alter default privileges in schema public grant select, insert, update, delete on tables to authenticated, anon;
alter default privileges in schema public grant all on sequences to service_role;
alter default privileges in schema public grant usage, select on sequences to authenticated, anon;
alter default privileges in schema public grant execute on functions to authenticated, anon, service_role;
`;

async function main() {
  // Enable SSL for Supabase hosts and allow self-signed chain in dev.
  let ssl = undefined;
  try {
    const u = new URL(dbUrl);
    if (/\.supabase\.co$/i.test(u.hostname)) {
      ssl = { rejectUnauthorized: false };
    }
  } catch {}
  const client = new Client({ connectionString: dbUrl, ssl });
  await client.connect();
  try {
    process.stdout.write("[grants] Applying baseline dev grants...\n");
    await client.query("BEGIN");
    await client.query(SQL);
    await client.query("COMMIT");
    process.stdout.write("[grants] Done.\n");
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("[grants] Failed:", err?.message || err);
    process.exitCode = 1;
  } finally {
    await client.end();
  }
}

main();
