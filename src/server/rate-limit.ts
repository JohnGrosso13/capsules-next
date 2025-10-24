import "server-only";

import { Ratelimit } from "@upstash/ratelimit";
import type { Ratelimit as UpstashRatelimit, RatelimitResponse } from "@upstash/ratelimit";

import { getRedis } from "@/server/redis/client";

type Window = `${number} ${"s" | "m" | "h" | "d"}`;

export type RateLimitDefinition = {
  name: string;
  limit: number;
  window: Window;
  analytics?: boolean;
  prefix?: string;
};

type LimiterCacheKey = string;

const limiterCache = new Map<LimiterCacheKey, UpstashRatelimit>();

function resolverKey(definition: RateLimitDefinition): LimiterCacheKey {
  return `${definition.prefix ?? "rate-limit"}:${definition.name}:${definition.limit}:${definition.window}`;
}

function getLimiter(definition: RateLimitDefinition): UpstashRatelimit | null {
  const redis = getRedis();
  if (!redis) return null;

  const cacheKey = resolverKey(definition);
  const cached = limiterCache.get(cacheKey);
  if (cached) return cached;

  const limiter = new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(definition.limit, definition.window),
    analytics: definition.analytics ?? false,
    prefix: definition.prefix ?? `rate-limit:${definition.name}`,
  });

  limiterCache.set(cacheKey, limiter);
  return limiter;
}

export async function checkRateLimit(
  definition: RateLimitDefinition,
  identifier: string,
): Promise<RatelimitResponse | null> {
  const trimmed = identifier.trim();
  if (!trimmed) return null;

  const limiter = getLimiter(definition);
  if (!limiter) return null;

  try {
    return await limiter.limit(trimmed);
  } catch (error) {
    console.warn("Rate limit check failed", { name: definition.name, error });
    return null;
  }
}

export function retryAfterSeconds(reset: number | null | undefined): number | null {
  if (typeof reset !== "number" || !Number.isFinite(reset)) return null;
  const nowSeconds = Math.floor(Date.now() / 1000);
  const diff = reset - nowSeconds;
  return diff > 0 ? diff : 0;
}

