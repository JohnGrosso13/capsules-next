import "server-only";

import { getRealtimeAuthProvider } from "@/config/realtime-server";
import type { RealtimeAuthPayload, RealtimeCapabilities } from "@/ports/realtime";
import { getCapsuleLiveChatChannel } from "@/shared/live-chat";

export async function createCapsuleLiveChatAuth(params: {
  capsuleId: string;
  userId: string;
}): Promise<RealtimeAuthPayload | null> {
  const authProvider = getRealtimeAuthProvider();
  if (!authProvider) return null;

  const channel = getCapsuleLiveChatChannel(params.capsuleId);
  const capabilities: RealtimeCapabilities = {
    [channel]: ["publish", "subscribe", "presence"],
  };

  return authProvider.createAuth({
    userId: params.userId,
    capabilities,
  });
}

export function buildCapsuleLiveChatChannel(capsuleId: string): string {
  return getCapsuleLiveChatChannel(capsuleId);
}
