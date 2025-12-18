import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

import type { RealtimeAuthPayload } from "@/ports/realtime";

const mockAbly = vi.hoisted(() => {
  const state = { lastClient: null as { clientId: string | null; connection: MockConnection } | null };

  class MockConnection {
    state = "connecting";
    private readonly listeners = new Set<(state: { current: string }) => void>();
    constructor(private readonly owner: { clientId: string | null }) {}

    on = (listener: (state: { current: string }) => void) => {
      this.listeners.add(listener);
    };

    off = (listener: (state: { current: string }) => void) => {
      this.listeners.delete(listener);
    };

    emit = (state: string) => {
      this.state = state;
      if (state === "connected" && !this.owner.clientId) {
        this.owner.clientId = "client-test";
      }
      this.listeners.forEach((listener) => listener({ current: state }));
    };
  }

  class MockRealtime {
    clientId: string | null = null;
    auth = { clientId: null as string | null };
    connection: MockConnection;
    channels = { get: () => ({}) };
    close = vi.fn().mockResolvedValue(undefined);

    constructor(_options: unknown) {
      this.connection = new MockConnection(this);
      state.lastClient = this;
    }
  }

  return { state, MockRealtime, MockConnection };
});

vi.mock("ably", () => ({
  Realtime: mockAbly.MockRealtime,
}));

const fetchAuth = vi.fn(async (): Promise<RealtimeAuthPayload> => ({
  provider: "ably",
  token: { token: "test-token", expires: Date.now() + 60_000 },
  environment: null,
}));

const getLastClient = () => mockAbly.state.lastClient;
const waitForClient = async () => {
  for (let i = 0; i < 5; i += 1) {
    const client = getLastClient();
    if (client) return client;
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  throw new Error("Mock Ably client not created");
};

describe("Ably realtime client", () => {
  beforeEach(() => {
    fetchAuth.mockClear();
    mockAbly.state.lastClient = null;
  });

  afterEach(async () => {
    const { getAblyRealtimeClientFactory } = await import("@/adapters/realtime/ably/client");
    getAblyRealtimeClientFactory().reset();
  });

  it("waits for connected state before resolving", async () => {
    const { getAblyRealtimeClientFactory } = await import("@/adapters/realtime/ably/client");
    const factory = getAblyRealtimeClientFactory();

    const clientPromise = factory.getClient(fetchAuth);
    const client = await waitForClient();
    client.connection.emit("connected");

    const resolved = await clientPromise;
    expect(resolved.clientId()).toBe("client-test");
  });

  it("rejects when the connection fails", async () => {
    const { getAblyRealtimeClientFactory } = await import("@/adapters/realtime/ably/client");
    const factory = getAblyRealtimeClientFactory();

    const clientPromise = factory.getClient(fetchAuth);
    const client = await waitForClient();
    client.connection.emit("failed");

    await expect(clientPromise).rejects.toThrow("Ably connection failed");
  });
});
