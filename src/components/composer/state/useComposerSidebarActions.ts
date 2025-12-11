"use client";

import * as React from "react";
import { safeRandomUUID } from "@/lib/random";
import { ensureRecentDraft } from "./composerState";
import { cloneComposerData } from "./utils";
import type { ComposerState } from "../types";
import type { ComposerDraft } from "@/lib/composer/draft";
import type { ComposerChatMessage } from "@/lib/composer/chat-types";
import type { ComposerStoredRecentChat, ComposerStoredProject } from "@/lib/composer/sidebar-store";
import type { useComposerSidebarStore } from "../context/SidebarProvider";
import { sanitizeComposerChatHistory } from "@/lib/composer/chat-types";
import { saveRemoteDraft } from "@/services/composer/drafts";

type SidebarStoreApi = ReturnType<typeof useComposerSidebarStore>;

type SidebarActionsOptions = {
  sidebarStore: SidebarStoreApi["sidebarStore"];
  updateSidebarStore: SidebarStoreApi["updateSidebarStore"];
  setState: React.Dispatch<React.SetStateAction<ComposerState>>;
  getState: () => ComposerState;
};

export function useComposerSidebarActions({
  sidebarStore,
  updateSidebarStore,
  setState,
  getState,
}: SidebarActionsOptions) {
  const recordRecentChat = React.useCallback(
    (input: {
      prompt: string;
      message: string | null;
      draft: ComposerDraft | null;
      rawPost: Record<string, unknown> | null;
      history: ComposerChatMessage[];
      threadId: string | null;
    }) => {
      const safeDraft = ensureRecentDraft(input.draft ?? null);
      updateSidebarStore((prev) => {
        const now = new Date().toISOString();
        const normalizedThreadId =
          typeof input.threadId === "string" && input.threadId.trim().length
            ? input.threadId.trim()
            : null;
        const existing =
          normalizedThreadId != null
            ? prev.recentChats.find(
                (item) =>
                  item.threadId === normalizedThreadId ||
                  (!item.threadId && item.id === normalizedThreadId),
              )
            : null;
        const entryId = existing?.id ?? normalizedThreadId ?? safeRandomUUID();
        const resolvedThreadId = normalizedThreadId ?? existing?.threadId ?? entryId;
        const createdAt = existing?.createdAt ?? now;
        const historySlice = input.history.slice(-20);
        const entry: ComposerStoredRecentChat = {
          id: entryId,
          prompt: input.prompt,
          message: input.message ?? null,
          draft: cloneComposerData(safeDraft),
          rawPost: input.rawPost ? cloneComposerData(input.rawPost) : null,
          createdAt,
          updatedAt: now,
          history: cloneComposerData(historySlice),
          threadId: resolvedThreadId,
        };
        const filtered = prev.recentChats.filter(
          (item) =>
            item.id !== entryId &&
            (resolvedThreadId ? (item.threadId ?? item.id) !== resolvedThreadId : true),
        );
        return {
          ...prev,
          recentChats: [entry, ...filtered].slice(0, 20),
        };
      });
    },
    [updateSidebarStore],
  );

  const selectProject = React.useCallback(
    (projectId: string | null) => {
      updateSidebarStore((prev) => {
        if (!projectId) {
          return { ...prev, selectedProjectId: null };
        }
        const exists = prev.projects.some((project) => project.id === projectId);
        return {
          ...prev,
          selectedProjectId: exists ? projectId : prev.selectedProjectId,
        };
      });
    },
    [updateSidebarStore],
  );

  const createProject = React.useCallback(
    (name: string) => {
      const trimmed = name.trim();
      if (!trimmed) return;
      updateSidebarStore((prev) => {
        const now = new Date().toISOString();
        const project: ComposerStoredProject = {
          id: safeRandomUUID(),
          name: trimmed,
          draftIds: [],
          createdAt: now,
          updatedAt: now,
        };
        return {
          ...prev,
          projects: [project, ...prev.projects],
          selectedProjectId: project.id,
        };
      });
    },
    [updateSidebarStore],
  );

  const resolveDraftIdentity = React.useCallback((state: ComposerState) => {
    const rawClientId =
      typeof (state.rawPost as { client_id?: unknown })?.client_id === "string"
        ? ((state.rawPost as { client_id: string }).client_id ?? "").trim()
        : null;
    const threadId =
      (typeof state.threadId === "string" && state.threadId.trim().length
        ? state.threadId.trim()
        : rawClientId) || safeRandomUUID();
    return { threadId, rawClientId };
  }, []);

  const upsertDraft = React.useCallback(
    (draftState: ComposerState, projectId?: string | null) => {
      const { rawPost, prompt, message, history, threadId } = draftState;
      const safeDraft = ensureRecentDraft(draftState.draft ?? null);
      const resolvedThreadId =
        typeof threadId === "string" && threadId.trim().length ? threadId.trim() : null;
      const baseId =
        typeof (rawPost as { client_id?: unknown })?.client_id === "string"
          ? ((rawPost as { client_id: string }).client_id ?? safeRandomUUID())
          : resolvedThreadId ?? safeRandomUUID();
      const effectiveThreadId = resolvedThreadId ?? baseId;
      const assignedProjectId =
        projectId === undefined ? sidebarStore.selectedProjectId : projectId ?? null;

      updateSidebarStore((prev) => {
        const now = new Date().toISOString();
        const sanitizedDraft = cloneComposerData(safeDraft);
        const sanitizedRawPost = rawPost ? cloneComposerData(rawPost) : null;
        const historySlice = cloneComposerData(history.slice(-20));
        const existingIndex = prev.drafts.findIndex((item) => item.id === baseId);
        let drafts = [...prev.drafts];
        if (existingIndex >= 0) {
          const existingDraft = drafts[existingIndex]!;
          drafts[existingIndex] = {
            ...existingDraft,
            prompt,
            title: sanitizedDraft.title ?? existingDraft.title ?? null,
            message: message ?? null,
            draft: sanitizedDraft,
            rawPost: sanitizedRawPost,
            projectId: assignedProjectId ?? existingDraft.projectId ?? null,
            updatedAt: now,
            history: historySlice,
            threadId: effectiveThreadId ?? existingDraft.threadId ?? null,
          };
        } else {
          drafts = [
            {
              id: baseId,
              prompt,
              title: sanitizedDraft.title ?? null,
              message: message ?? null,
              draft: sanitizedDraft,
              rawPost: sanitizedRawPost,
              projectId: assignedProjectId ?? null,
              createdAt: now,
              updatedAt: now,
              history: historySlice,
              threadId: effectiveThreadId ?? null,
            },
            ...drafts,
          ];
        }
        drafts = drafts.slice(0, 100);

        const projects = prev.projects.map((project) => {
          if (!assignedProjectId || project.id !== assignedProjectId) return project;
          const draftIds = project.draftIds.includes(baseId)
            ? project.draftIds
            : [baseId, ...project.draftIds];
          return { ...project, draftIds, updatedAt: now };
        });

        let selected = prev.selectedProjectId;
        if (assignedProjectId && projects.some((project) => project.id === assignedProjectId)) {
          selected = assignedProjectId;
        } else if (selected && !projects.some((project) => project.id === selected)) {
          selected = null;
        }

        return {
          ...prev,
          drafts,
          projects,
          selectedProjectId: selected,
        };
      });
    },
    [sidebarStore.selectedProjectId, updateSidebarStore],
  );

  const selectSavedDraft = React.useCallback(
    (draftId: string) => {
      const entry = sidebarStore.drafts.find((draftItem) => draftItem.id === draftId);
      if (!entry) return;
      const draftClone = cloneComposerData(entry.draft);
      const rawPostClone = entry.rawPost ? cloneComposerData(entry.rawPost) : null;
      setState((prev) => ({
        ...prev,
        open: true,
        loading: false,
        prompt: entry.prompt,
        draft: draftClone,
        rawPost: rawPostClone,
        message: entry.message ?? null,
        choices: null,
        history: cloneComposerData(entry.history ?? []),
        threadId: entry.threadId ?? null,
      }));
      recordRecentChat({
        prompt: entry.prompt,
        message: entry.message,
        draft: draftClone,
        rawPost: rawPostClone,
        history: entry.history ?? [],
        threadId: entry.threadId ?? null,
      });
      updateSidebarStore((prev) => {
        const index = prev.drafts.findIndex((draftItem) => draftItem.id === draftId);
        if (index < 0) return prev;
        const now = new Date().toISOString();
        const existingDraft = prev.drafts[index];
        if (!existingDraft) return prev;
        const updatedDraft = { ...existingDraft, updatedAt: now };
        const others = prev.drafts.filter((draftItem) => draftItem.id !== draftId);
        return { ...prev, drafts: [updatedDraft, ...others] };
      });
      if (entry.projectId) {
        selectProject(entry.projectId);
      }
    },
    [recordRecentChat, selectProject, sidebarStore.drafts, setState, updateSidebarStore],
  );

  const selectRecentChat = React.useCallback(
    (chatId: string) => {
      const entry = sidebarStore.recentChats.find((chat) => chat.id === chatId);
      if (!entry) return;
      const draftClone = cloneComposerData(entry.draft);
      const rawPostClone = entry.rawPost ? cloneComposerData(entry.rawPost) : null;
      setState((prev) => ({
        ...prev,
        open: true,
        loading: false,
        prompt: entry.prompt,
        draft: draftClone,
        rawPost: rawPostClone,
        message: entry.message ?? null,
        choices: null,
        history: cloneComposerData(entry.history ?? []),
        threadId: entry.threadId ?? entry.id ?? null,
      }));
      updateSidebarStore((prev) => {
        const found = prev.recentChats.find((chat) => chat.id === chatId);
        if (!found) return prev;
        const now = new Date().toISOString();
        const others = prev.recentChats.filter((chat) => chat.id !== chatId);
        return { ...prev, recentChats: [{ ...found, updatedAt: now }, ...others] };
      });
    },
    [setState, sidebarStore.recentChats, updateSidebarStore],
  );

  const persistRemoteDraft = React.useCallback(
    (state: ComposerState, projectId?: string | null) => {
      const { threadId, rawClientId } = resolveDraftIdentity(state);
      const history = cloneComposerData(
        sanitizeComposerChatHistory(state.history ?? []).slice(-50),
      );

      const draftPayload = cloneComposerData(
        (state.draft as Record<string, unknown> | null) ?? null,
      ) as Record<string, unknown> | null;

      const payload = {
        threadId,
        projectId: projectId ?? null,
        prompt: state.prompt ?? "",
        message: state.message ?? null,
        draft: draftPayload,
        rawPost: state.rawPost ? cloneComposerData(state.rawPost) : null,
        history,
      } as const;

      const withId =
        rawClientId && rawClientId.length
          ? { ...payload, id: rawClientId }
          : payload;

      void saveRemoteDraft(withId).catch((error) => {
        console.warn("composer draft remote save failed", error);
      });
    },
    [resolveDraftIdentity],
  );

  const saveDraft = React.useCallback(
    (projectId?: string | null) => {
      const snapshot = getState();
      if (!snapshot?.draft) return;
      const { threadId } = resolveDraftIdentity(snapshot);
      const snapshotWithThread = snapshot.threadId
        ? snapshot
        : { ...snapshot, threadId };

      upsertDraft(snapshotWithThread, projectId);
      persistRemoteDraft(snapshotWithThread, projectId);
      if (!snapshot.threadId) {
        setState((prev) => (prev.threadId ? prev : { ...prev, threadId }));
      }
    },
    [getState, persistRemoteDraft, resolveDraftIdentity, setState, upsertDraft],
  );

  return {
    recordRecentChat,
    selectProject,
    createProject,
    selectSavedDraft,
    selectRecentChat,
    saveDraft,
    upsertDraft,
  };
}
