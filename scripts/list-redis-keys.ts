import fs from "fs";
import path from "path";
import { Redis } from "@upstash/redis";

const envPath = path.resolve(".env.local");
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    if (!line || line.startsWith("#")) continue;
    const idx = line.indexOf("=");
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    if (!key || process.env[key]) continue;
    let value = line.slice(idx + 1).trim();
    if (
      (value.startsWith("\"") && value.endsWith("\"")) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
});

async function listKeys(pattern: string) {
  let cursor = "0";
  const keys: string[] = [];
  do {
    const [nextCursor, batch] = await redis.scan(cursor, { match: pattern, count: 100 });
    cursor = nextCursor;
    if (Array.isArray(batch)) keys.push(...batch);
  } while (cursor !== "0");
  return keys;
}

const pattern = process.argv[2] ?? "*";
const keys = await listKeys(pattern);
console.log(JSON.stringify({ pattern, count: keys.length, keys }, null, 2));
