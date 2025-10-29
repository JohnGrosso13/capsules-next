import "server-only";

import {
  AccessToken,
  RoomServiceClient,
  type AccessTokenOptions,
  type ParticipantInfo,
  type VideoGrant,
} from "livekit-server-sdk";

export type LivekitConfig = {
  serviceUrl: string;
  publishUrl: string;
  apiKey: string;
  apiSecret: string;
};

export type LivekitRoomOptions = {
  name: string;
  metadata?: unknown;
  maxParticipants?: number;
  emptyTimeout?: number;
  departureTimeout?: number;
};

export type LivekitRoomSnapshot = {
  name: string;
  metadata: string | null;
};

export type LivekitVideoGrant = {
  room?: string;
  roomJoin?: boolean;
  roomAdmin?: boolean;
  canPublish?: boolean;
  canPublishData?: boolean;
  canSubscribe?: boolean;
};

export type LivekitAccessTokenOptions = {
  identity: string;
  roomName: string;
  metadata?: unknown;
  ttlSeconds?: number;
  displayName?: string | null;
  grant: LivekitVideoGrant;
};

export type LivekitIssuedToken = {
  token: string;
  expiresAt: string;
  livekitUrl: string;
};

export const DEFAULT_LIVEKIT_TOKEN_TTL_SECONDS = 60 * 60 * 2; // 2 hours

let cachedRoomServiceClient: RoomServiceClient | null = null;

function normalizeServiceUrl(url: string): string {
  if (url.startsWith("ws")) {
    return url.replace(/^ws/, "http");
  }
  if (url.startsWith("wss")) {
    return url.replace(/^wss/, "https");
  }
  return url;
}

function requireLivekitConfig(): LivekitConfig {
  const publishUrl = process.env.NEXT_PUBLIC_LIVEKIT_URL?.trim();
  const serviceUrl = process.env.LIVEKIT_URL?.trim() ?? publishUrl;
  const apiKey = process.env.LIVEKIT_API_KEY?.trim();
  const apiSecret = process.env.LIVEKIT_API_SECRET?.trim();

  if (!publishUrl || !serviceUrl || !apiKey || !apiSecret) {
    throw new Error(
      "LiveKit is not fully configured. Please set NEXT_PUBLIC_LIVEKIT_URL, LIVEKIT_API_KEY, and LIVEKIT_API_SECRET.",
    );
  }

  return {
    publishUrl,
    serviceUrl: normalizeServiceUrl(serviceUrl),
    apiKey,
    apiSecret,
  };
}

function getRoomServiceClient(): RoomServiceClient {
  const config = requireLivekitConfig();
  if (cachedRoomServiceClient) {
    return cachedRoomServiceClient;
  }
  cachedRoomServiceClient = new RoomServiceClient(
    config.serviceUrl,
    config.apiKey,
    config.apiSecret,
  );
  return cachedRoomServiceClient;
}

function serializeMetadata(metadata: unknown): string | undefined {
  if (metadata === null || metadata === undefined) return undefined;
  if (typeof metadata === "string") return metadata;
  try {
    return JSON.stringify(metadata);
  } catch (error) {
    console.warn("Failed to serialize LiveKit metadata", error);
    return undefined;
  }
}

export function getLivekitErrorCode(error: unknown): string | null {
  if (!error || typeof error !== "object") return null;
  if ("code" in error && typeof (error as { code?: unknown }).code === "string") {
    return (error as { code?: string }).code ?? null;
  }
  if ("status" in error && (error as { status?: unknown }).status === 404) {
    return "not_found";
  }
  return null;
}

export async function ensureLivekitRoom(options: LivekitRoomOptions): Promise<void> {
  const client = getRoomServiceClient();
  const metadata = serializeMetadata(options.metadata);
  const roomConfig: Parameters<RoomServiceClient["createRoom"]>[0] = {
    name: options.name,
  };
  if (metadata !== undefined) {
    roomConfig.metadata = metadata;
  }
  if (typeof options.maxParticipants === "number") {
    roomConfig.maxParticipants = options.maxParticipants;
  }
  if (typeof options.emptyTimeout === "number") {
    roomConfig.emptyTimeout = options.emptyTimeout;
  }
  if (typeof options.departureTimeout === "number") {
    roomConfig.departureTimeout = options.departureTimeout;
  }
  await client.createRoom(roomConfig);
}

export async function updateLivekitRoomMetadata(name: string, metadata: unknown): Promise<void> {
  const client = getRoomServiceClient();
  const serialized = serializeMetadata(metadata);
  if (serialized === undefined) {
    throw new Error("Unable to serialize LiveKit room metadata for update.");
  }
  await client.updateRoomMetadata(name, serialized);
}

export async function fetchLivekitRoom(name: string): Promise<LivekitRoomSnapshot | null> {
  const client = getRoomServiceClient();
  const [room] = await client.listRooms([name]);
  if (!room) {
    return null;
  }
  return {
    name: room.name ?? name,
    metadata: room.metadata ?? null,
  };
}

export async function deleteLivekitRoom(name: string): Promise<void> {
  const client = getRoomServiceClient();
  await client.deleteRoom(name);
}

export async function listLivekitRoomParticipants(name: string): Promise<ParticipantInfo[]> {
  const client = getRoomServiceClient();
  return client.listParticipants(name);
}

export async function issueLivekitAccessToken(
  options: LivekitAccessTokenOptions,
): Promise<LivekitIssuedToken> {
  const config = requireLivekitConfig();
  const ttlSeconds = options.ttlSeconds ?? DEFAULT_LIVEKIT_TOKEN_TTL_SECONDS;

  const tokenOptions: AccessTokenOptions = {
    identity: options.identity,
    ttl: ttlSeconds,
  };

  const metadata = serializeMetadata(options.metadata);
  if (metadata) {
    tokenOptions.metadata = metadata;
  }

  if (options.displayName && options.displayName.trim()) {
    tokenOptions.name = options.displayName.trim();
  }

  const token = new AccessToken(config.apiKey, config.apiSecret, tokenOptions);

  const grant: VideoGrant = {
    ...options.grant,
    room: options.grant.room ?? options.roomName,
  };

  token.addGrant(grant);

  const jwt = await token.toJwt();
  const expiresAt = new Date(Date.now() + ttlSeconds * 1000).toISOString();

  return {
    token: jwt,
    expiresAt,
    livekitUrl: config.publishUrl,
  };
}
