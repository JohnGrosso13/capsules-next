export type RealtimeEvent = {
  name: string;
  data: unknown;
};

export type PresenceAction = "enter" | "leave" | "update" | "present" | "absent";

export type PresenceMember = {
  clientId: string;
  data: unknown;
  action?: PresenceAction;
};

export type RealtimeAuthPayload = {
  provider: string;
  token: unknown;
  environment?: string | null;
};

export type RealtimeSubscribeOptions = {
  params?: Record<string, string>;
};

export type RealtimeCapabilities = Record<string, string[]>;

export interface RealtimePublisher {
  publish(channel: string, name: string, payload: unknown): Promise<void>;
}

export interface RealtimeAuthProvider {
  createAuth(params: {
    userId: string;
    capabilities: RealtimeCapabilities;
  }): Promise<RealtimeAuthPayload | null>;
}

export interface RealtimePresenceChannel {
  subscribe(handler: (member: PresenceMember) => void): Promise<() => void>;
  getMembers(): Promise<PresenceMember[]>;
  enter(data: unknown): Promise<void>;
  update(data: unknown): Promise<void>;
  leave(): Promise<void>;
}

export interface RealtimeClient {
  subscribe(
    channel: string,
    handler: (event: RealtimeEvent) => void,
    options?: RealtimeSubscribeOptions,
  ): Promise<() => void>;
  publish(channel: string, name: string, payload: unknown): Promise<void>;
  presence(channel: string): RealtimePresenceChannel;
  clientId(): string | null;
  close(): Promise<void>;
}

export interface RealtimeClientFactory {
  getClient(fetchAuth: () => Promise<RealtimeAuthPayload>): Promise<RealtimeClient>;
  release(client: RealtimeClient): Promise<void> | void;
  reset(): void;
}
