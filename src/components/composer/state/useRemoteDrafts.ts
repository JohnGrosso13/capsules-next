"use client";

import * as React from "react";

import { sanitizeComposerChatHistory } from "@/lib/composer/chat-types";
import { normalizeDraftFromPost } from "@/lib/composer/normalizers";
import type { ComposerSidebarSnapshot, ComposerStoredDraft } from "@/lib/composer/sidebar-store";
import { cloneComposerData } from "@/components/composer/state/utils";
import { fetchRemoteDrafts } from "@/services/composer/drafts";
import type { ComposerDraft } from "@/lib/composer/draft";

type UpdateSidebarStore = (
  updater: (prev: ComposerSidebarSnapshot) => ComposerSidebarSnapshot,
) => void;

export function useRemoteDrafts(
  userId: string | null | undefined,
  updateSidebarStore: UpdateSidebarStore,
) {
  React.useEffect(() => {
    if (!userId) return;
    let cancelled = false;

    const loadRemoteDrafts = async () => {
      try {
        const drafts = await fetchRemoteDrafts();
        if (!drafts.length || cancelled) return;
        updateSidebarStore((prev) => {
          const merged = new Map<string, ComposerStoredDraft>();
          for (const draft of prev.drafts) {
            merged.set(draft.id, draft);
          }
          for (const draft of drafts) {
            const history = sanitizeComposerChatHistory(draft.history ?? []);
            const normalizedDraft = normalizeDraftFromPost(
              (draft.rawPost as Record<string, unknown>) ??
                (draft.draft as Record<string, unknown>) ??
                {},
            );
            const resolvedDraft: ComposerDraft =
              (draft.draft as ComposerDraft | null) ?? normalizedDraft;
            const entry: ComposerStoredDraft = {
              id: draft.id,
              prompt: draft.prompt ?? "",
              title:
                typeof (draft.draft as { title?: unknown })?.title === "string"
                  ? ((draft.draft as { title: string }).title ?? null)
                  : (resolvedDraft.title as string | null | undefined) ?? null,
              message: draft.message ?? null,
              draft: cloneComposerData(resolvedDraft),
              rawPost: draft.rawPost ? cloneComposerData(draft.rawPost) : null,
              projectId: draft.projectId ?? null,
              createdAt: draft.createdAt,
              updatedAt: draft.updatedAt,
              history: cloneComposerData(history),
              threadId: draft.threadId ?? draft.id ?? null,
            };
            merged.set(draft.id, entry);
          }

          const sorted = Array.from(merged.values())
            .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))
            .slice(0, 100);

          return { ...prev, drafts: sorted };
        });
      } catch (error) {
        console.warn("composer remote drafts fetch failed", error);
      }
    };

    void loadRemoteDrafts();
    return () => {
      cancelled = true;
    };
  }, [updateSidebarStore, userId]);
}
