"use client";

import type { ComposerChatMessage } from "@/lib/composer/chat-types";

export type RemoteConversationSummary = {
  threadId: string;
  prompt: string;
  message: string | null;
  draft: Record<string, unknown> | null;
  rawPost: Record<string, unknown> | null;
  history: ComposerChatMessage[] | null;
  updatedAt: string;
};

export async function fetchRemoteConversations(): Promise<RemoteConversationSummary[]> {
  const response = await fetch("/api/ai/conversations", {
    method: "GET",
    credentials: "include",
  });
  if (!response.ok) {
    throw new Error(`Conversations request failed (${response.status})`);
  }
  const payload = (await response.json().catch(() => null)) as {
    conversations?: RemoteConversationSummary[];
  } | null;
  if (!payload?.conversations?.length) {
    return [];
  }
  return payload.conversations;
}
