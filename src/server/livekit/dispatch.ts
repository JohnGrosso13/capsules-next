import "server-only";

import { AgentDispatchClient } from "livekit-server-sdk";

export async function dispatchAgentToRoom(params: {
  agentId: string;
  roomName: string;
  metadata?: Record<string, unknown> | null;
}): Promise<void> {
  const { agentId, roomName, metadata } = params;
  const url = process.env.LIVEKIT_URL?.trim() ?? process.env.NEXT_PUBLIC_LIVEKIT_URL?.trim() ?? "";
  const apiKey = process.env.LIVEKIT_API_KEY?.trim() ?? "";
  const apiSecret = process.env.LIVEKIT_API_SECRET?.trim() ?? "";
  if (!url || !apiKey || !apiSecret) {
    throw new Error("LiveKit is not fully configured. Set LIVEKIT_URL, LIVEKIT_API_KEY, and LIVEKIT_API_SECRET.");
  }

  const normalizedUrl = url.startsWith("ws") ? url.replace(/^wss?/, "https") : url;
  const client = new AgentDispatchClient(normalizedUrl, apiKey, apiSecret);
  const dispatchOptions = metadata ? { metadata: JSON.stringify(metadata) } : undefined;
  const dispatch = await client.createDispatch(roomName, agentId, dispatchOptions);
  if (!dispatch?.state?.jobs || dispatch.state.jobs.length === 0) {
    throw new Error(
      "Assistant dispatch created but no agent jobs were scheduled. Confirm LIVEKIT_ASSISTANT_AGENT_ID and that the agent worker is registered and online.",
    );
  }
}
