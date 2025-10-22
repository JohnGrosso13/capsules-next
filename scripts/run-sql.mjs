import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from 'pg';

function parseArgs(argv) {
  const out = { file: null, url: null };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if ((a === '--file' || a === '-f') && i + 1 < argv.length) {
      out.file = argv[++i];
    } else if ((a === '--url' || a === '-u') && i + 1 < argv.length) {
      out.url = argv[++i];
    }
  }
  return out;
}

async function main() {
  const { file, url } = parseArgs(process.argv);
  if (!file) {
    console.error('Usage: node scripts/run-sql.mjs --file <path> [--url <postgres-url>]');
    process.exit(2);
  }

  const cwd = path.dirname(fileURLToPath(import.meta.url));
  const absFile = path.resolve(cwd, '..', file);
  if (!fs.existsSync(absFile)) {
    console.error(`SQL file not found: ${absFile}`);
    process.exit(2);
  }

  const connectionString = url || process.env.SUPABASE_DB_URL || process.env.DATABASE_URL;
  if (!connectionString) {
    console.error('Missing connection string. Provide --url or set SUPABASE_DB_URL / DATABASE_URL');
    process.exit(2);
  }

  const sql = fs.readFileSync(absFile, 'utf8');
  if (!sql.trim()) {
    console.error('SQL file is empty');
    process.exit(2);
  }

  const client = new Client({ connectionString, ssl: { rejectUnauthorized: false } });
  const started = Date.now();
  try {
    await client.connect();
    await client.query('begin');
    await client.query(sql);
    await client.query('commit');
    const ms = Date.now() - started;
    console.log(`Executed SQL from ${file} in ${ms}ms`);
  } catch (err) {
    try { await client.query('rollback'); } catch {}
    console.error('SQL execution failed:', err?.message || err);
    process.exitCode = 1;
  } finally {
    try { await client.end(); } catch {}
  }
}

main().catch((err) => {
  console.error('Unexpected error:', err?.message || err);
  process.exit(1);
});
