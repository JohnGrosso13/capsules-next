#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { Client } from 'pg';

function usage() {
  console.error('Usage: node scripts/apply-sql-file.mjs <sql-file-path>');
  console.error('Environment: set DATABASE_URL=postgres://...');
}

async function main() {
  const fileArg = process.argv[2];
  if (!fileArg) {
    usage();
    process.exit(2);
  }
  const filePath = path.resolve(fileArg);
  if (!fs.existsSync(filePath)) {
    console.error(`SQL file not found: ${filePath}`);
    process.exit(1);
  }

  const databaseUrl = process.env.DATABASE_URL || process.env.SUPABASE_DB_URL;
  if (!databaseUrl) {
    console.error('Missing DATABASE_URL (or SUPABASE_DB_URL).');
    process.exit(2);
  }

  const sql = fs.readFileSync(filePath, 'utf8');
  if (!sql || !sql.trim()) {
    console.error('SQL file is empty.');
    process.exit(1);
  }

  const client = new Client({ connectionString: databaseUrl, ssl: { rejectUnauthorized: false } });
  const start = Date.now();
  try {
    await client.connect();
    await client.query('begin');
    await client.query(sql);
    await client.query('commit');
    const ms = Date.now() - start;
    console.log(`Applied SQL from ${path.basename(filePath)} in ${ms}ms`);
  } catch (err) {
    try { await client.query('rollback'); } catch {}
    console.error('Migration failed:', err?.message || err);
    process.exitCode = 1;
  } finally {
    await client.end().catch(() => {});
  }
}

main().catch((err) => {
  console.error('Unexpected failure:', err?.message || err);
  process.exit(1);
});

