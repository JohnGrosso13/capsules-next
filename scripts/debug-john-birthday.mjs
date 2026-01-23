import { Client } from "pg";

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error("DATABASE_URL is not set");
    process.exit(1);
  }

  process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

  const client = new Client({
    connectionString,
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();

  const ownerId = "f4d1d5bc-e21d-4bc8-884d-2c34c94139bf";

  const sql =
    "select id, owner_user_id, kind, title, description, created_at " +
    "from memories " +
    "where owner_user_id = $1 and (description ilike '%birthday%' or cast(meta as text) ilike '%birthday%') " +
    "order by created_at desc " +
    "limit 10";

  const res = await client.query(sql, [ownerId]);
  console.log(JSON.stringify(res.rows, null, 2));

  await client.end();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

