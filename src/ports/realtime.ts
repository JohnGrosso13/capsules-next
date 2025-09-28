export type RealtimeEvent = {
  name: string;
  data: unknown;
};

export type PresenceMember = {
  clientId: string;
  data: unknown;
};

export type RealtimeAuthPayload = {
  provider: string;
  token: unknown;
  environment?: string | null;
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
  subscribe(channel: string, handler: (event: RealtimeEvent) => void): Promise<() => void>;
  presence(channel: string): RealtimePresenceChannel;
  clientId(): string | null;
  close(): Promise<void>;
}

export interface RealtimeClientFactory {
  getClient(fetchAuth: () => Promise<RealtimeAuthPayload>): Promise<RealtimeClient>;
  reset(): void;
}
