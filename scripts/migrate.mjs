import fs from "fs/promises";
import path from "path";
import { createHash } from "crypto";
import { fileURLToPath } from "url";
import { Pool } from "pg";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const MIGRATIONS_DIR = path.join(__dirname, "..", "supabase", "migrations");

function resolveConnectionString() {
  const candidates = [
    process.env.DATABASE_URL,
    process.env.SUPABASE_DB_URL,
    process.env.SUPABASE_MIGRATIONS_URL,
  ];
  const value = candidates.find((entry) => typeof entry === "string" && entry.length > 0);
  if (!value) {
    throw new Error(
      "Missing database connection string. Set DATABASE_URL or SUPABASE_DB_URL with a Postgres connection URI.",
    );
  }
  return value;
}

async function loadMigrations() {
  const entries = await fs.readdir(MIGRATIONS_DIR, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".sql"))
    .map((entry) => entry.name)
    .sort();
}

async function applyMigration(client, fileName, sql) {
  const checksum = createHash("sha256").update(sql).digest("hex");
  await client.query(sql);
  await client.query(
    `insert into public.__migrations (name, checksum) values ($1, $2)`,
    [fileName, checksum],
  );
}

async function ensureHistoryTable(client) {
  await client.query(`
    create table if not exists public.__migrations (
      id bigserial primary key,
      name text not null unique,
      checksum text not null,
      applied_at timestamptz not null default now()
    )
  `);
}

async function run() {
  const connectionString = resolveConnectionString();
  const useSSL = !/localhost|127\.0\.0\.1/.test(connectionString);
  const pool = new Pool({
    connectionString,
    ssl: useSSL ? { rejectUnauthorized: false } : undefined,
  });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await ensureHistoryTable(client);
    const appliedRows = await client.query(`select name from public.__migrations order by name asc`);
    const applied = new Set(appliedRows.rows.map((row) => row.name));

    const files = await loadMigrations();
    for (const file of files) {
      if (applied.has(file)) continue;
      const sqlPath = path.join(MIGRATIONS_DIR, file);
      const sql = await fs.readFile(sqlPath, "utf8");
      if (!sql.trim()) continue;
      console.log(`Applying migration: ${file}`);
      try {
        await applyMigration(client, file, sql);
      } catch (error) {
        throw new Error(`Migration failed (${file}): ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    await client.query("COMMIT");
    console.log("Migrations complete.");
  } catch (error) {
    await client.query("ROLLBACK");
    console.error(error);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
