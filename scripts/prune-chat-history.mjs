import { Pool } from "pg";

function parseArgs(argv) {
  const opts = { days: 30, url: null };
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if ((arg === "--days" || arg === "-d") && i + 1 < argv.length) {
      const value = Number(argv[i + 1]);
      if (Number.isFinite(value) && value > 0) {
        opts.days = Math.floor(value);
      }
      i += 1;
    } else if ((arg === "--url" || arg === "-u") && i + 1 < argv.length) {
      opts.url = argv[i + 1];
      i += 1;
    }
  }
  return opts;
}

async function prune(client, cutoffIso) {
  const stats = { directReactions: 0, directMessages: 0, groupReactions: 0, groupMessages: 0 };

  const queries = [
    {
      sql: `delete from public.chat_group_message_reactions
            where message_id in (
              select id from public.chat_group_messages where created_at < $1
            )`,
      key: "groupReactions",
    },
    {
      sql: `delete from public.chat_group_messages where created_at < $1`,
      key: "groupMessages",
    },
    {
      sql: `delete from public.chat_message_reactions
            where message_id in (
              select id from public.chat_messages where created_at < $1
            )`,
      key: "directReactions",
    },
    {
      sql: `delete from public.chat_messages where created_at < $1`,
      key: "directMessages",
    },
  ];

  for (const query of queries) {
    const result = await client.query(query.sql, [cutoffIso]);
    stats[query.key] += result.rowCount ?? 0;
  }

  return stats;
}

async function main() {
  const { days, url } = parseArgs(process.argv);
  const connectionString =
    url || process.env.SUPABASE_MIGRATIONS_URL || process.env.DATABASE_URL || process.env.SUPABASE_DB_URL;
  if (!connectionString) {
    console.error("Missing database connection string. Provide --url or set SUPABASE_MIGRATIONS_URL.");
    process.exit(2);
  }

  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const pool = new Pool({
    connectionString,
    ssl:
      connectionString.includes("localhost") || connectionString.includes("127.0.0.1")
        ? undefined
        : { rejectUnauthorized: false },
  });

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const stats = await prune(client, cutoff.toISOString());
    await client.query("COMMIT");
    console.log(
      `Pruned chat history before ${cutoff.toISOString()} (direct messages: ${stats.directMessages}, direct reactions: ${stats.directReactions}, group messages: ${stats.groupMessages}, group reactions: ${stats.groupReactions})`,
    );
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Chat history prune failed", error?.message ?? error);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error?.message ?? error);
  process.exitCode = 1;
});
