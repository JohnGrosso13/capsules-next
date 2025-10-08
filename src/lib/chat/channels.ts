const CHAT_DIRECT_PREFIX = "chat:direct";
const CHAT_CONVERSATION_PREFIX = "chat:pair";

function sanitize(value: string): string {
  return value.trim().toLowerCase();
}

export function getChatConversationId(a: string, b: string): string {
  const first = sanitize(a);
  const second = sanitize(b);
  if (!first && !second) {
    throw new Error("Conversation id requires at least one participant");
  }
  const [left, right] = [first, second].sort();
  return `${CHAT_CONVERSATION_PREFIX}:${left}:${right}`;
}

export function getChatDirectChannel(userId: string): string {
  const normalized = sanitize(userId);
  if (!normalized) {
    throw new Error("Chat direct channel requires a user id");
  }
  return `${CHAT_DIRECT_PREFIX}:${normalized}`;
}

export function parseConversationId(conversationId: string): { left: string; right: string } {
  if (!conversationId.startsWith(`${CHAT_CONVERSATION_PREFIX}:`)) {
    throw new Error(`Invalid conversation id: ${conversationId}`);
  }
  const suffix = conversationId.slice(CHAT_CONVERSATION_PREFIX.length + 1);
  const [left, right] = suffix.split(":", 2);
  if (!left || !right) {
    throw new Error(`Invalid conversation id: ${conversationId}`);
  }
  return { left, right };
}

export function isParticipantInConversation(conversationId: string, userId: string): boolean {
  try {
    const normalized = sanitize(userId);
    if (!normalized) return false;
    const { left, right } = parseConversationId(conversationId);
    return left === normalized || right === normalized;
  } catch {
    return false;
  }
}

export const CHAT_CONSTANTS = {
  DIRECT_PREFIX: CHAT_DIRECT_PREFIX,
  CONVERSATION_PREFIX: CHAT_CONVERSATION_PREFIX,
};
