const LIVE_CHAT_PREFIX = "capsule-live-chat";

export function getCapsuleLiveChatChannel(capsuleId: string): string {
  const normalized = typeof capsuleId === "string" ? capsuleId.trim().toLowerCase() : "";
  return `${LIVE_CHAT_PREFIX}:${normalized}`;
}

export const LIVE_CHAT_PREFIX_CONST = LIVE_CHAT_PREFIX;
