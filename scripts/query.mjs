import { Client } from "pg";

function parseArgs(argv) {
  const out = { url: null, sql: null };
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if ((arg === "--url" || arg === "-u") && i + 1 < argv.length) {
      out.url = argv[++i];
    } else if ((arg === "--sql" || arg === "-s") && i + 1 < argv.length) {
      out.sql = argv[++i];
    }
  }
  return out;
}

async function main() {
  const { url, sql } = parseArgs(process.argv);
  if (!url || !sql) {
    console.error("Usage: node scripts/query.mjs --url <postgres-url> --sql <statement>");
    process.exit(2);
  }

  const client = new Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
  await client.connect();
  try {
    const result = await client.query(sql);
    console.log(JSON.stringify(result.rows, null, 2));
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error("Query failed:", error?.message || error);
  process.exit(1);
});
