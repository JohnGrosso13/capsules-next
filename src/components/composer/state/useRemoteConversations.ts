"use client";

import * as React from "react";

import { sanitizeComposerChatHistory } from "@/lib/composer/chat-types";
import { normalizeDraftFromPost } from "@/lib/composer/normalizers";
import type {
  ComposerSidebarSnapshot,
  ComposerStoredRecentChat,
} from "@/lib/composer/sidebar-store";
import { cloneComposerData } from "@/components/composer/state/utils";
import { fetchRemoteConversations } from "@/services/composer/conversations";

type UpdateSidebarStore = (
  updater: (prev: ComposerSidebarSnapshot) => ComposerSidebarSnapshot,
) => void;

export function useRemoteConversations(
  userId: string | null | undefined,
  updateSidebarStore: UpdateSidebarStore,
) {
  React.useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    const loadRemoteConversations = async () => {
      try {
        const conversations = await fetchRemoteConversations();
        if (!conversations?.length || cancelled) return;
        updateSidebarStore((prev) => {
          const merged = new Map<string, ComposerStoredRecentChat>();
          for (const chat of prev.recentChats) {
            const key = chat.threadId ?? chat.id;
            merged.set(key, chat);
          }
          for (const conversation of conversations) {
            const history = sanitizeComposerChatHistory(conversation.history ?? []);
            const normalizedDraft = normalizeDraftFromPost(
              (conversation.rawPost as Record<string, unknown>) ??
                (conversation.draft as Record<string, unknown>) ??
                {},
            );
            const entry: ComposerStoredRecentChat = {
              id: conversation.threadId,
              prompt: conversation.prompt,
              message: conversation.message,
              draft: cloneComposerData(normalizedDraft),
              rawPost: conversation.rawPost ? cloneComposerData(conversation.rawPost) : null,
              createdAt: conversation.updatedAt,
              updatedAt: conversation.updatedAt,
              history: cloneComposerData(history),
              threadId: conversation.threadId,
            };
            merged.set(conversation.threadId, entry);
          }
          const sorted = Array.from(merged.values())
            .sort((a, b) => {
              const aTime = Date.parse(a.updatedAt ?? "");
              const bTime = Date.parse(b.updatedAt ?? "");
              return (Number.isFinite(bTime) ? bTime : 0) - (Number.isFinite(aTime) ? aTime : 0);
            })
            .slice(0, 20);
          return { ...prev, recentChats: sorted };
        });
      } catch (error) {
        console.warn("composer remote history fetch failed", error);
      }
    };
    void loadRemoteConversations();
    return () => {
      cancelled = true;
    };
  }, [updateSidebarStore, userId]);
}
