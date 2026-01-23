import { Client } from "pg";

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error("DATABASE_URL is not set");
    process.exit(1);
  }

  // Allow self-signed certs for this debug script.
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

  const client = new Client({
    connectionString,
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();

  const sql =
    "select id, owner_user_id, kind, title, description, created_at " +
    "from memories " +
    "where description ilike '%Merry Christmas, fam%' " +
    "order by created_at desc " +
    "limit 5";

  const res = await client.query(sql);
  console.log(JSON.stringify(res.rows, null, 2));

  await client.end();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

