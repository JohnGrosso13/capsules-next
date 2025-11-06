import {
  createAblyTokenRequest,
  publishAblyMessage,
  resetAblyRestConfig,
} from "@/adapters/realtime/ably/rest";
import type {
  RealtimeAuthPayload,
  RealtimeAuthProvider,
  RealtimeCapabilities,
  RealtimePublisher,
} from "@/ports/realtime";

class AblyPublisher implements RealtimePublisher {
  async publish(channel: string, name: string, payload: unknown): Promise<void> {
    await publishAblyMessage(channel, name, payload);
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
    const filteredCapabilities = Object.fromEntries(
      Object.entries(capabilities).filter(([channel]) => Boolean(channel)),
    );
    const capabilityJson = JSON.stringify(filteredCapabilities);
    const token = await createAblyTokenRequest({
      clientId: userId,
      ttl: 1000 * 60 * 60,
      capability: capabilityJson,
    });
    if (!token) return null;
    return {
      provider: "ably",
      token: token.token,
      environment: token.environment ?? null,
    };
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

export function resetAblyRealtimeAdapter(): void {
  resetAblyRestConfig();
}
