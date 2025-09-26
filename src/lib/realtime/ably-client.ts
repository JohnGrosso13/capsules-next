"use client";

import * as Ably from "ably/promises";

export type TokenResponse = {
  tokenRequest: Ably.Types.TokenRequest;
  environment?: string | null;
};

let clientPromise: Promise<Ably.RealtimePromise> | null = null;

export function getRealtimeClient(fetchToken: () => Promise<TokenResponse>): Promise<Ably.RealtimePromise> {
  if (!clientPromise) {
    clientPromise = (async () => {
      const initial = await fetchToken();
      const options: Ably.Types.ClientOptions = {
        environment: initial.environment ?? undefined,
        authCallback: async (_, callback) => {
          try {
            const next = await fetchToken();
            callback(null, next.tokenRequest);
          } catch (error) {
            callback(error as Error);
          }
        },
      };
      const realtime = new Ably.Realtime.Promise(options);
      try {
        await realtime.auth.authorize(initial.tokenRequest);
      } catch (error) {
        console.error("Ably authorize error", error);
      }
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
