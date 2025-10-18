"use client";

import * as React from "react";
import type { AuthClientUser } from "@/ports/auth-client";
import { useCurrentUser } from "@/services/auth/client";

import { AiComposerDrawer } from "@/components/ai-composer";
import type { ComposerChoice } from "@/components/composer/ComposerForm";
import type { PrompterAction, PrompterAttachment } from "@/components/ai-prompter-stage";
import { applyThemeVars } from "@/lib/theme";
import { resolveStylerHeuristicPlan } from "@/lib/theme/styler-heuristics";
import { safeRandomUUID } from "@/lib/random";
import type { ComposerDraft } from "@/lib/composer/draft";
import {
  buildSidebarStorageKey,
  EMPTY_SIDEBAR_SNAPSHOT,
  loadSidebarSnapshot,
  saveSidebarSnapshot,
  type ComposerSidebarSnapshot,
  type ComposerStoredDraft,
  type ComposerStoredProject,
  type ComposerStoredRecentChat,
} from "@/lib/composer/sidebar-store";
import {
  formatRelativeTime,
  truncateLabel,
  type ComposerSidebarData,
  type SidebarDraftListItem,
} from "@/lib/composer/sidebar-types";
import { normalizeDraftFromPost } from "@/lib/composer/normalizers";
import { buildPostPayload } from "@/lib/composer/payload";
import type { ComposerMode } from "@/lib/ai/nav";
import {
  draftPostResponseSchema,
  stylerResponseSchema,
  type DraftPostResponse,
  type StylerResponse,
} from "@/shared/schemas/ai";

async function callAiPrompt(
  message: string,
  options?: Record<string, unknown>,
  post?: Record<string, unknown>,
  attachments?: PrompterAttachment[],
): Promise<DraftPostResponse> {
  const body: Record<string, unknown> = { message };
  if (options && Object.keys(options).length) body.options = options;
  if (post) body.post = post;
  if (attachments && attachments.length) {
    body.attachments = attachments.map((attachment) => ({
      id: attachment.id,
      name: attachment.name,
      mimeType: attachment.mimeType,
      size: attachment.size,
      url: attachment.url,
      thumbnailUrl: attachment.thumbnailUrl ?? null,
    }));
  }

  const response = await fetch("/api/ai/prompt", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await response.json().catch(() => null);
  if (!response.ok || !json) {
    throw new Error(`Prompt request failed (${response.status})`);
  }
  return draftPostResponseSchema.parse(json);
}

async function callStyler(
  prompt: string,
  envelope?: Record<string, unknown> | null,
): Promise<StylerResponse> {
  const body: Record<string, unknown> = { prompt };
  if (envelope && Object.keys(envelope).length) {
    body.user = envelope;
  }
  const response = await fetch("/api/ai/styler", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await response.json().catch(() => null);
  if (!response.ok || !json) {
    throw new Error(`Styler request failed (${response.status})`);
  }
  return stylerResponseSchema.parse(json);
}

function cloneData<T>(value: T): T {
  if (value === null || value === undefined) return value;
  if (typeof structuredClone === "function") {
    return structuredClone(value);
  }
  return JSON.parse(JSON.stringify(value)) as T;
}

function pickFirstMeaningfulText(...values: Array<string | null | undefined>): string | null {
  for (const value of values) {
    if (!value) continue;
    const trimmed = value.replace(/\s+/g, " ").trim();
    if (trimmed.length) return trimmed;
  }
  return null;
}

function describeRecentTitle(entry: ComposerStoredRecentChat): string {
  const primary = pickFirstMeaningfulText(entry.message, entry.prompt, entry.draft.content ?? "");
  return truncateLabel(primary ?? "Recent chat", 70);
}

function describeDraftTitle(entry: ComposerStoredDraft): string {
  const primary = pickFirstMeaningfulText(
    entry.title,
    entry.prompt,
    entry.draft.content ?? "",
    entry.message,
  );
  return truncateLabel(primary ?? "Saved draft", 70);
}

function describeDraftCaption(updatedAt: string): string {
  return `Updated ${formatRelativeTime(updatedAt)}`;
}

function describeRecentCaption(entry: ComposerStoredRecentChat): string {
  return formatRelativeTime(entry.updatedAt);
}

function describeProjectCaption(project: ComposerStoredProject): string {
  const countLabel = project.draftIds.length === 1 ? "1 draft" : `${project.draftIds.length} drafts`;
  return `${countLabel} · ${formatRelativeTime(project.updatedAt)}`;
}

async function persistPost(
  post: Record<string, unknown>,
  userEnvelope?: Record<string, unknown> | null,
) {
  const body: Record<string, unknown> = { post };
  if (userEnvelope && Object.keys(userEnvelope).length) {
    body.user = userEnvelope;
  }
  const response = await fetch("/api/posts", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(text || `Post request failed (${response.status})`);
  }
  return response.json().catch(() => null) as Promise<Record<string, unknown> | null>;
}

type ComposerState = {
  open: boolean;
  loading: boolean;
  prompt: string;
  draft: ComposerDraft | null;
  rawPost: Record<string, unknown> | null;
  message: string | null;
  choices: ComposerChoice[] | null;
};

type ComposerContextValue = {
  state: ComposerState;
  handlePrompterAction(action: PrompterAction): void;
  close(): void;
  post(): Promise<void>;
  submitPrompt(prompt: string, attachments?: PrompterAttachment[] | null): Promise<void>;
  forceChoice?(key: string): Promise<void>;
  updateDraft(draft: ComposerDraft): void;
  sidebar: ComposerSidebarData;
  selectRecentChat(id: string): void;
  selectDraft(id: string): void;
  createProject(name: string): void;
  selectProject(id: string | null): void;
  saveDraft(projectId?: string | null): void;
};

const initialState: ComposerState = {
  open: false,
  loading: false,
  prompt: "",
  draft: null,
  rawPost: null,
  message: null,
  choices: null,
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function normalizeCapsuleId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return UUID_PATTERN.test(trimmed) ? trimmed : null;
}

function appendCapsuleContext(
  post: Record<string, unknown>,
  capsuleId: string | null,
): Record<string, unknown> {
  if (!capsuleId) return post;
  const hasCapsule =
    (typeof (post as { capsuleId?: unknown }).capsuleId === "string" &&
      ((post as { capsuleId?: string }).capsuleId ?? "").trim().length > 0) ||
    (typeof (post as { capsule_id?: unknown }).capsule_id === "string" &&
      ((post as { capsule_id?: string }).capsule_id ?? "").trim().length > 0);
  if (hasCapsule) return post;
  return {
    ...post,
    capsuleId,
    capsule_id: capsuleId,
  };
}

type FeedTarget = { scope: "home" } | { scope: "capsule"; capsuleId: string | null };
type FeedTargetDetail = { scope?: string | null; capsuleId?: string | null };

const ComposerContext = React.createContext<ComposerContextValue | null>(null);

export function useComposer() {
  const ctx = React.useContext(ComposerContext);
  if (!ctx) throw new Error("useComposer must be used within ComposerProvider");
  return ctx;
}

function formatAuthor(user: AuthClientUser | null, name: string | null, avatar: string | null) {
  return {
    name,
    avatar,
    toEnvelope(): Record<string, unknown> | null {
      if (!user) return null;
      const envelope: Record<string, unknown> = {
        clerk_id: user.provider === "clerk" ? user.id : null,
        email: user.email,
        full_name: name,
        avatar_url: avatar,
        provider: user.provider ?? "guest",
      };
      envelope.key = user.key ?? (user.provider === "clerk" ? `clerk:${user.id}` : user.id);
      return envelope;
    },
  };
}

export function ComposerProvider({ children }: { children: React.ReactNode }) {
  const { user } = useCurrentUser();
  const [state, setState] = React.useState<ComposerState>(initialState);
  const [feedTarget, setFeedTarget] = React.useState<FeedTarget>({ scope: "home" });
  const [sidebarStore, setSidebarStore] = React.useState<ComposerSidebarSnapshot>(
    EMPTY_SIDEBAR_SNAPSHOT,
  );

  const sidebarStorageKey = React.useMemo(
    () => buildSidebarStorageKey(user?.id ?? null),
    [user?.id],
  );

  React.useEffect(() => {
    if (typeof window === "undefined") return;
    setSidebarStore(loadSidebarSnapshot(sidebarStorageKey));
  }, [sidebarStorageKey]);

  const updateSidebarStore = React.useCallback(
    (updater: (prev: ComposerSidebarSnapshot) => ComposerSidebarSnapshot) => {
      setSidebarStore((prev) => {
        const next = updater(prev);
        if (typeof window !== "undefined") {
          saveSidebarSnapshot(sidebarStorageKey, next);
        }
        return next;
      });
    },
    [sidebarStorageKey],
  );

  const recordRecentChat = React.useCallback(
    (input: {
      prompt: string;
      message: string | null;
      draft: ComposerDraft;
      rawPost: Record<string, unknown> | null;
    }) => {
      updateSidebarStore((prev) => {
        const now = new Date().toISOString();
        const entry: ComposerStoredRecentChat = {
          id: safeRandomUUID(),
          prompt: input.prompt,
          message: input.message ?? null,
          draft: cloneData(input.draft),
          rawPost: input.rawPost ? cloneData(input.rawPost) : null,
          createdAt: now,
          updatedAt: now,
        };
        const filtered = prev.recentChats.filter(
          (item) => item.prompt !== entry.prompt || item.message !== entry.message,
        );
        return {
          ...prev,
          recentChats: [entry, ...filtered].slice(0, 12),
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

  const upsertDraft = React.useCallback(
    (draftState: ComposerState, projectId?: string | null) => {
      const { draft, rawPost, prompt, message } = draftState;
      if (!draft) return;
      const baseId =
        typeof (rawPost as { client_id?: unknown })?.client_id === "string"
          ? ((rawPost as { client_id: string }).client_id ?? safeRandomUUID())
          : safeRandomUUID();
      const assignedProjectId =
        projectId === undefined ? sidebarStore.selectedProjectId : projectId ?? null;

      updateSidebarStore((prev) => {
        const now = new Date().toISOString();
        const sanitizedDraft = cloneData(draft);
        const sanitizedRawPost = rawPost ? cloneData(rawPost) : null;
        const existingIndex = prev.drafts.findIndex((item) => item.id === baseId);
        let drafts = [...prev.drafts];
        if (existingIndex >= 0) {
          drafts[existingIndex] = {
            ...drafts[existingIndex],
            prompt,
            title: sanitizedDraft.title ?? drafts[existingIndex].title ?? null,
            message: message ?? null,
            draft: sanitizedDraft,
            rawPost: sanitizedRawPost,
            projectId: assignedProjectId ?? drafts[existingIndex].projectId ?? null,
            updatedAt: now,
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
      const draftClone = cloneData(entry.draft);
      const rawPostClone = entry.rawPost ? cloneData(entry.rawPost) : null;
      setState(() => ({
        open: true,
        loading: false,
        prompt: entry.prompt,
        draft: draftClone,
        rawPost: rawPostClone,
        message: entry.message,
        choices: null,
      }));
      recordRecentChat({
        prompt: entry.prompt,
        message: entry.message,
        draft: draftClone,
        rawPost: rawPostClone,
      });
      updateSidebarStore((prev) => {
        const index = prev.drafts.findIndex((draftItem) => draftItem.id === draftId);
        if (index < 0) return prev;
        const now = new Date().toISOString();
        const updatedDraft = { ...prev.drafts[index], updatedAt: now };
        const others = prev.drafts.filter((draftItem) => draftItem.id !== draftId);
        return { ...prev, drafts: [updatedDraft, ...others] };
      });
      if (entry.projectId) {
        selectProject(entry.projectId);
      }
    },
    [recordRecentChat, selectProject, sidebarStore.drafts, updateSidebarStore],
  );

  const selectRecentChat = React.useCallback(
    (chatId: string) => {
      const entry = sidebarStore.recentChats.find((chat) => chat.id === chatId);
      if (!entry) return;
      const draftClone = cloneData(entry.draft);
      const rawPostClone = entry.rawPost ? cloneData(entry.rawPost) : null;
      setState(() => ({
        open: true,
        loading: false,
        prompt: entry.prompt,
        draft: draftClone,
        rawPost: rawPostClone,
        message: entry.message,
        choices: null,
      }));
      updateSidebarStore((prev) => {
        const found = prev.recentChats.find((chat) => chat.id === chatId);
        if (!found) return prev;
        const now = new Date().toISOString();
        const others = prev.recentChats.filter((chat) => chat.id !== chatId);
        return { ...prev, recentChats: [{ ...found, updatedAt: now }, ...others] };
      });
    },
    [sidebarStore.recentChats, updateSidebarStore],
  );

  const saveDraft = React.useCallback(
    (projectId?: string | null) => {
      setState((prev) => {
        if (prev.draft) {
          upsertDraft(prev, projectId);
        }
        return prev;
      });
    },
    [upsertDraft],
  );

  const currentUserName = React.useMemo(() => {
    if (!user) return null;
    return user.name ?? user.email ?? null;
  }, [user]);
  const currentUserAvatar = user?.avatarUrl ?? null;

  const author = React.useMemo(
    () => formatAuthor(user, currentUserName, currentUserAvatar),
    [user, currentUserName, currentUserAvatar],
  );
  const envelopePayload = React.useMemo(() => author.toEnvelope(), [author]);
  const activeCapsuleId = React.useMemo(
    () => normalizeCapsuleId(feedTarget.scope === "capsule" ? feedTarget.capsuleId : null),
    [feedTarget],
  );

  React.useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<FeedTargetDetail>).detail ?? {};
      if ((detail.scope ?? "").toLowerCase() === "capsule") {
        setFeedTarget({ scope: "capsule", capsuleId: detail.capsuleId ?? null });
      } else {
        setFeedTarget({ scope: "home" });
      }
    };
    window.addEventListener("composer:feed-target", handler as EventListener);
    return () => window.removeEventListener("composer:feed-target", handler as EventListener);
  }, []);

  const handleAiResponse = React.useCallback(
    (prompt: string, payload: DraftPostResponse) => {
      const rawSource = (payload.post ?? {}) as Record<string, unknown>;
      const rawPost = appendCapsuleContext({ ...rawSource }, activeCapsuleId);
      const draft = normalizeDraftFromPost(rawPost);
      setState(() => ({
        open: true,
        loading: false,
        prompt,
        draft,
        rawPost,
        message: payload.message ?? null,
        choices: payload.choices ?? null,
      }));
      recordRecentChat({
        prompt,
        message: payload.message ?? null,
        draft,
        rawPost,
      });
    },
    [activeCapsuleId, recordRecentChat],
  );

  const handlePrompterAction = React.useCallback(
    async (action: PrompterAction) => {
      if (action.kind === "post_manual") {
        const content = action.content.trim();
        if (!content && (!action.attachments || !action.attachments.length)) {
          return;
        }
        setState((prev) => ({ ...prev, loading: true }));
        try {
          const postPayload: Record<string, unknown> = {
            client_id: safeRandomUUID(),
            kind: "text",
            content,
            source: "ai-prompter",
          };
          if (action.attachments?.length) {
            postPayload.attachments = action.attachments;
            const primary = action.attachments[0];
            if (primary?.url) {
              postPayload.mediaUrl = primary.url;
              const primaryMime = primary.mimeType ?? null;
              if (primaryMime) {
                const normalizedKind = primaryMime.startsWith("video/") ? "video" : "image";
                postPayload.kind = normalizedKind;
              } else if (postPayload.kind === "text") {
                postPayload.kind = "image";
              }
            }
          }
          const manualPayload = appendCapsuleContext(postPayload, activeCapsuleId);
          await persistPost(manualPayload, envelopePayload);
          setState(initialState);
          window.dispatchEvent(new CustomEvent("posts:refresh", { detail: { reason: "manual" } }));
        } catch (error) {
          console.error("Manual post failed", error);
          setState((prev) => ({ ...prev, loading: false }));
        }
        return;
      }
      if (action.kind === "style") {
        const heuristicPlan = resolveStylerHeuristicPlan(action.prompt);
        if (heuristicPlan) {
          applyThemeVars(heuristicPlan.variants);
          return;
        }
        try {
          const response = await callStyler(action.prompt, envelopePayload);
          applyThemeVars(response.variants);
        } catch (error) {
          console.error("Styler action failed", error);
        }
        return;
      }

      if (action.kind === "tool_poll") {
        const prompt = action.prompt;
        setState((prev) => ({
          ...prev,
          open: true,
          loading: true,
          prompt,
          message: null,
          choices: null,
        }));
        try {
          const payload = await callAiPrompt(prompt, { prefer: "poll" });
          handleAiResponse(prompt, payload);
        } catch (error) {
          console.error("Poll tool failed", error);
          setState(initialState);
        }
        return;
      }
      // Tool: Logo (generate an image from prompt then open composer)
      if (action.kind === "tool_logo") {
        const prompt = action.prompt;
        setState((prev) => ({
          ...prev,
          open: true,
          loading: true,
          prompt,
          message: null,
          choices: null,
        }));
        try {
          const res = await fetch("/api/ai/image/generate", {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ prompt }),
          });
          const json = (await res.json().catch(() => null)) as { url?: string } | null;
          if (!res.ok || !json?.url) throw new Error(`Image generate failed (${res.status})`);
          const draft: ComposerDraft = {
            kind: "image",
            title: null,
            content: "",
            mediaUrl: json.url,
            mediaPrompt: prompt,
            poll: null,
          };
          setState(() => ({
            open: true,
            loading: false,
            prompt,
            draft,
            rawPost: appendCapsuleContext(
              { kind: "image", mediaUrl: json.url, media_prompt: prompt, source: "ai-prompter" },
              activeCapsuleId,
            ),
            message: "Generated a logo concept from your prompt.",
            choices: null,
          }));
        } catch (error) {
          console.error("Logo tool failed", error);
          setState(initialState);
        }
        return;
      }
      // Tool: Image edit/vibe (requires attachment image)
      if (action.kind === "tool_image_edit") {
        const prompt = action.prompt;
        const attachment = action.attachments?.[0] ?? null;
        if (!attachment?.url) return;
        setState((prev) => ({
          ...prev,
          open: true,
          loading: true,
          prompt,
          message: null,
          choices: null,
        }));
        try {
          const res = await fetch("/api/ai/image/edit", {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ imageUrl: attachment.url, instruction: prompt }),
          });
          const json = (await res.json().catch(() => null)) as { url?: string } | null;
          if (!res.ok || !json?.url) throw new Error(`Image edit failed (${res.status})`);
          const draft: ComposerDraft = {
            kind: "image",
            title: null,
            content: "",
            mediaUrl: json.url,
            mediaPrompt: prompt,
            poll: null,
          };
          setState(() => ({
            open: true,
            loading: false,
            prompt,
            draft,
            rawPost: appendCapsuleContext(
              { kind: "image", mediaUrl: json.url, media_prompt: prompt, source: "ai-prompter" },
              activeCapsuleId,
            ),
            message: "Updated your image with those vibes.",
            choices: null,
          }));
        } catch (error) {
          console.error("Image edit tool failed", error);
          setState(initialState);
        }
        return;
      }
      const prompt = action.kind === "post_ai" ? action.prompt : action.text;
      const composeOptions: Record<string, unknown> | undefined =
        action.kind === "post_ai" ? { compose: action.mode as ComposerMode } : undefined;
      setState((prev) => ({
        ...prev,
        open: true,
        loading: true,
        prompt,
        message: null,
        choices: null,
      }));
      try {
        const payload = await callAiPrompt(prompt, composeOptions, undefined, action.attachments);
        handleAiResponse(prompt, payload);
      } catch (error) {
        console.error("AI prompt failed", error);
        setState(initialState);
      }
    },
    [activeCapsuleId, envelopePayload, handleAiResponse],
  );

  const close = React.useCallback(() => setState(initialState), []);

  const post = React.useCallback(async () => {
    if (!state.draft) return;
    setState((prev) => ({ ...prev, loading: true }));
    try {
      const postPayload = buildPostPayload(state.draft, state.rawPost, {
        name: author.name,
        avatar: author.avatar,
      });
      const payloadWithContext = appendCapsuleContext(postPayload, activeCapsuleId);
      await persistPost(payloadWithContext, envelopePayload);
      setState(initialState);
      window.dispatchEvent(new CustomEvent("posts:refresh", { detail: { reason: "composer" } }));
    } catch (error) {
      console.error("Composer post failed", error);
      setState((prev) => ({ ...prev, loading: false }));
    }
  }, [state.draft, state.rawPost, author.name, author.avatar, activeCapsuleId, envelopePayload]);

  const submitPrompt = React.useCallback(
    async (promptText: string, attachments?: PrompterAttachment[] | null) => {
      const trimmed = promptText.trim();
      if (!trimmed) return;
      setState((prev) => ({
        ...prev,
        loading: true,
        prompt: trimmed,
        message: null,
        choices: null,
      }));
      try {
        const payload = await callAiPrompt(
          trimmed,
          undefined,
          state.rawPost ?? undefined,
          attachments && attachments.length ? attachments : undefined,
        );
        handleAiResponse(trimmed, payload);
      } catch (error) {
        console.error("Composer prompt submit failed", error);
        setState((prev) => ({ ...prev, loading: false }));
      }
    },
    [handleAiResponse, state.rawPost],
  );

  const forceChoiceInternal = React.useCallback(
    async (key: string) => {
      if (!state.prompt) return;
      setState((prev) => ({ ...prev, loading: true }));
      try {
        const payload = await callAiPrompt(
          state.prompt,
          { force: key },
          state.rawPost ?? undefined,
        );
        handleAiResponse(state.prompt, payload);
      } catch (error) {
        console.error("Composer force choice failed", error);
        setState((prev) => ({ ...prev, loading: false }));
      }
    },
    [state.prompt, state.rawPost, handleAiResponse],
  );

  const updateDraft = React.useCallback((draft: ComposerDraft) => {
    setState((prev) => ({ ...prev, draft }));
  }, []);

  const sidebarData = React.useMemo<ComposerSidebarData>(() => {
    const recentChats = sidebarStore.recentChats.map((entry) => ({
      id: entry.id,
      title: describeRecentTitle(entry),
      caption: describeRecentCaption(entry),
    }));

    const savedDraftItems: SidebarDraftListItem[] = sidebarStore.drafts.map((entry) => ({
      kind: "draft",
      id: entry.id,
      title: describeDraftTitle(entry),
      caption: describeDraftCaption(entry.updatedAt),
      projectId: entry.projectId ?? null,
    }));

    const choiceItems: SidebarDraftListItem[] = (state.choices ?? []).map((choice) => ({
      kind: "choice",
      key: choice.key,
      title: truncateLabel(choice.label, 70),
      caption: "Blueprint suggestion",
    }));

    const projects = sidebarStore.projects.map((project) => ({
      id: project.id,
      name: truncateLabel(project.name, 60),
      caption: describeProjectCaption(project),
      draftCount: project.draftIds.length,
    }));

    return {
      recentChats,
      drafts: [...choiceItems, ...savedDraftItems],
      projects,
      selectedProjectId: sidebarStore.selectedProjectId,
    };
  }, [sidebarStore, state.choices]);

  const forceChoice = state.choices ? forceChoiceInternal : undefined;

  const contextValue = React.useMemo<ComposerContextValue>(() => {
    const base: ComposerContextValue = {
      state,
      handlePrompterAction,
      close,
      post,
      submitPrompt,
      updateDraft,
      sidebar: sidebarData,
      selectRecentChat,
      selectDraft: selectSavedDraft,
      createProject,
      selectProject,
      saveDraft,
    };
    if (forceChoice) {
      base.forceChoice = forceChoice;
    }
    return base;
  }, [
    state,
    handlePrompterAction,
    close,
    post,
    submitPrompt,
    forceChoice,
    updateDraft,
    sidebarData,
    selectRecentChat,
    selectSavedDraft,
    createProject,
    selectProject,
    saveDraft,
  ]);

  return <ComposerContext.Provider value={contextValue}>{children}</ComposerContext.Provider>;
}

export function AiComposerRoot() {
  const {
    state,
    close,
    updateDraft,
    post,
    submitPrompt,
    forceChoice,
    sidebar,
    selectRecentChat,
    selectDraft,
    createProject,
    selectProject,
    saveDraft,
  } = useComposer();

  const forceHandlers = forceChoice
    ? {
        onForceChoice: (key: string) => {
          void forceChoice(key);
        },
      }
    : {};

  return (
    <AiComposerDrawer
      open={state.open}
      loading={state.loading}
      draft={state.draft}
      prompt={state.prompt}
      message={state.message}
      choices={state.choices}
      onChange={updateDraft}
      onClose={close}
      onPost={post}
      onPrompt={submitPrompt}
      sidebar={sidebar}
      onSelectRecentChat={selectRecentChat}
      onSelectDraft={selectDraft}
      onCreateProject={createProject}
      onSelectProject={selectProject}
      onSave={saveDraft}
      {...forceHandlers}
    />
  );
}
