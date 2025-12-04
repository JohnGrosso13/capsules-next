import "server-only";

import { Redis } from "@upstash/redis";

import type { CacheClient, SortedSetEntry } from "@/ports/cache";
import { serverEnv } from "@/lib/env/server";

let cachedRedis: Redis | null = null;

function createRedis(): Redis | null {
  const url = serverEnv.UPSTASH_REDIS_REST_URL?.trim();
  const token = serverEnv.UPSTASH_REDIS_REST_TOKEN?.trim();
  if (!url || !token) return null;
  if (!cachedRedis) {
    cachedRedis = new Redis({ url, token });
  }
  return cachedRedis;
}

class UpstashCacheClient implements CacheClient {
  constructor(private readonly redis: Redis) {}

  async get<T = unknown>(key: string): Promise<T | null> {
    const value = await this.redis.get<T>(key);
    return (value ?? null) as T | null;
  }

  async set(key: string, value: unknown, options?: { ex?: number }): Promise<void> {
    const setOptions =
      options && typeof options.ex === "number" ? ({ ex: options.ex } as const) : undefined;
    await this.redis.set(key, value as never, setOptions);
  }

  async del(key: string): Promise<void> {
    await this.redis.del(key);
  }

  async zadd(key: string, entries: SortedSetEntry[]): Promise<number> {
    if (!entries.length) return 0;
    const mapped = entries.map(({ score, member }) => ({ score, member }));
    const firstEntry = mapped[0];
    if (!firstEntry) return 0;
    const restEntries = mapped.slice(1);
    const result = restEntries.length
      ? await this.redis.zadd(key, firstEntry, ...restEntries)
      : await this.redis.zadd(key, firstEntry);
    return result ?? 0;
  }

  async zrange(
    key: string,
    start: number,
    stop: number,
    options?: { rev?: boolean },
  ): Promise<string[]> {
    return this.redis.zrange(key, start, stop, options as never);
  }

  async zremrangebyscore(key: string, min: number, max: number): Promise<number> {
    return this.redis.zremrangebyscore(key, min, max);
  }

  async zrem(key: string, members: string | string[]): Promise<number> {
    const args = Array.isArray(members) ? members : [members];
    if (!args.length) return 0;
    return this.redis.zrem(key, ...args);
  }
}

let cachedClient: CacheClient | null = null;

export function getUpstashRedis(): Redis | null {
  return createRedis();
}

export function getUpstashCacheClient(): CacheClient | null {
  const redis = createRedis();
  if (!redis) return null;
  if (!cachedClient) {
    cachedClient = new UpstashCacheClient(redis);
  }
  return cachedClient;
}
