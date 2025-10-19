import "server-only";

import Mux from "@mux/mux-node";
import type { Asset } from "@mux/mux-node/resources/video/assets";
import type {
  LiveStream,
  LiveStreamCreateParams,
  LiveStreamUpdateParams,
} from "@mux/mux-node/resources/video/live-streams";
import type { Webhooks as MuxWebhookTypes } from "@mux/mux-node/resources/webhooks";
import { APIError, NotFoundError } from "@mux/mux-node/error";

import { serverEnv } from "@/lib/env/server";

type MuxClientCache = {
  mux: Mux;
  tokenId: string;
  tokenSecret: string;
  webhookSecret: string | null;
};

let cachedClient: MuxClientCache | null = null;

const MUX_PLAYBACK_HOSTS: Record<string, string> = {
  production: "https://stream.mux.com",
  staging: "https://stream-staging.mux.com",
  test: "https://stream.mux.com",
};

function resolvePlaybackHost(environment: string | null | undefined): string {
  if (typeof environment !== "string") {
    return MUX_PLAYBACK_HOSTS.production;
  }
  const normalized = environment.trim().toLowerCase();
  const host = MUX_PLAYBACK_HOSTS[normalized];
  return host ?? MUX_PLAYBACK_HOSTS.production;
}

function requireMuxCredentials(): {
  tokenId: string;
  tokenSecret: string;
  webhookSecret: string | null;
} {
  const tokenId = serverEnv.MUX_TOKEN_ID?.trim();
  const tokenSecret = serverEnv.MUX_TOKEN_SECRET?.trim();
  const webhookSecret = serverEnv.MUX_WEBHOOK_SECRET?.trim() ?? null;

  if (!tokenId || !tokenSecret) {
    throw new Error(
      "Mux credentials are not configured. Set MUX_TOKEN_ID and MUX_TOKEN_SECRET to enable streaming.",
    );
  }

  return { tokenId, tokenSecret, webhookSecret };
}

function getMuxClient(): MuxClientCache {
  const { tokenId, tokenSecret, webhookSecret } = requireMuxCredentials();

  if (
    cachedClient &&
    cachedClient.tokenId === tokenId &&
    cachedClient.tokenSecret === tokenSecret &&
    cachedClient.webhookSecret === webhookSecret
  ) {
    return cachedClient;
  }

  const options: ConstructorParameters<typeof Mux>[0] = {
    tokenId,
    tokenSecret,
  };
  if (webhookSecret) {
    options.webhookSecret = webhookSecret;
  }

  const mux = new Mux(options);
  cachedClient = { mux, tokenId, tokenSecret, webhookSecret };
  return cachedClient;
}

export function buildMuxPlaybackUrl(
  playbackId: string | null | undefined,
  options: { extension?: "m3u8" | "mp4"; environment?: string | null } = {},
): string | null {
  if (!playbackId) return null;
  const extension = options.extension ?? "m3u8";
  const host = resolvePlaybackHost(options.environment ?? serverEnv.MUX_ENVIRONMENT);
  return `${host.replace(/\/$/, "")}/${playbackId}.${extension}`;
}

export function muxVideoClient() {
  return getMuxClient().mux.video;
}

export function muxWebhookSecret(): string | null {
  return getMuxClient().webhookSecret;
}

export async function createMuxLiveStream(
  params: LiveStreamCreateParams,
): Promise<LiveStream> {
  const client = muxVideoClient();
  return client.liveStreams.create(params);
}

export async function fetchMuxLiveStream(id: string): Promise<LiveStream> {
  const client = muxVideoClient();
  return client.liveStreams.retrieve(id);
}

export async function updateMuxLiveStream(
  id: string,
  params: LiveStreamUpdateParams,
): Promise<LiveStream> {
  const client = muxVideoClient();
  return client.liveStreams.update(id, params);
}

export async function deleteMuxLiveStream(id: string): Promise<void> {
  const client = muxVideoClient();
  await client.liveStreams.delete(id);
}

export async function resetMuxStreamKey(id: string): Promise<LiveStream> {
  const client = muxVideoClient();
  return client.liveStreams.resetStreamKey(id);
}

export async function createMuxPlaybackId(
  liveStreamId: string,
  policy: "public" | "signed" | "drm" = "public",
) {
  const client = muxVideoClient();
  return client.liveStreams.createPlaybackId(liveStreamId, { policy });
}

export async function fetchMuxAsset(id: string): Promise<Asset> {
  const client = muxVideoClient();
  return client.assets.retrieve(id);
}

export function getMuxErrorStatus(error: unknown): number | null {
  if (error instanceof APIError) {
    return error.status ?? null;
  }
  return null;
}

export function isMuxNotFoundError(error: unknown): boolean {
  return error instanceof NotFoundError || getMuxErrorStatus(error) === 404;
}

export type MuxWebhookEvent = MuxWebhookTypes.UnwrapWebhookEvent;

export function unwrapMuxWebhookEvent(
  body: string,
  headers: Headers | Record<string, string | string[] | undefined>,
): MuxWebhookEvent {
  const { mux } = getMuxClient();
  const webhookSecret = muxWebhookSecret();
  if (!webhookSecret) {
    throw new Error("Mux webhook secret is not configured.");
  }
  return mux.webhooks.unwrap(body, headers, webhookSecret);
}

export function safeUnwrapMuxWebhookEvent(
  body: string,
  headers: Headers | Record<string, string | string[] | undefined>,
): MuxWebhookEvent | null {
  try {
    return unwrapMuxWebhookEvent(body, headers);
  } catch (error) {
    console.warn("Failed to verify Mux webhook", error);
    return null;
  }
}

export function muxWebhookObjectId(event: MuxWebhookEvent): string | null {
  const objectPayload = event?.object;
  if (!objectPayload || typeof objectPayload !== "object") return null;
  const candidate = (objectPayload as { id?: unknown }).id;
  return typeof candidate === "string" ? candidate : null;
}

export function muxAttemptSequence(event: MuxWebhookEvent): number | null {
  if (!Array.isArray(event.attempts)) return null;
  if (event.attempts.length === 0) return 0;
  const attempt = event.attempts.at(-1);
  if (attempt && typeof attempt?.max_attempts === "number" && attempt.max_attempts > 0) {
    return Math.min(event.attempts.length, attempt.max_attempts);
  }
  return event.attempts.length;
}

export { type LiveStream as MuxLiveStream, type Asset as MuxAsset };
