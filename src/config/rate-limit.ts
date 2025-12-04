import { getUpstashRateLimitAdapter } from "@/adapters/rate-limit/upstash";
import type { RateLimitAdapter } from "@/ports/rate-limit";

const rawVendor =
  typeof process !== "undefined" && process && typeof process.env === "object"
    ? process.env.RATE_LIMIT_VENDOR
    : undefined;

const configuredVendor = (rawVendor ?? "upstash").trim().toLowerCase();

let adapter: RateLimitAdapter | null | undefined;

function resolveAdapter(): RateLimitAdapter | null {
  switch (configuredVendor) {
    case "upstash":
    case "":
      return getUpstashRateLimitAdapter();
    default:
      console.warn(`Unknown rate limit vendor "${configuredVendor}". Falling back to Upstash.`);
      return getUpstashRateLimitAdapter();
  }
}

export function getRateLimitAdapter(): RateLimitAdapter | null {
  if (adapter === undefined) {
    adapter = resolveAdapter();
  }
  return adapter ?? null;
}

export function getRateLimitVendor(): string {
  return configuredVendor || "upstash";
}
