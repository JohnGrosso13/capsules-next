"use client";

import type { ComposerChatMessage } from "@/lib/composer/chat-types";

export type RemoteComposerDraft = {
  id: string;
  threadId: string;
  projectId: string | null;
  prompt: string;
  message: string | null;
  draft: Record<string, unknown> | null;
  rawPost: Record<string, unknown> | null;
  history: ComposerChatMessage[];
  createdAt: string;
  updatedAt: string;
};

export type SaveRemoteDraftPayload = {
  id?: string;
  projectId?: string | null;
  threadId?: string | null;
  prompt: string;
  message: string | null;
  draft: Record<string, unknown> | null;
  rawPost: Record<string, unknown> | null;
  history: ComposerChatMessage[];
};

export async function fetchRemoteDrafts(): Promise<RemoteComposerDraft[]> {
  const response = await fetch("/api/composer/drafts", {
    method: "GET",
    credentials: "include",
  });
  if (!response.ok) {
    throw new Error(`Drafts request failed (${response.status})`);
  }
  const payload = (await response.json().catch(() => null)) as { drafts?: RemoteComposerDraft[] } | null;
  return payload?.drafts ?? [];
}

export async function saveRemoteDraft(
  draft: SaveRemoteDraftPayload,
): Promise<RemoteComposerDraft | null> {
  const response = await fetch("/api/composer/drafts", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(draft),
  });
  if (!response.ok) {
    throw new Error(`Draft save failed (${response.status})`);
  }
  const payload = (await response.json().catch(() => null)) as { draft?: RemoteComposerDraft } | null;
  return payload?.draft ?? null;
}
