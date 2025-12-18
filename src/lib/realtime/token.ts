import type { RealtimeAuthPayload } from "@/ports/realtime";
import type { RealtimeEnvelope } from "./envelope";

type TokenCacheEntry = {
  promise: Promise<RealtimeAuthPayload> | null;
  payload: RealtimeAuthPayload | null;
  expiresAt: number;
};

const tokenCache = new Map<string, TokenCacheEntry>();
const CACHE_FALLBACK_MS = 50 * 60_000; // 50 minutes (Ably tokens are issued for 60m)
const STALE_BUFFER_MS = 60_000; // Refresh 1 minute before expiry

function buildCacheKey(envelope: RealtimeEnvelope): string {
  if (!envelope) return "__anonymous__";
  try {
    return JSON.stringify(envelope);
  } catch {
    return "__anonymous__";
  }
}

function deriveExpiresAt(payload: RealtimeAuthPayload): number {
  const now = Date.now();
  const token = payload?.token as Record<string, unknown> | null;
  const expires =
    token && typeof token === "object" && typeof token.expires === "number"
      ? token.expires
      : null;
  const issued =
    token && typeof token === "object" && typeof token.issued === "number"
      ? token.issued
      : null;
  const ttl =
    token && typeof token === "object" && typeof token.ttl === "number" ? token.ttl : null;

  if (typeof expires === "number" && Number.isFinite(expires)) {
    return Math.max(now + STALE_BUFFER_MS, expires - STALE_BUFFER_MS);
  }
  if (typeof issued === "number" && Number.isFinite(issued) && typeof ttl === "number") {
    return Math.max(now + STALE_BUFFER_MS, issued + ttl - STALE_BUFFER_MS);
  }
  return now + CACHE_FALLBACK_MS;
}

async function fetchRealtimeToken(envelope: RealtimeEnvelope): Promise<RealtimeAuthPayload> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (envelope) {
    try {
      headers["X-Capsules-User"] = JSON.stringify(envelope);
    } catch {
      // ignore serialization errors; request can proceed without the header
    }
  }

  const res = await fetch("/api/realtime/token", {
    method: "POST",
    credentials: "include",
    headers,
    body: JSON.stringify({ user: envelope ?? {} }),
  });

  const payload = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(`Realtime token request failed (${res.status})`);
  }
  if (!payload || typeof payload.provider !== "string") {
    throw new Error("Invalid realtime token response");
  }

  return {
    provider: payload.provider as string,
    token: payload.token,
    environment: (payload.environment ?? null) as string | null,
  };
}

export async function requestRealtimeToken(
  envelope: RealtimeEnvelope,
): Promise<RealtimeAuthPayload> {
  const key = buildCacheKey(envelope);
  const now = Date.now();
  const cached = tokenCache.get(key) ?? null;

  if (cached?.payload && cached.expiresAt > now) {
    return cached.payload;
  }
  if (cached?.promise) {
    return cached.promise;
  }

  const promise = fetchRealtimeToken(envelope)
    .then((payload) => {
      const expiresAt = deriveExpiresAt(payload);
      tokenCache.set(key, { promise: null, payload, expiresAt });
      return payload;
    })
    .catch((error) => {
      tokenCache.delete(key);
      throw error;
    });

  tokenCache.set(key, {
    promise,
    payload: cached?.payload ?? null,
    expiresAt: cached?.expiresAt ?? now + CACHE_FALLBACK_MS,
  });

  return promise;
}

export function clearRealtimeTokenCache(): void {
  tokenCache.clear();
}
