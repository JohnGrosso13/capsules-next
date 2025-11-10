type CapsuleHistoryCacheEntry<TSnapshot> = {
  snapshot: TSnapshot;
  latestPostAt: string | null;
  suggestedGeneratedAtMs: number;
  expiresAt: number;
};

const CAPSULE_HISTORY_CACHE_TTL_MS = 5 * 60 * 1000;

const capsuleHistoryCache = new Map<string, CapsuleHistoryCacheEntry<unknown>>();

export function getCachedCapsuleHistory<TSnapshot>(capsuleId: string): CapsuleHistoryCacheEntry<TSnapshot> | null {
  const entry = capsuleHistoryCache.get(capsuleId) as CapsuleHistoryCacheEntry<TSnapshot> | undefined;
  if (!entry) return null;
  if (entry.expiresAt <= Date.now()) {
    capsuleHistoryCache.delete(capsuleId);
    return null;
  }
  return entry;
}

type CacheWriteParams<TSnapshot> = {
  capsuleId: string;
  snapshot: TSnapshot;
  latestPostAt: string | null;
  suggestedGeneratedAtMs?: number;
  ttlMs?: number;
};

export function setCachedCapsuleHistory<TSnapshot>(params: CacheWriteParams<TSnapshot>): void {
  const ttl = Math.max(1_000, params.ttlMs ?? CAPSULE_HISTORY_CACHE_TTL_MS);
  const suggestedGeneratedAtMs = params.suggestedGeneratedAtMs ?? Date.now();
  capsuleHistoryCache.set(params.capsuleId, {
    snapshot: params.snapshot,
    latestPostAt: params.latestPostAt,
    suggestedGeneratedAtMs,
    expiresAt: Date.now() + ttl,
  });
}

export function invalidateCapsuleHistoryCache(capsuleId: string): void {
  capsuleHistoryCache.delete(capsuleId);
}
