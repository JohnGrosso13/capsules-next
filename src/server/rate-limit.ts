import "server-only";

import { getRateLimitAdapter } from "@/config/rate-limit";
import type { RateLimitDefinition, RateLimitResult } from "@/ports/rate-limit";

export type { RateLimitDefinition, RateLimitResult };

export async function checkRateLimit(
  definition: RateLimitDefinition,
  identifier: string,
): Promise<RateLimitResult | null> {
  const adapter = getRateLimitAdapter();
  if (!adapter) return null;
  return adapter.limit(definition, identifier);
}

export type RateLimitCheck = {
  definition: RateLimitDefinition;
  identifier: string | null | undefined;
};

export async function checkRateLimits(
  checks: RateLimitCheck[],
): Promise<RateLimitResult | null> {
  for (const { definition, identifier } of checks) {
    const normalized = typeof identifier === "string" ? identifier.trim() : "";
    if (!normalized.length) continue;
    const result = await checkRateLimit(definition, normalized);
    if (result && !result.success) {
      return result;
    }
  }
  return null;
}

export function retryAfterSeconds(reset: number | null | undefined): number | null {
  if (typeof reset !== "number" || !Number.isFinite(reset)) return null;
  const nowSeconds = Math.floor(Date.now() / 1000);
  const diff = reset - nowSeconds;
  return diff > 0 ? diff : 0;
}
