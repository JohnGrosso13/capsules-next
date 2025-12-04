import "server-only";

import { Ratelimit } from "@upstash/ratelimit";

import { getUpstashRedis } from "@/adapters/cache/upstash";
import type { RateLimitAdapter, RateLimitDefinition, RateLimitResult } from "@/ports/rate-limit";

type CacheKey = string;

const limiterCache = new Map<CacheKey, Ratelimit>();

function cacheKey(definition: RateLimitDefinition): CacheKey {
  return `${definition.prefix ?? "rate-limit"}:${definition.name}:${definition.limit}:${definition.window}`;
}

function getLimiter(definition: RateLimitDefinition): Ratelimit | null {
  const redis = getUpstashRedis();
  if (!redis) return null;
  const key = cacheKey(definition);
  const cached = limiterCache.get(key);
  if (cached) return cached;
  const limiter = new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(definition.limit, definition.window),
    analytics: definition.analytics ?? false,
    prefix: definition.prefix ?? `rate-limit:${definition.name}`,
  });
  limiterCache.set(key, limiter);
  return limiter;
}

class UpstashRateLimitAdapter implements RateLimitAdapter {
  vendor = "upstash";

  async limit(definition: RateLimitDefinition, identifier: string): Promise<RateLimitResult | null> {
    const trimmed = identifier.trim();
    if (!trimmed) return null;
    const limiter = getLimiter(definition);
    if (!limiter) return null;
    try {
      const result = await limiter.limit(trimmed);
      return {
        success: result.success,
        remaining: result.remaining,
        limit: result.limit,
        reset: typeof result.reset === "number" ? result.reset : null,
      };
    } catch (error) {
      console.warn("Rate limit check failed", { name: definition.name, error });
      return null;
    }
  }
}

let cachedAdapter: RateLimitAdapter | null = null;

export function getUpstashRateLimitAdapter(): RateLimitAdapter | null {
  if (!cachedAdapter) {
    const redis = getUpstashRedis();
    if (!redis) return null;
    cachedAdapter = new UpstashRateLimitAdapter();
  }
  return cachedAdapter;
}
