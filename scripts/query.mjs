import { Client } from "pg";
import fs from "fs";

function parseArgs(argv) {
  const out = { url: null, sql: null, file: null };
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if ((arg === "--url" || arg === "-u") && i + 1 < argv.length) {
      out.url = argv[++i];
    } else if ((arg === "--sql" || arg === "-s") && i + 1 < argv.length) {
      out.sql = argv[++i];
    } else if ((arg === "--file" || arg === "-f") && i + 1 < argv.length) {
      out.file = argv[++i];
    }
  }
  return out;
}

async function main() {
  const { url, sql, file } = parseArgs(process.argv);
  let statement = sql;
  if (!statement && file) {
    try {
      statement = fs.readFileSync(file, "utf8");
    } catch (err) {
      console.error(`Failed to read SQL file: ${file}`);
      console.error(err?.message || String(err));
      process.exit(2);
    }
  }
  if (!url || !statement) {
    console.error("Usage: node scripts/query.mjs --url <postgres-url> --sql <statement> | --file <path>");
    process.exit(2);
  }

  const client = new Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
  await client.connect();
  try {
    const result = await client.query(statement);
    console.log(JSON.stringify(result.rows, null, 2));
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error("Query failed:", error?.message || error);
  process.exit(1);
});
