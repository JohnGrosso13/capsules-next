import "server-only";

import Ably from "ably";

import { serverEnv } from "@/lib/env/server";

type TokenRequest = Ably.Types.TokenRequest;

let restClient: Ably.Rest | null = null;

const FRIEND_CHANNEL_PREFIX = "user";
export const FRIEND_EVENTS_NAMESPACE = "friends";
export const PRESENCE_CHANNEL = "presence:friends";

export type FriendRealtimeEvent = { type: string; payload: Record<string, unknown> };

function getRestClient(): Ably.Rest | null {
  if (!serverEnv.ABLY_API_KEY) return null;
  if (!restClient) {
    restClient = new Ably.Rest({
      key: serverEnv.ABLY_API_KEY,
      environment: serverEnv.ABLY_ENVIRONMENT ?? undefined,
    });
  }
  return restClient;
}

function channelNameForUser(userId: string): string {
  return `${FRIEND_CHANNEL_PREFIX}:${userId}:${FRIEND_EVENTS_NAMESPACE}`;
}

export async function publishFriendEvent(userId: string, event: FriendRealtimeEvent): Promise<void> {
  const rest = getRestClient();
  if (!rest) return;
  try {
    await rest.channels.get(channelNameForUser(userId)).publish(event.type, event.payload);
  } catch (error) {
    console.error("Ably publish error", { userId, type: event.type, error });
  }
}

export async function publishFriendEvents(events: Array<{ userId: string; event: FriendRealtimeEvent }>): Promise<void> {
  const rest = getRestClient();
  if (!rest) return;
  await Promise.all(
    events.map(async ({ userId, event }) => {
      try {
        await rest.channels.get(channelNameForUser(userId)).publish(event.type, event.payload);
      } catch (error) {
        console.error("Ably publish error", { userId, type: event.type, error });
      }
    }),
  );
}

export async function createRealtimeToken(userId: string): Promise<TokenRequest | null> {
  const rest = getRestClient();
  if (!rest) return null;
  const capability = {
    [channelNameForUser(userId)]: ["subscribe"],
    [PRESENCE_CHANNEL]: ["subscribe", "publish", "presence"],
  };
  const tokenParams: Ably.Types.TokenParams = {
    clientId: userId,
    ttl: 1000 * 60 * 60,
    capability: JSON.stringify(capability),
  };
  return new Promise((resolve, reject) => {
    rest!.auth.createTokenRequest(tokenParams, (err, tokenRequest) => {
      if (err) {
        console.error("Ably token error", err);
        reject(err);
        return;
      }
      resolve(tokenRequest ?? null);
    });
  });
}
