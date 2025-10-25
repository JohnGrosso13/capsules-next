import fs from "fs";
import path from "path";
import { Redis } from "@upstash/redis";

const envPath = path.resolve(".env.local");
if (fs.existsSync(envPath)) {
  const lines = fs.readFileSync(envPath, "utf8").split(/\r?\n/);
  for (const line of lines) {
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

const url = process.env.UPSTASH_REDIS_REST_URL;
const token = process.env.UPSTASH_REDIS_REST_TOKEN;
if (!url || !token) {
  console.error("Missing redis env");
  process.exit(1);
}

const redis = new Redis({ url, token });
const key = process.argv[2];
if (!key) {
  console.error("Usage: tsx scripts/read-redis-value.ts <key>");
  process.exit(1);
}
const value = await redis.get(key);
console.log(JSON.stringify({ key, value }));
