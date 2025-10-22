import "server-only";

import { Redis } from "@upstash/redis";

import { serverEnv } from "@/lib/env/server";

let redisClient: Redis | null = null;

export function getRedis(): Redis | null {
  if (redisClient) return redisClient;
  const { UPSTASH_REDIS_REST_URL: url, UPSTASH_REDIS_REST_TOKEN: token } = serverEnv;
  if (!url || !token) return null;
  redisClient = new Redis({ url, token });
  return redisClient;
}

