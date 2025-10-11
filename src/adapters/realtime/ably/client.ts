"use client";

import * as Ably from "ably/promises";
import type { Types as AblyTypes } from "ably";

import type {
  PresenceAction,
  PresenceMember,
  RealtimeAuthPayload,
  RealtimeClient,
  RealtimeClientFactory,
  RealtimeEvent,
  RealtimePresenceChannel,
} from "@/ports/realtime";

const PRESENCE_ACTION_MAP: Record<number | string, PresenceAction> = {
  0: "absent",
  1: "present",
  2: "enter",
  3: "leave",
  4: "update",
  absent: "absent",
  present: "present",
  enter: "enter",
  leave: "leave",
  update: "update",
};

function mapPresenceAction(
  action: AblyTypes.PresenceAction | undefined,
): PresenceAction | undefined {
  if (typeof action === "number") {
    return PRESENCE_ACTION_MAP[action];
  }
  if (typeof action === "string") {
    return PRESENCE_ACTION_MAP[action.toLowerCase()];
  }
  return undefined;
}

function assertAblyAuth(payload: RealtimeAuthPayload): {
  tokenRequest: AblyTypes.TokenRequest;
  environment?: string | null;
} {
  if (!payload || payload.provider !== "ably") {
    throw new Error("Realtime auth payload is not for Ably");
  }
  return {
    tokenRequest: payload.token as AblyTypes.TokenRequest,
    environment: payload.environment ?? null,
  };
}

class AblyPresenceChannel implements RealtimePresenceChannel {
  constructor(private readonly channel: AblyTypes.RealtimeChannelPromise) {}

  async subscribe(handler: (member: PresenceMember) => void): Promise<() => void> {
    const listener = (message: AblyTypes.PresenceMessage) => {
      const base: PresenceMember = {
        clientId: message.clientId ? String(message.clientId) : "",
        data: message.data,
      };
      const action = mapPresenceAction(message.action);
      if (action) {
        (base as PresenceMember).action = action;
      }
      handler(base);
    };
    await this.channel.presence.subscribe(listener);
    return async () => {
      try {
        await this.channel.presence.unsubscribe(listener);
      } catch (error) {
        console.error("Ably presence unsubscribe error", error);
      }
    };
  }

  async getMembers(): Promise<PresenceMember[]> {
    try {
      const members = await this.channel.presence.get();
      return members.map((member) => {
        const base: PresenceMember = {
          clientId: member.clientId ? String(member.clientId) : "",
          data: member.data,
        };
        const action = mapPresenceAction(member.action);
        if (action) {
          (base as PresenceMember).action = action;
        }
        return base;
      });
    } catch (error) {
      console.error("Ably presence get error", error);
      return [];
    }
  }

  async enter(data: unknown): Promise<void> {
    await this.channel.presence.enter(data);
  }

  async update(data: unknown): Promise<void> {
    await this.channel.presence.update(data);
  }

  async leave(): Promise<void> {
    await this.channel.presence.leave();
  }
}

class AblyRealtimeConnection implements RealtimeClient {
  constructor(private readonly client: AblyTypes.RealtimePromise) {}

  async subscribe(
    channelName: string,
    handler: (event: RealtimeEvent) => void,
  ): Promise<() => void> {
    const channel = this.client.channels.get(channelName);
    const listener = (message: AblyTypes.Message) => {
      handler({
        name: message.name ?? "",
        data: message.data,
      });
    };
    await channel.subscribe(listener);
    return async () => {
      try {
        await channel.unsubscribe(listener);
      } catch (error) {
        console.error("Ably unsubscribe error", error);
      }
    };
  }
  async publish(channelName: string, name: string, payload: unknown): Promise<void> {
    const channel = this.client.channels.get(channelName);
    try {
      await channel.publish(name, payload);
    } catch (error) {
      console.error("Ably publish error", error);
      throw error;
    }
  }

  presence(channelName: string): RealtimePresenceChannel {
    const channel = this.client.channels.get(channelName);
    return new AblyPresenceChannel(channel);
  }

  clientId(): string | null {
    const id = this.client.auth.clientId;
    return id ? String(id) : null;
  }

  async close(): Promise<void> {
    try {
      await this.client.close();
    } catch (error) {
      console.error("Ably close error", error);
    }
  }
}

class AblyRealtimeClientFactory implements RealtimeClientFactory {
  private clientPromise: Promise<AblyRealtimeConnection> | null = null;
  private activeConnection: AblyRealtimeConnection | null = null;
  private refCount = 0;
  private fetchAuth: (() => Promise<RealtimeAuthPayload>) | null = null;

  private async createClient(): Promise<AblyRealtimeConnection> {
    if (!this.fetchAuth) {
      throw new Error("Ably auth provider is not configured");
    }
    const initial = assertAblyAuth(await this.fetchAuth());
    const options: Ably.Types.ClientOptions = {
      authCallback: async (_, callback) => {
        try {
          const fetchAuth = this.fetchAuth;
          if (!fetchAuth) {
            throw new Error("Ably auth provider is not configured");
          }
          const next = assertAblyAuth(await fetchAuth());
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
    ) => AblyTypes.RealtimePromise;
    const client = createRealtime(options);
    await client.connection.once("connected");
    const connection = new AblyRealtimeConnection(client);
    this.activeConnection = connection;
    return connection;
  }

  async getClient(fetchAuth: () => Promise<RealtimeAuthPayload>): Promise<RealtimeClient> {
    this.fetchAuth = fetchAuth;
    if (!this.clientPromise) {
      this.clientPromise = this.createClient().catch((error) => {
        this.activeConnection = null;
        this.clientPromise = null;
        throw error;
      });
    }
    const connection = await this.clientPromise.catch((error) => {
      this.activeConnection = null;
      this.clientPromise = null;
      throw error;
    });
    this.refCount += 1;
    return connection;
  }

  async release(_client: RealtimeClient): Promise<void> {
    if (!this.clientPromise) return;
    this.refCount = Math.max(0, this.refCount - 1);
    if (this.refCount > 0) {
      return;
    }
    const connection = this.activeConnection;
    if (connection) {
      try {
        await connection.close();
      } catch (error) {
        console.error("Ably release close error", error);
      }
    }
    this.clientPromise = null;
    this.activeConnection = null;
    this.fetchAuth = null;
    this.refCount = 0;
  }

  reset(): void {
    const connection = this.activeConnection;
    if (connection) {
      connection.close().catch((error) => {
        console.error("Ably reset close error", error);
      });
    }
    this.clientPromise = null;
    this.activeConnection = null;
    this.fetchAuth = null;
    this.refCount = 0;
  }
}

const factoryInstance = new AblyRealtimeClientFactory();

export function getAblyRealtimeClientFactory(): RealtimeClientFactory {
  return factoryInstance;
}
