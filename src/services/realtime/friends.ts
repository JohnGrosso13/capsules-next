import "server-only";

import { getRealtimeAuthProvider, getRealtimePublisher } from "@/config/realtime-server";
import { getChatDirectChannel } from "@/lib/chat/channels";
import { listFriendUserIds } from "@/server/friends/repository";
import type { RealtimeAuthPayload, RealtimeCapabilities } from "@/ports/realtime";

export const FRIEND_CHANNEL_PREFIX = "user";
export const FRIEND_EVENTS_NAMESPACE = "friends";
export const FRIEND_PRESENCE_CHANNEL = "presence:friends";

function grantCapability(capabilities: RealtimeCapabilities, channel: string, operations: string[]): void {
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

export async function createFriendRealtimeAuth(userId: string): Promise<RealtimeAuthPayload | null> {
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

  try {
    const friendIds = await listFriendUserIds(userId);
    console.log("Realtime chat capabilities", { userId, friendIds, capabilitiesBeforeFriends: { ...capabilities } });
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
