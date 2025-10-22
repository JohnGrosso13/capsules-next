#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { Client } from 'pg';

async function main() {
  const [conn, file] = process.argv.slice(2);
  if (!conn || !file) {
    console.error('Usage: node scripts/run-sql-file.mjs <connection_url> <sql_file>');
    process.exit(2);
  }
  const sqlPath = path.resolve(file);
  const sql = await fs.readFile(sqlPath, 'utf8');

  const client = new Client({ connectionString: conn, ssl: { rejectUnauthorized: false } });
  await client.connect();
  try {
    await client.query('begin');
    // Ensure pgcrypto for gen_random_uuid
    await client.query('create extension if not exists pgcrypto;');
    await client.query(sql);
    await client.query('commit');
    console.log('SQL applied successfully:', path.basename(sqlPath));
  } catch (error) {
    try { await client.query('rollback'); } catch {}
    console.error('SQL apply failed:', error?.message || error);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error('Unexpected error:', err?.message || err);
  process.exit(1);
});

