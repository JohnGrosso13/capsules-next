import "server-only";

import { getRedis } from "@/server/redis/client";
import type { SummaryApiResponse } from "@/types/summary";
import { buildSummarySignature, type SummarySignaturePayload } from "@/lib/ai/summary-signature";

const CACHE_PREFIX = "summary:v1:";
const CACHE_TTL_SECONDS = 60 * 5; // 5 minutes

function isLikelyJsonPayload(raw: string): boolean {
  if (typeof raw !== "string") return false;
  const trimmed = raw.trim();
  if (!trimmed.length) return false;
  const first = trimmed[0];
  const last = trimmed[trimmed.length - 1];
  return (
    (first === "{" && last === "}") ||
    (first === "[" && last === "]")
  );
}

type SummaryCacheEntry = SummaryApiResponse & {
  cachedAt: string;
};

export async function readSummaryCache(
  payload: SummarySignaturePayload,
): Promise<SummaryCacheEntry | null> {
  const redis = getRedis();
  if (!redis) return null;
  try {
    const signature = buildSummarySignature(payload);
    const cacheKey = `${CACHE_PREFIX}${signature}`;
    const raw = await redis.get<string>(cacheKey);
    if (!raw) return null;
    if (!isLikelyJsonPayload(raw)) {
      console.warn("summary cache read skipped due to malformed payload", { key: cacheKey });
      await redis.del(cacheKey);
      return null;
    }
    try {
      const parsed = JSON.parse(raw) as SummaryCacheEntry;
      return parsed;
    } catch (error) {
      console.warn("summary cache read failed to parse payload", { key: cacheKey, error });
      await redis.del(cacheKey);
      return null;
    }
  } catch (error) {
    console.warn("summary cache read failed", error);
    return null;
  }
}

export async function writeSummaryCache(
  payload: SummarySignaturePayload,
  response: SummaryApiResponse,
): Promise<void> {
  const redis = getRedis();
  if (!redis) return;
  try {
    const signature = buildSummarySignature(payload);
    const entry: SummaryCacheEntry = { ...response, cachedAt: new Date().toISOString() };
    await redis.set(`${CACHE_PREFIX}${signature}`, JSON.stringify(entry), { ex: CACHE_TTL_SECONDS });
  } catch (error) {
    console.warn("summary cache write failed", error);
  }
}
