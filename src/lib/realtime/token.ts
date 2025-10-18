import type { RealtimeAuthPayload } from "@/ports/realtime";
import type { RealtimeEnvelope } from "./envelope";

export async function requestRealtimeToken(
  envelope: RealtimeEnvelope,
): Promise<RealtimeAuthPayload> {
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
