import "server-only";

import { getRealtimeAuthProvider, getRealtimePublisher } from "@/config/realtime-server";
import type { RealtimeAuthPayload, RealtimeCapabilities } from "@/ports/realtime";

export const FRIEND_CHANNEL_PREFIX = "user";
export const FRIEND_EVENTS_NAMESPACE = "friends";
export const FRIEND_PRESENCE_CHANNEL = "presence:friends";

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
    return await authProvider.createAuth({ userId, capabilities });
  } catch (error) {
    console.error("Friend realtime auth error", error);
    throw error;
  }
}
