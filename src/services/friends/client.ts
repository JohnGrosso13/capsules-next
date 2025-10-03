import type { RealtimeEnvelope } from "@/lib/realtime/envelope";
import type { SocialGraphSnapshot } from "@/lib/supabase/friends";

export type FriendsChannelInfo = { events: string; presence: string } | null;

export type FriendsSnapshotResponse = {
  graph: SocialGraphSnapshot | null;
  channels: FriendsChannelInfo;
};

export type FriendsUpdateResult = {
  graph: SocialGraphSnapshot | null;
  data: Record<string, unknown> | null;
};

function buildFriendsHeaders(envelope: RealtimeEnvelope | null): Record<string, string> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (!envelope) {
    return headers;
  }

  try {
    headers["X-Capsules-User"] = JSON.stringify(envelope);
  } catch {
    // ignore serialization failures; request still works without the header
  }

  return headers;
}

export async function fetchFriendsSnapshot(envelope: RealtimeEnvelope | null): Promise<FriendsSnapshotResponse> {
  const headers = buildFriendsHeaders(envelope);

  const res = await fetch("/api/friends/sync", {
    method: "POST",
    credentials: "include",
    headers,
    body: JSON.stringify({ user: envelope ?? {} }),
  });

  const payload = await res.json().catch(() => null);
  if (!res.ok) {
    const message =
      (payload && typeof payload?.message === "string" && payload.message) ||
      (payload && typeof payload?.error === "string" && payload.error) ||
      `Friends sync failed (${res.status})`;
    throw new Error(message);
  }

  const graph =
    payload && typeof payload.graph === "object" ? (payload.graph as SocialGraphSnapshot) : null;

  const channelsRecord =
    payload && typeof payload.channels === "object" ? (payload.channels as Record<string, unknown>) : null;

  let channels: FriendsChannelInfo = null;
  if (channelsRecord) {
    const events = channelsRecord.events;
    const presence = channelsRecord.presence;
    if (typeof events === "string" && typeof presence === "string") {
      channels = { events, presence };
    }
  }

  return { graph, channels };
}

export async function updateFriendsGraph(
  payload: Record<string, unknown>,
  envelope: RealtimeEnvelope | null,
): Promise<FriendsUpdateResult> {
  const headers = buildFriendsHeaders(envelope);

  const res = await fetch("/api/friends/update", {
    method: "POST",
    credentials: "include",
    headers,
    body: JSON.stringify({ ...payload, user: envelope ?? {} }),
  });

  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const message =
      (data && typeof data?.message === "string" && data.message) ||
      (data && typeof data?.error === "string" && data.error) ||
      "Friends update failed.";
    throw new Error(message);
  }

  const graph = data && typeof data.graph === "object" ? (data.graph as SocialGraphSnapshot) : null;

  return { graph, data };
}