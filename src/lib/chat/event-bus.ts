"use client";

import type { RealtimeEnvelope } from "@/lib/realtime/envelope";
import type {
  RealtimeAuthPayload,
  RealtimeClient,
  RealtimeClientFactory,
  RealtimeEvent,
  RealtimeSubscribeOptions,
} from "@/ports/realtime";

type ChatEventBusConnectOptions = {
  envelope: RealtimeEnvelope;
  factory: RealtimeClientFactory;
  requestToken: (envelope: RealtimeEnvelope) => Promise<RealtimeAuthPayload>;
  subscribeOptions?: RealtimeSubscribeOptions | undefined;
  channelResolver: (clientId: string) => string;
};

export type ChatEventHandler = (event: RealtimeEvent) => void;

export type ChatEventBusConnection = {
  clientId: string;
  channelName: string;
};

export class RealtimeChatEventBus {
  private client: RealtimeClient | null = null;
  private factory: RealtimeClientFactory | null = null;
  private unsubscribe: (() => void) | null = null;
  private options: ChatEventBusConnectOptions | null = null;

  async connect(
    options: ChatEventBusConnectOptions,
    handler: ChatEventHandler,
  ): Promise<ChatEventBusConnection> {
    await this.disconnect();
    this.options = options;
    const client = await options.factory.getClient(() => options.requestToken(options.envelope));
    const clientId = client.clientId();
    if (!clientId) {
      await options.factory.release(client);
      throw new Error("chat.event_bus.missing_client_id");
    }
    const channelName = options.channelResolver(clientId);
    const cleanup = await client.subscribe(channelName, handler, options.subscribeOptions);
    this.client = client;
    this.factory = options.factory;
    this.unsubscribe = cleanup;
    return { clientId, channelName };
  }

  async disconnect(): Promise<void> {
    if (this.unsubscribe) {
      try {
        this.unsubscribe();
      } catch {
        // ignore subscription cleanup failures
      }
      this.unsubscribe = null;
    }
    if (this.client) {
      if (this.factory) {
        await Promise.resolve(this.factory.release(this.client));
      } else {
        await this.client.close();
      }
    }
    this.client = null;
    this.factory = null;
    this.options = null;
  }

  async publishToChannels(
    channels: Iterable<string>,
    event: string,
    payload: unknown,
  ): Promise<void> {
    if (!this.client) return;
    const publishJobs = Array.from(channels).map((channel) =>
      this.client!.publish(channel, event, payload),
    );
    await Promise.all(publishJobs);
  }

  getClientId(): string | null {
    return this.client?.clientId() ?? null;
  }
}
