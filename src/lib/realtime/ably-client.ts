"use client";

import * as Ably from "ably/promises";

export type TokenResponse = {
  tokenRequest: Ably.Types.TokenRequest;
  environment?: string | null;
};

let clientPromise: Promise<Ably.Realtime> | null = null;

export function getRealtimeClient(
  fetchToken: () => Promise<TokenResponse>,
): Promise<Ably.Realtime> {
  if (!clientPromise) {
    clientPromise = (async () => {
      const initial = await fetchToken();
      const options: Ably.Types.ClientOptions = {
        authCallback: async (_, callback) => {
          try {
            const next = await fetchToken();
            callback(null, next.tokenRequest);
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            callback(message, null);
          }
        },
      };
      if (initial.environment) {
        options.environment = initial.environment;
      }
      const createRealtime = Ably.Realtime as unknown as (
        options: Ably.Types.ClientOptions,
      ) => unknown;
      const realtime = createRealtime(options) as Ably.Realtime;
      return realtime;
    })();
  }
  return clientPromise;
}

export function resetRealtimeClient() {
  if (clientPromise) {
    clientPromise.then((client) => {
      try {
        client.close();
      } catch (error) {
        console.error("Ably close error", error);
      }
    });
  }
  clientPromise = null;
}
