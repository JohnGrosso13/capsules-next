"use client";

import type { ComposerDraft } from "@/lib/composer/draft";

const STORAGE_PREFIX = "capsule:composer:sidebar";
const STORAGE_VERSION = "v1";

export type ComposerStoredRecentChat = {
  id: string;
  prompt: string;
  message: string | null;
  draft: ComposerDraft;
  rawPost: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
};

export type ComposerStoredDraft = {
  id: string;
  prompt: string;
  title: string | null;
  message: string | null;
  draft: ComposerDraft;
  rawPost: Record<string, unknown> | null;
  projectId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ComposerStoredProject = {
  id: string;
  name: string;
  draftIds: string[];
  createdAt: string;
  updatedAt: string;
};

export type ComposerSidebarSnapshot = {
  recentChats: ComposerStoredRecentChat[];
  drafts: ComposerStoredDraft[];
  projects: ComposerStoredProject[];
  selectedProjectId: string | null;
};

export const EMPTY_SIDEBAR_SNAPSHOT: ComposerSidebarSnapshot = {
  recentChats: [],
  drafts: [],
  projects: [],
  selectedProjectId: null,
};

export function buildSidebarStorageKey(userId: string | null | undefined): string {
  return `${STORAGE_PREFIX}:${STORAGE_VERSION}:${userId ?? "guest"}`;
}

function cloneValue<T>(value: T): T {
  if (value === null || value === undefined) return value;
  if (typeof structuredClone === "function") {
    return structuredClone(value);
  }
  return JSON.parse(JSON.stringify(value)) as T;
}

function sanitizeRecentChats(items: unknown[]): ComposerStoredRecentChat[] {
  return items
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const record = item as Partial<ComposerStoredRecentChat>;
      if (typeof record.id !== "string" || typeof record.prompt !== "string") return null;
      return {
        id: record.id,
        prompt: record.prompt,
        message: typeof record.message === "string" ? record.message : null,
        draft: (record.draft as ComposerDraft) ?? {
          kind: "text",
          title: null,
          content: "",
          mediaUrl: null,
          mediaPrompt: null,
          poll: null,
          suggestions: [],
        },
        rawPost: (record.rawPost as Record<string, unknown>) ?? null,
        createdAt: typeof record.createdAt === "string" ? record.createdAt : new Date().toISOString(),
        updatedAt: typeof record.updatedAt === "string" ? record.updatedAt : new Date().toISOString(),
      };
    })
    .filter((entry): entry is ComposerStoredRecentChat => Boolean(entry));
}

function sanitizeDrafts(items: unknown[]): ComposerStoredDraft[] {
  return items
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const record = item as Partial<ComposerStoredDraft>;
      if (typeof record.id !== "string" || typeof record.prompt !== "string") return null;
      return {
        id: record.id,
        prompt: record.prompt,
        title: typeof record.title === "string" ? record.title : null,
        message: typeof record.message === "string" ? record.message : null,
        draft: (record.draft as ComposerDraft) ?? {
          kind: "text",
          title: null,
          content: "",
          mediaUrl: null,
          mediaPrompt: null,
          poll: null,
          suggestions: [],
        },
        rawPost: (record.rawPost as Record<string, unknown>) ?? null,
        projectId: typeof record.projectId === "string" ? record.projectId : null,
        createdAt: typeof record.createdAt === "string" ? record.createdAt : new Date().toISOString(),
        updatedAt: typeof record.updatedAt === "string" ? record.updatedAt : new Date().toISOString(),
      };
    })
    .filter((entry): entry is ComposerStoredDraft => Boolean(entry));
}

function sanitizeProjects(items: unknown[]): ComposerStoredProject[] {
  return items
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const record = item as Partial<ComposerStoredProject>;
      if (typeof record.id !== "string" || typeof record.name !== "string") return null;
      const draftIds = Array.isArray(record.draftIds)
        ? record.draftIds.filter((id): id is string => typeof id === "string")
        : [];
      return {
        id: record.id,
        name: record.name,
        draftIds,
        createdAt: typeof record.createdAt === "string" ? record.createdAt : new Date().toISOString(),
        updatedAt: typeof record.updatedAt === "string" ? record.updatedAt : new Date().toISOString(),
      };
    })
    .filter((entry): entry is ComposerStoredProject => Boolean(entry));
}

function sanitizeSnapshot(value: unknown): ComposerSidebarSnapshot {
  if (!value || typeof value !== "object") return cloneValue(EMPTY_SIDEBAR_SNAPSHOT);
  const snapshot = value as Partial<ComposerSidebarSnapshot>;
  return {
    recentChats: sanitizeRecentChats(
      Array.isArray(snapshot.recentChats) ? snapshot.recentChats : [],
    ),
    drafts: sanitizeDrafts(Array.isArray(snapshot.drafts) ? snapshot.drafts : []),
    projects: sanitizeProjects(Array.isArray(snapshot.projects) ? snapshot.projects : []),
    selectedProjectId:
      typeof snapshot.selectedProjectId === "string" ? snapshot.selectedProjectId : null,
  };
}

export function loadSidebarSnapshot(storageKey: string): ComposerSidebarSnapshot {
  if (typeof window === "undefined") {
    return cloneValue(EMPTY_SIDEBAR_SNAPSHOT);
  }
  try {
    const value = window.localStorage.getItem(storageKey);
    if (!value) {
      return cloneValue(EMPTY_SIDEBAR_SNAPSHOT);
    }
    const parsed = JSON.parse(value) as unknown;
    return sanitizeSnapshot(parsed);
  } catch {
    return cloneValue(EMPTY_SIDEBAR_SNAPSHOT);
  }
}

export function saveSidebarSnapshot(
  storageKey: string,
  snapshot: ComposerSidebarSnapshot,
): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(storageKey, JSON.stringify(snapshot));
  } catch (error) {
    console.warn("Unable to persist composer sidebar snapshot", error);
  }
}

export function cloneStoredDraft(draft: ComposerStoredDraft): ComposerStoredDraft {
  return cloneValue(draft);
}

export function cloneStoredRecent(entry: ComposerStoredRecentChat): ComposerStoredRecentChat {
  return cloneValue(entry);
}

export function cloneStoredProject(project: ComposerStoredProject): ComposerStoredProject {
  return cloneValue(project);
}
