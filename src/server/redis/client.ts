import "server-only";

import { getCacheClient } from "@/config/cache";
import type { CacheClient } from "@/ports/cache";

export function getRedis(): CacheClient | null {
  return getCacheClient();
}
