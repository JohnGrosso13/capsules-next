import "server-only";

import { getRealtimeAuthProvider, getRealtimePublisher } from "@/config/realtime-server";
import { getChatDirectChannel, CHAT_CONSTANTS } from "@/lib/chat/channels";
import { listFriendUserIds } from "@/server/friends/repository";
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

const FRIEND_ID_CACHE_TTL_MS = 60 * 1000;
const FRIEND_ID_CACHE_ERROR_TTL_MS = 10 * 1000;
const friendIdCache = new Map<string, FriendIdCacheEntry>();
const friendIdFetches = new Map<string, Promise<string[]>>();

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

async function getCachedFriendIds(userId: string): Promise<string[]> {
  const now = Date.now();
  const cached = friendIdCache.get(userId);
  if (cached && cached.expiresAt > now) {
    return cached.value;
  }

  const pending = friendIdFetches.get(userId);
  if (pending) {
    if (cached) {
      return cached.value;
    }
    return pending;
  }

  const fetchPromise = listFriendUserIds(userId)
    .then((ids) => {
      friendIdFetches.delete(userId);
      friendIdCache.set(userId, { value: ids, expiresAt: Date.now() + FRIEND_ID_CACHE_TTL_MS });
      return ids;
    })
    .catch((error) => {
      friendIdFetches.delete(userId);
      if (cached) {
        friendIdCache.set(userId, {
          value: cached.value,
          expiresAt: Date.now() + FRIEND_ID_CACHE_ERROR_TTL_MS,
        });
        return cached.value;
      }
      throw error;
    });

  friendIdFetches.set(userId, fetchPromise);

  if (cached) {
    return cached.value;
  }

  return fetchPromise;
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
