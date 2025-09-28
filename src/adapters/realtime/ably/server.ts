import "server-only";

import Ably from "ably";

import { serverEnv } from "@/lib/env/server";
import type {
  RealtimeAuthPayload,
  RealtimeAuthProvider,
  RealtimeCapabilities,
  RealtimePublisher,
} from "@/ports/realtime";

let restClient: Ably.Rest | null = null;
let initFailed = false;

function ensureRestClient(): Ably.Rest | null {
  if (initFailed) return null;
  if (!serverEnv.ABLY_API_KEY) {
    initFailed = true;
    return null;
  }
  if (!restClient) {
    try {
      const options: Ably.Types.ClientOptions = { key: serverEnv.ABLY_API_KEY };
      if (serverEnv.ABLY_ENVIRONMENT) {
        options.environment = serverEnv.ABLY_ENVIRONMENT;
      }
      restClient = new Ably.Rest(options);
    } catch (error) {
      initFailed = true;
      console.error("Ably REST initialization failed", error);
      return null;
    }
  }
  return restClient;
}

class AblyPublisher implements RealtimePublisher {
  async publish(channel: string, name: string, payload: unknown): Promise<void> {
    const client = ensureRestClient();
    if (!client) return;
    try {
      await client.channels.get(channel).publish(name, payload);
    } catch (error) {
      console.error("Ably publish error", { channel, name, error });
    }
  }
}

class AblyAuthProvider implements RealtimeAuthProvider {
  async createAuth({
    userId,
    capabilities,
  }: {
    userId: string;
    capabilities: RealtimeCapabilities;
  }): Promise<RealtimeAuthPayload | null> {
    const client = ensureRestClient();
    if (!client) return null;
    const filteredCapabilities = Object.fromEntries(
      Object.entries(capabilities).filter(([channel]) => Boolean(channel)),
    );
    const tokenParams: Ably.Types.TokenParams = {
      clientId: userId,
      ttl: 1000 * 60 * 60,
      capability: JSON.stringify(filteredCapabilities),
    };
    return new Promise<RealtimeAuthPayload | null>((resolve, reject) => {
      client.auth.createTokenRequest(tokenParams, (err, tokenRequest) => {
        if (err) {
          console.error("Ably token error", err);
          reject(err);
          return;
        }
        if (!tokenRequest) {
          resolve(null);
          return;
        }
        resolve({
          provider: "ably",
          token: tokenRequest,
          environment: serverEnv.ABLY_ENVIRONMENT ?? null,
        });
      });
    });
  }
}

const publisherInstance = new AblyPublisher();
const authProviderInstance = new AblyAuthProvider();

export function getAblyRealtimePublisher(): RealtimePublisher {
  return publisherInstance;
}

export function getAblyRealtimeAuthProvider(): RealtimeAuthProvider {
  return authProviderInstance;
}
