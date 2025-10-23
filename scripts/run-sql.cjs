#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

async function main() {
  const file = process.argv[2];
  const conn = process.argv[3] || process.env.SUPABASE_DB_URL;
  if (!file) {
    console.error('Usage: node scripts/run-sql.js <file.sql> [connectionString]');
    process.exit(2);
  }
  if (!conn) {
    console.error('Missing connection string. Provide as arg or SUPABASE_DB_URL env var.');
    process.exit(2);
  }
  const sql = fs.readFileSync(path.resolve(file), 'utf8');
  const client = new Client({ connectionString: conn, ssl: { rejectUnauthorized: false } });
  await client.connect();
  try {
    await client.query('begin');
    await client.query(sql);
    await client.query('commit');
    console.log('Executed SQL successfully:', file);
  } catch (err) {
    await client.query('rollback').catch(() => {});
    console.error('SQL execution failed:', err.message);
    process.exitCode = 1;
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
