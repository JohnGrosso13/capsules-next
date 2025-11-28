import fs from "fs/promises";
import path from "path";
import { createHash } from "crypto";
import { fileURLToPath } from "url";
import { Pool } from "pg";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const MIGRATIONS_DIR = path.join(__dirname, "..", "supabase", "migrations");
const TARGET_FILE = "202511271200_user_notifications.sql";

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

    const history = await client.query(
      `select name, checksum from public.__migrations where name = $1 limit 1`,
      [TARGET_FILE],
    );
    const alreadyApplied = history.rows.length > 0;

    const sqlPath = path.join(MIGRATIONS_DIR, TARGET_FILE);
    const sql = await fs.readFile(sqlPath, "utf8");
    if (!sql.trim()) {
      console.log(`Migration ${TARGET_FILE} is empty; nothing to apply.`);
      await client.query("COMMIT");
      return;
    }

    const checksum = createHash("sha256").update(sql).digest("hex");

    if (alreadyApplied) {
      const previous = history.rows[0]?.checksum;
      if (previous && previous !== checksum) {
        throw new Error(
          `Checksum mismatch for ${TARGET_FILE}. Existing migration differs from local file.`,
        );
      }
      console.log(`Migration ${TARGET_FILE} already applied; skipping.`);
      await client.query("COMMIT");
      return;
    }

    console.log(`Applying migration: ${TARGET_FILE}`);
    await client.query(sql);
    await client.query(`insert into public.__migrations (name, checksum) values ($1, $2)`, [
      TARGET_FILE,
      checksum,
    ]);

    await client.query("COMMIT");
    console.log("User notifications migration applied successfully.");
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

