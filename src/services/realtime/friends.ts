import "server-only";

import type { Redis } from "@upstash/redis";

import { getRealtimeAuthProvider, getRealtimePublisher } from "@/config/realtime-server";
import { getChatDirectChannel, CHAT_CONSTANTS } from "@/lib/chat/channels";
import { listFriendUserIds } from "@/server/friends/repository";
import { getRedis } from "@/server/redis/client";
import type { RealtimeAuthPayload, RealtimeCapabilities } from "@/ports/realtime";

export const FRIEND_CHANNEL_PREFIX = "user";
export const FRIEND_EVENTS_NAMESPACE = "friends";
export const FRIEND_PRESENCE_CHANNEL = "presence:friends";

function grantCapability(
  capabilities: RealtimeCapabilities,
  channel: string,
  operations: string[],
): void {
  const trimmed = channel.trim();
  if (!trimmed) return;
  const next = new Set(capabilities[trimmed] ?? []);
  operations.forEach((operation) => {
    if (operation) next.add(operation);
  });
  capabilities[trimmed] = Array.from(next);
}

export type FriendRealtimeEvent = {
  type: string;
  payload: Record<string, unknown>;
};

type FriendIdCacheEntry = {
  value: string[];
  expiresAt: number;
};

const FRIEND_ID_CACHE_TTL_SECONDS = 60;
const FRIEND_ID_CACHE_ERROR_TTL_SECONDS = 10;
const FRIEND_ID_CACHE_TTL_MS = FRIEND_ID_CACHE_TTL_SECONDS * 1000;
const FRIEND_ID_CACHE_ERROR_TTL_MS = FRIEND_ID_CACHE_ERROR_TTL_SECONDS * 1000;
const FRIEND_ID_REDIS_KEY_PREFIX = "friends:ids";

const memoryFriendIdCache = new Map<string, FriendIdCacheEntry>();
const friendIdFetches = new Map<string, Promise<string[]>>();

function buildFriendIdsCacheKey(userId: string): string {
  return `${FRIEND_ID_REDIS_KEY_PREFIX}:${userId}`;
}

function sanitizeFriendIds(ids: string[]): string[] {
  const normalized = ids
    .map((id) => (typeof id === "string" ? id.trim() : ""))
    .filter((id) => id.length > 0);
  return normalized.length ? Array.from(new Set(normalized)) : [];
}

function normalizeRedisValue(raw: string | null): string[] | null {
  if (raw === null) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return null;
    const normalized = parsed
      .map((value) => {
        if (typeof value === "string") {
          const trimmed = value.trim();
          return trimmed.length ? trimmed : null;
        }
        if (typeof value === "number" && Number.isFinite(value)) {
          return String(value);
        }
        return null;
      })
      .filter((value): value is string => Boolean(value));
    return normalized.length ? Array.from(new Set(normalized)) : [];
  } catch (error) {
    console.warn("Friend realtime cache parse error", error);
    const trimmed = raw.trim();
    if (!trimmed.length) return null;
    const fallback = trimmed
      .split(/[,\s]+/)
      .map((value) => value.trim())
      .filter((value) => value.length > 0);
    if (fallback.length === 0) return null;
    return Array.from(new Set(fallback));
  }
}

async function readFriendIdsFromRedis(redis: Redis, userId: string): Promise<string[] | null> {
  try {
    const raw = await redis.get<string>(buildFriendIdsCacheKey(userId));
    return normalizeRedisValue(raw ?? null);
  } catch (error) {
    console.warn("Friend realtime cache read failed", { userId, error });
    return null;
  }
}

async function writeFriendIdsToRedis(
  redis: Redis,
  userId: string,
  ids: string[],
  ttlSeconds: number,
): Promise<void> {
  try {
    await redis.set(buildFriendIdsCacheKey(userId), JSON.stringify(ids), { ex: ttlSeconds });
  } catch (error) {
    console.warn("Friend realtime cache write failed", { userId, error });
  }
}

function getMemoryCacheEntry(userId: string): FriendIdCacheEntry | null {
  return memoryFriendIdCache.get(userId) ?? null;
}

function isMemoryCacheFresh(entry: FriendIdCacheEntry | null): boolean {
  return Boolean(entry && entry.expiresAt > Date.now());
}

function setMemoryCacheEntry(userId: string, ids: string[], ttlMs: number): void {
  memoryFriendIdCache.set(userId, {
    value: sanitizeFriendIds(ids),
    expiresAt: Date.now() + ttlMs,
  });
}

async function getFriendIdsFromMemory(userId: string): Promise<string[]> {
  const cacheEntry = getMemoryCacheEntry(userId);
  if (isMemoryCacheFresh(cacheEntry) && cacheEntry) {
    return cacheEntry.value;
  }
  const staleValue = cacheEntry?.value ?? null;

  const pending = friendIdFetches.get(userId);
  if (pending) {
    if (staleValue) return staleValue;
    return pending;
  }

  const fetchPromise = (async () => {
    try {
      const ids = await listFriendUserIds(userId);
      const sanitized = sanitizeFriendIds(ids);
      setMemoryCacheEntry(userId, sanitized, FRIEND_ID_CACHE_TTL_MS);
      return sanitized;
    } catch (error) {
      if (staleValue) {
        setMemoryCacheEntry(userId, staleValue, FRIEND_ID_CACHE_ERROR_TTL_MS);
        return staleValue;
      }
      throw error;
    }
  })();

  friendIdFetches.set(userId, fetchPromise);
  try {
    return await fetchPromise;
  } finally {
    friendIdFetches.delete(userId);
  }
}

async function getFriendIdsFromRedis(userId: string, redis: Redis): Promise<string[]> {
  const cached = await readFriendIdsFromRedis(redis, userId);
  if (cached !== null) {
    setMemoryCacheEntry(userId, cached, FRIEND_ID_CACHE_TTL_MS);
    return cached;
  }

  const pending = friendIdFetches.get(userId);
  if (pending) {
    return pending;
  }

  const fetchPromise = (async () => {
    try {
      const ids = await listFriendUserIds(userId);
      const sanitized = sanitizeFriendIds(ids);
      setMemoryCacheEntry(userId, sanitized, FRIEND_ID_CACHE_TTL_MS);
      await writeFriendIdsToRedis(redis, userId, sanitized, FRIEND_ID_CACHE_TTL_SECONDS);
      return sanitized;
    } catch (error) {
      const fallback = await readFriendIdsFromRedis(redis, userId);
      if (fallback !== null) {
        setMemoryCacheEntry(userId, fallback, FRIEND_ID_CACHE_ERROR_TTL_MS);
        await writeFriendIdsToRedis(redis, userId, fallback, FRIEND_ID_CACHE_ERROR_TTL_SECONDS);
        return fallback;
      }
      const memoryFallback = getMemoryCacheEntry(userId);
      if (memoryFallback) {
        setMemoryCacheEntry(userId, memoryFallback.value, FRIEND_ID_CACHE_ERROR_TTL_MS);
        return memoryFallback.value;
      }
      throw error;
    }
  })();

  friendIdFetches.set(userId, fetchPromise);
  try {
    return await fetchPromise;
  } finally {
    friendIdFetches.delete(userId);
  }
}

async function getCachedFriendIds(userId: string): Promise<string[]> {
  const normalizedUserId = userId.trim();
  if (!normalizedUserId) return [];

  const redis = getRedis();
  if (!redis) {
    return getFriendIdsFromMemory(normalizedUserId);
  }

  return getFriendIdsFromRedis(normalizedUserId, redis);
}

export function friendEventsChannel(userId: string): string {
  const trimmed = userId.trim();
  return `${FRIEND_CHANNEL_PREFIX}:${trimmed}:${FRIEND_EVENTS_NAMESPACE}`;
}

export async function publishFriendEvents(
  events: Array<{ userId: string; event: FriendRealtimeEvent }>,
): Promise<void> {
  const publisher = getRealtimePublisher();
  if (!publisher || !Array.isArray(events) || !events.length) return;
  await Promise.all(
    events.map(async ({ userId, event }) => {
      try {
        await publisher.publish(friendEventsChannel(userId), event.type, event.payload);
      } catch (error) {
        console.error("Friend realtime publish error", { userId, type: event.type, error });
      }
    }),
  );
}

export async function createFriendRealtimeAuth(
  userId: string,
): Promise<RealtimeAuthPayload | null> {
  const authProvider = getRealtimeAuthProvider();
  if (!authProvider) return null;
  const capabilities: RealtimeCapabilities = {
    [friendEventsChannel(userId)]: ["subscribe"],
    [FRIEND_PRESENCE_CHANNEL]: ["subscribe", "publish", "presence"],
  };

  try {
    grantCapability(capabilities, getChatDirectChannel(userId), ["subscribe", "publish"]);
  } catch (error) {
    console.error("Friend realtime chat channel error", error);
  }

  if (process.env.NODE_ENV !== "production") {
    const wildcardChannel = `${CHAT_CONSTANTS.DIRECT_PREFIX}:*`;
    grantCapability(capabilities, wildcardChannel, ["publish"]);
  }

  try {
    const friendIds = await getCachedFriendIds(userId);
    console.log("Realtime chat capabilities", {
      userId,
      friendIds,
      capabilitiesBeforeFriends: { ...capabilities },
    });
    friendIds.forEach((friendId) => {
      try {
        grantCapability(capabilities, getChatDirectChannel(friendId), ["publish"]);
      } catch (friendError) {
        console.error("Friend realtime friend channel error", friendError);
      }
    });
    console.log("Realtime chat capabilities", { userId, capabilitiesAfterFriends: capabilities });
  } catch (listError) {
    console.error("Friend realtime friend list error", listError);
  }

  try {
    return await authProvider.createAuth({ userId, capabilities });
  } catch (error) {
    console.error("Friend realtime auth error", error);
    throw error;
  }
}
