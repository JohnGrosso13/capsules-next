"use client";

import type { ComposerChatMessage } from "@/lib/composer/chat-types";

export type CustomizerConversationSummary = {
  threadId: string;
  prompt: string;
  message: string | null;
  history: ComposerChatMessage[] | null;
  updatedAt: string;
};

export type CustomizerConversationSnapshot = {
  threadId: string;
  prompt: string;
  message: string | null;
  history: ComposerChatMessage[];
  updatedAt: string;
};

export async function fetchCustomizerConversations(): Promise<CustomizerConversationSummary[]> {
  const response = await fetch("/api/ai/customize/conversations", {
    method: "GET",
    credentials: "include",
  });
  if (!response.ok) {
    throw new Error(`Customizer conversations request failed (${response.status})`);
  }
  const payload = (await response.json().catch(() => null)) as {
    conversations?: CustomizerConversationSummary[];
  } | null;
  if (!payload?.conversations?.length) {
    return [];
  }
  return payload.conversations;
}

export async function fetchCustomizerConversationSnapshot(
  threadId: string,
): Promise<CustomizerConversationSnapshot | null> {
  const response = await fetch(`/api/ai/customize/conversations/${encodeURIComponent(threadId)}`, {
    method: "GET",
    credentials: "include",
  });
  if (response.status === 404) return null;
  if (!response.ok) {
    throw new Error(`Customizer conversation request failed (${response.status})`);
  }
  const payload = (await response.json().catch(() => null)) as CustomizerConversationSnapshot | null;
  if (!payload || typeof payload !== "object") return null;
  return payload;
}
