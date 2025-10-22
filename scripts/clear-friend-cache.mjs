#!/usr/bin/env node

import process from "node:process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

function loadEnvFile(filename) {
  const filePath = filename;
  if (!existsSync(filePath)) return;
  const contents = readFileSync(filePath, "utf8");
  const lines = contents.split(/\r?\n/);
  for (const line of lines) {
    if (!line || line.startsWith("#")) continue;
    const index = line.indexOf("=");
    if (index === -1) continue;
    const key = line.slice(0, index).trim();
    if (!key || process.env[key]) continue;
    let value = line.slice(index + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

const scriptDir = fileURLToPath(new URL(".", import.meta.url));
const projectRoot = resolve(scriptDir, "..");
loadEnvFile(resolve(projectRoot, ".env.local"));
loadEnvFile(resolve(projectRoot, ".env"));

import { Redis } from "@upstash/redis";

function resolveEnv(key) {
  const value = process.env[key];
  if (typeof value !== "string" || !value.trim()) {
    return null;
  }
  return value.trim();
}

function assertEnv(key) {
  const value = resolveEnv(key);
  if (!value) {
    console.error(`Missing required environment variable: ${key}`);
    process.exitCode = 1;
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

async function collectKeys(redis, pattern) {
  let cursor = "0";
  const keys = [];
  do {
    const [nextCursor, batch] = await redis.scan(cursor, { match: pattern, count: 100 });
    cursor = nextCursor;
    if (Array.isArray(batch)) {
      keys.push(...batch);
    }
  } while (cursor !== "0");
  return keys;
}

async function clearFriendIds(redis, userId = null) {
  const pattern = userId ? `friends:ids:${userId}` : "friends:ids:*";
  const keys = await collectKeys(redis, pattern);
  if (!keys.length) {
    console.log(`No friend cache keys matched pattern "${pattern}"`);
    return;
  }
  const deletions = await Promise.all(
    keys.map(async (key) => {
      try {
        await redis.del(key);
        return { key, ok: true };
      } catch (error) {
        return { key, ok: false, error };
      }
    }),
  );
  const succeeded = deletions.filter((result) => result.ok).map((result) => result.key);
  const failed = deletions.filter((result) => !result.ok);
  if (succeeded.length) {
    console.log(`Deleted ${succeeded.length} friend cache key(s):`);
    succeeded.forEach((key) => console.log(`  - ${key}`));
  } else {
    console.log(`No friend cache keys deleted for pattern "${pattern}"`);
  }
  if (failed.length) {
    console.warn(`Failed to delete ${failed.length} key(s):`);
    failed.forEach((entry) => {
      console.warn(`  - ${entry.key}`, entry.error);
    });
    process.exitCode = 1;
  }
}

async function main() {
  const url = assertEnv("UPSTASH_REDIS_REST_URL");
  const token = assertEnv("UPSTASH_REDIS_REST_TOKEN");
  const redis = new Redis({ url, token });

  const userIdArg = process.argv[2]?.trim();
  await clearFriendIds(redis, userIdArg && userIdArg.length ? userIdArg : null);
}

main().catch((error) => {
  console.error("Failed to clear friend cache keys", error);
  process.exitCode = 1;
});
