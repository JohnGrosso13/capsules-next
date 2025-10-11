"use client";

import type { StoredState } from "@/components/providers/chat-store";

export type ChatStorageAdapter = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export const DEFAULT_CHAT_STORAGE_KEY = "capsule:chat:sessions";

export function loadChatState(
  storage: ChatStorageAdapter | null,
  key: string = DEFAULT_CHAT_STORAGE_KEY,
): StoredState | null {
  if (!storage) return null;
  try {
    const raw = storage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredState;
    if (!parsed || typeof parsed !== "object") return null;
    if (!Array.isArray(parsed.sessions)) return null;
    return parsed;
  } catch (error) {
    console.warn("chat storage load failed", error);
    return null;
  }
}

export function saveChatState(
  storage: ChatStorageAdapter | null,
  state: StoredState,
  key: string = DEFAULT_CHAT_STORAGE_KEY,
): void {
  if (!storage) return;
  try {
    storage.setItem(key, JSON.stringify(state));
  } catch (error) {
    console.error("chat storage save failed", error);
  }
}

export function clearChatState(
  storage: ChatStorageAdapter | null,
  key: string = DEFAULT_CHAT_STORAGE_KEY,
): void {
  if (!storage) return;
  try {
    storage.removeItem(key);
  } catch (error) {
    console.error("chat storage clear failed", error);
  }
}
