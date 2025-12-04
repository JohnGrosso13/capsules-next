import { getUpstashCacheClient } from "@/adapters/cache/upstash";
import type { CacheClient } from "@/ports/cache";

const rawVendor =
  typeof process !== "undefined" && process && typeof process.env === "object"
    ? process.env.CACHE_VENDOR
    : undefined;

const configuredVendor = (rawVendor ?? "upstash").trim().toLowerCase();

let client: CacheClient | null | undefined;

function resolveClient(): CacheClient | null {
  switch (configuredVendor) {
    case "upstash":
    case "":
      return getUpstashCacheClient();
    default:
      console.warn(`Unknown cache vendor "${configuredVendor}". Falling back to Upstash.`);
      return getUpstashCacheClient();
  }
}

export function getCacheClient(): CacheClient | null {
  if (client === undefined) {
    client = resolveClient();
  }
  return client ?? null;
}

export function getCacheVendor(): string {
  return configuredVendor || "upstash";
}
