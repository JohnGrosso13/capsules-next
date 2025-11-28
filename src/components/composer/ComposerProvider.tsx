"use client";

import * as React from "react";
import type { AuthClientUser } from "@/ports/auth-client";
import { useCurrentUser } from "@/services/auth/client";

import { AiComposerDrawer } from "@/components/ai-composer";
import type { ComposerChoice } from "@/components/composer/ComposerForm";
import type { PrompterAction, PrompterAttachment } from "@/components/ai-prompter-stage";
import type { PrompterHandoff } from "@/components/composer/prompter-handoff";
import { applyThemeVars, endPreviewThemeVars, startPreviewThemeVars } from "@/lib/theme";
import { normalizeThemeVariantsInput, type ThemeVariants } from "@/lib/theme/variants";
import { resolveStylerHeuristicPlan } from "@/lib/theme/styler-heuristics";
import { safeRandomUUID } from "@/lib/random";
import { ensurePollStructure, type ComposerDraft } from "@/lib/composer/draft";
import { useComposerCore } from "@/components/composer/state/useComposerCore";
import { cloneComposerData } from "@/components/composer/state/utils";
import { appendCapsuleContext } from "@/components/composer/state/ai-shared";
import { ComposerSidebarProvider, useComposerSidebarStore } from "./context/SidebarProvider";
import { ComposerSmartContextProvider, useComposerSmartContext } from "./context/SmartContextProvider";
import { useComposerImageSettings } from "@/components/composer/state/useComposerImageSettings";
import { useComposerAi } from "@/components/composer/state/useComposerAi";
import {
  type ComposerChatAttachment,
  type ComposerChatMessage,
} from "@/lib/composer/chat-types";
import {
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
import { buildPostPayload } from "@/lib/composer/payload";
import { type PromptResponse } from "@/shared/schemas/ai";
import { callAiPrompt } from "@/services/composer/ai";
import { persistPost } from "@/services/composer/posts";
import { saveComposerItem } from "@/services/composer/memories";
import { requestImageGeneration, requestImageEdit } from "@/services/composer/images";
import { callStyler } from "@/services/composer/styler";
import type { SummaryResult } from "@/types/summary";
import type { SummaryConversationContext, SummaryPresentationOptions } from "@/lib/composer/summary-context";
import { detectVideoIntent } from "@/shared/ai/video-intent";
import type {
  PromptRunMode,
  PromptSubmitOptions,
  ComposerVideoStatus,
  ComposerSaveStatus,
  ComposerSaveRequest,
} from "./types";

type ComposerImageSettings = ReturnType<typeof useComposerImageSettings>["settings"];

const POLL_OPTION_KEYWORDS = ["option", "options", "choice", "choices", "answer", "answers", "selection", "selections"];
const POLL_TITLE_KEYWORDS = [
  "title",
  "headline",
  "rename",
  "retitle",
  "call it",
  "name it",
];
const POLL_QUESTION_PATTERNS = [
  /poll question/,
  /question to/,
  /question as/,
  /question be/,
  /question should/,
  /question is/,
];

const EMPTY_RECENT_DRAFT: ComposerDraft = {
  kind: "text",
  title: null,
  content: "",
  mediaUrl: null,
  mediaPrompt: null,
  mediaThumbnailUrl: null,
  mediaPlaybackUrl: null,
  mediaDurationSeconds: null,
  muxPlaybackId: null,
  muxAssetId: null,
  poll: null,
  suggestions: [],
};

function ensureRecentDraft(draft: ComposerDraft | null): ComposerDraft {
  if (draft && typeof draft === "object") {
    return draft;
  }
  return { ...EMPTY_RECENT_DRAFT };
}

function shouldPreservePollOptions(prompt: string, prevDraft: ComposerDraft | null): boolean {
  if (!prevDraft?.poll) return false;
  const structure = ensurePollStructure(prevDraft);
  const meaningfulOptions = structure.options.map((option) => option.trim()).filter(Boolean);
  if (!meaningfulOptions.length) return false;
  const normalized = prompt.toLowerCase().trim();
  if (!normalized.length) return false;
  if (
    normalized.includes("keep the options") ||
    normalized.includes("keep options") ||
    normalized.includes("don't change the options") ||
    normalized.includes("dont change the options")
  ) {
    return true;
  }
  if (POLL_OPTION_KEYWORDS.some((keyword) => normalized.includes(keyword))) {
    return false;
  }
  if (POLL_TITLE_KEYWORDS.some((keyword) => normalized.includes(keyword))) {
    return true;
  }
  if (POLL_QUESTION_PATTERNS.some((pattern) => pattern.test(normalized))) {
    return true;
  }
  return false;
}

type SummaryConversationExtras = {
  context?: SummaryConversationContext | null;
  attachments?: PrompterAttachment[] | null;
};

function softenSummaryLine(text: string): string {
  const trimmed = text.trim();
  if (!trimmed.length) return trimmed;
  const lower = trimmed.toLowerCase();
  if (lower.includes("no caption") || lower.includes("lack captions") || lower.includes("without captions")) {
    return "These updates lean on the visuals themselves, so consider pairing them with a quick note when you share them onward.";
  }
  return trimmed;
}

function formatSummaryMessage(result: SummaryResult, options: SummaryPresentationOptions): string {
  const sections: string[] = [];
  const summaryText = result.summary.trim();
  const areaLabel = options.sourceLabel?.trim().length ? options.sourceLabel!.trim() : "your feed";
  const intro = options.sourceLabel?.trim().length
    ? `Here is what is happening in ${areaLabel}:`
    : "Here is what I am seeing right now:";
  if (summaryText.length) {
    sections.push(`${intro}\n${summaryText}`);
  } else {
    sections.push(intro);
  }

  if (result.highlights.length) {
    const highlightLines = result.highlights.map((item) => `- ${softenSummaryLine(item)}`);
    sections.push(["Highlights I noticed:", ...highlightLines].join("\n"));
  }
  if (result.insights.length) {
    const insightLines = result.insights.map((item) => `- ${softenSummaryLine(item)}`);
    sections.push(["What it could mean:", ...insightLines].join("\n"));
  }
  if (result.nextActions.length) {
    const actionLines = result.nextActions.map((item) => `- ${softenSummaryLine(item)}`);
    sections.push(["Next steps to try:", ...actionLines].join("\n"));
  }
  if (result.postPrompt || result.postTitle) {
    const ideaLines: string[] = ["Want to publish something next?"];
    if (result.postTitle) {
      ideaLines.push(`Title: ${result.postTitle}`);
    }
    if (result.postPrompt) {
      ideaLines.push(`Prompt: ${result.postPrompt}`);
    }
    sections.push(ideaLines.join("\n"));
  }
  if (result.hashtags.length) {
    sections.push(`Hashtags: ${result.hashtags.join(" ")}`);
  }

  return sections.join("\n\n").trim();
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
  const pollQuestion = entry.draft.poll?.question?.trim();
  if (pollQuestion?.length) {
    return truncateLabel(pollQuestion, 70);
  }
  const firstUserMessage = (entry.history ?? []).find(
    (message) => message.role === "user" && message.content?.trim().length,
  );
  const primary = pickFirstMeaningfulText(
    firstUserMessage?.content ?? null,
    entry.draft.title ?? null,
    entry.message,
    entry.prompt,
    entry.draft.content ?? "",
  );
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

function mapPrompterAttachmentToChat(
  attachment: PrompterAttachment,
): ComposerChatAttachment {
  return {
    id: attachment.id,
    name: attachment.name,
    mimeType: attachment.mimeType,
    size: attachment.size,
    url: attachment.url,
    thumbnailUrl: attachment.thumbnailUrl ?? null,
    storageKey: attachment.storageKey ?? null,
    sessionId: attachment.sessionId ?? null,
    role: attachment.role ?? "reference",
    source: attachment.source ?? "user",
    excerpt: attachment.excerpt ?? null,
  };
}

function describeRecentCaption(entry: ComposerStoredRecentChat): string {
  const historyCount = Array.isArray(entry.history) ? entry.history.length : 0;
  let totalMessages = historyCount;
  if (totalMessages === 0 && (entry.message?.trim().length ?? 0) > 0) {
    totalMessages = 1;
  }
  if (totalMessages === 0 && (entry.prompt?.trim().length ?? 0) > 0) {
    totalMessages = 1;
  }
  const safeCount = Math.max(totalMessages, 1);
  const countLabel = safeCount === 1 ? "1 message" : `${safeCount} messages`;
  const relative = formatRelativeTime(entry.updatedAt);
  return `${countLabel} - ${relative}`;
}

function describeRecentSnippet(entry: ComposerStoredRecentChat): string | null {
  const history = Array.isArray(entry.history) ? entry.history : [];
  for (let index = history.length - 1; index >= 0; index -= 1) {
    const message = history[index];
    if (!message) continue;
    if (message.role !== "assistant") continue;
    const content = message.content?.trim();
    if (content?.length) {
      return truncateLabel(content, 80);
    }
  }
  const fallback = entry.message?.trim();
  if (fallback?.length) {
    return truncateLabel(fallback, 80);
  }
  return null;
}

function describeProjectCaption(project: ComposerStoredProject): string {
  const countLabel = project.draftIds.length === 1 ? "1 draft" : `${project.draftIds.length} drafts`;
  return `${countLabel} - ${formatRelativeTime(project.updatedAt)}`;
}

export type ComposerContextSnippet = {
  id: string;
  title: string | null;
  snippet: string;
  source: string | null;
  kind: string | null;
  url: string | null;
  highlightHtml: string | null;
  tags: string[];
};

export type ComposerContextSnapshot = {
  query: string | null;
  memoryIds: string[];
  snippets: ComposerContextSnippet[];
  userCard: string | null;
};

export type ComposerState = {
  open: boolean;
  loading: boolean;
  loadingKind: "image" | "video" | null;
  prompt: string;
  draft: ComposerDraft | null;
  rawPost: Record<string, unknown> | null;
  message: string | null;
  choices: ComposerChoice[] | null;
  history: ComposerChatMessage[];
  threadId: string | null;
  summaryContext: SummaryConversationContext | null;
  summaryResult: SummaryResult | null;
  summaryOptions: SummaryPresentationOptions | null;
  summaryMessageId: string | null;
  videoStatus: ComposerVideoStatus;
  saveStatus: ComposerSaveStatus;
  contextSnapshot: ComposerContextSnapshot | null;
  themePreview: ThemePreviewState | null;
};

type ThemePreviewState = {
  summary: string;
  details?: string | null;
  source: "heuristic" | "ai";
  variants: ThemeVariants;
};

type AiPromptHandoff = Extract<PrompterHandoff, { intent: "ai_prompt" }>;
type ImageLogoHandoff = Extract<PrompterHandoff, { intent: "image_logo" }>;
type ImageEditHandoff = Extract<PrompterHandoff, { intent: "image_edit" }>;

type ComposerContextValue = {
  state: ComposerState;
  feedTarget: FeedTarget;
  activeCapsuleId: string | null;
  smartContextEnabled: boolean;
  imageSettings: ComposerImageSettings;
  updateImageSettings(patch: Partial<ComposerImageSettings>): void;
  handlePrompterAction(action: PrompterAction): void;
  handlePrompterHandoff(handoff: PrompterHandoff): void;
  close(): void;
  post(): Promise<void>;
  submitPrompt(
    prompt: string,
    attachments?: PrompterAttachment[] | null,
    options?: PromptSubmitOptions,
  ): Promise<void>;
  showSummary(
    result: SummaryResult,
    options: SummaryPresentationOptions,
    extras?: SummaryConversationExtras,
  ): void;
  forceChoice?(key: string): Promise<void>;
  updateDraft(draft: ComposerDraft): void;
  sidebar: ComposerSidebarData;
  selectRecentChat(id: string): void;
  selectDraft(id: string): void;
  createProject(name: string): void;
  selectProject(id: string | null): void;
  saveDraft(projectId?: string | null): void;
  retryVideo(): void;
  saveCreation(request: ComposerSaveRequest): Promise<string | null>;
  setSmartContextEnabled(enabled: boolean): void;
  applyThemePreview(): void;
  cancelThemePreview(): void;
};

const initialState: ComposerState = {
  open: false,
  loading: false,
  loadingKind: null,
  prompt: "",
  draft: null,
  rawPost: null,
  message: null,
  choices: null,
  history: [],
  threadId: null,
  summaryContext: null,
  summaryResult: null,
  summaryOptions: null,
  summaryMessageId: null,
  videoStatus: createIdleVideoStatus(),
  saveStatus: createIdleSaveStatus(),
  contextSnapshot: null,
  themePreview: null,
};

function resetStateWithPreference(
  prev: ComposerState,
  overrides: Partial<ComposerState> = {},
): ComposerState {
  return {
    ...initialState,
    ...overrides,
  };
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function normalizeCapsuleId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return UUID_PATTERN.test(trimmed) ? trimmed : null;
}

function hasVideoAttachment(list?: PrompterAttachment[] | null): boolean {
  if (!list || !list.length) return false;
  return list.some(
    (attachment) =>
      typeof attachment.mimeType === "string" &&
      attachment.mimeType.toLowerCase().startsWith("video/"),
  );
}

function shouldExpectVideoResponse(
  prompt: string,
  attachments?: PrompterAttachment[] | null,
): boolean {
  if (hasVideoAttachment(attachments)) return true;
  return detectVideoIntent(prompt);
}

function createIdleVideoStatus(): ComposerVideoStatus {
  return {
    state: "idle",
    runId: null,
    prompt: null,
    attachments: null,
    error: null,
    message: null,
    memoryId: null,
  };
}

function createIdleSaveStatus(): ComposerSaveStatus {
  return {
    state: "idle",
    message: null,
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

type ComposerSessionProviderProps = {
  children: React.ReactNode;
  user: AuthClientUser | null;
};

function ComposerSessionProvider({ children, user }: ComposerSessionProviderProps) {
  const { state, setState } = useComposerCore(initialState);
  const [feedTarget, setFeedTarget] = React.useState<FeedTarget>({ scope: "home" });
  const { settings: imageSettings, updateSettings: updateImageSettings } = useComposerImageSettings();
  const { sidebarStore, updateSidebarStore } = useComposerSidebarStore();
  const { smartContextEnabled, setSmartContextEnabled: setSmartContextEnabledContext } =
    useComposerSmartContext();
  const saveResetTimeout = React.useRef<number | null>(null);

  const setSmartContextEnabled = React.useCallback(
    (enabled: boolean) => {
      setSmartContextEnabledContext(enabled);
      if (!enabled) {
        setState((prev) => ({
          ...prev,
          contextSnapshot: null,
        }));
      }
    },
    [setSmartContextEnabledContext, setState],
  );

  const imageRequestOptions = React.useMemo(
    () => ({
      quality: imageSettings.quality,
    }),
    [imageSettings],
  );

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

  const upsertDraft = React.useCallback(
    (draftState: ComposerState, projectId?: string | null) => {
      const { draft, rawPost, prompt, message, history, threadId } = draftState;
      if (!draft) return;
      const baseId =
        typeof (rawPost as { client_id?: unknown })?.client_id === "string"
          ? ((rawPost as { client_id: string }).client_id ?? safeRandomUUID())
          : safeRandomUUID();
      const assignedProjectId =
        projectId === undefined ? sidebarStore.selectedProjectId : projectId ?? null;

      updateSidebarStore((prev) => {
        const now = new Date().toISOString();
        const sanitizedDraft = cloneComposerData(draft);
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
            threadId: threadId ?? existingDraft.threadId ?? null,
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
              threadId: threadId ?? null,
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

  const saveDraft = React.useCallback(
    (projectId?: string | null) => {
      setState((prev) => {
        if (prev.draft) {
          upsertDraft(prev, projectId);
        }
        return prev;
      });
    },
    [setState, upsertDraft],
  );

  React.useEffect(
    () => () => {
      if (typeof window !== "undefined" && saveResetTimeout.current) {
        window.clearTimeout(saveResetTimeout.current);
      }
    },
    [],
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

  const saveCreation = React.useCallback(
    async (request: ComposerSaveRequest): Promise<string | null> => {
      setState((prev) => ({
        ...prev,
        saveStatus: { state: "saving", message: null },
      }));

      if (!envelopePayload) {
        const message = "Sign in to save Capsule creations.";
        setState((prev) => ({
          ...prev,
          saveStatus: { state: "failed", message },
        }));
        return null;
      }

      const payload = request.payload;
      if (!payload.mediaUrl || !payload.title.trim() || !payload.description.trim()) {
        const message = "Creation is missing required media or details.";
        setState((prev) => ({
          ...prev,
          saveStatus: { state: "failed", message },
        }));
        return null;
      }

      try {
        const result = await saveComposerItem({
          payload,
          capsuleId: activeCapsuleId,
          envelope: envelopePayload ?? undefined,
        });
        const memoryId = result.memoryId;

        setState((prev) => {
          let nextDraft = prev.draft;
          let nextVideoStatus = prev.videoStatus;
          if (request.target === "draft" && nextDraft && memoryId) {
            nextDraft = { ...nextDraft, memoryId };
            nextVideoStatus = { ...prev.videoStatus, memoryId };
          }
          return {
            ...prev,
            draft: nextDraft,
            videoStatus: nextVideoStatus,
            saveStatus: {
              state: "succeeded",
              message: result?.message ?? "Saved to Memory.",
            },
          };
        });

        if (typeof window !== "undefined") {
          window.dispatchEvent(
            new CustomEvent("memory:refresh", { detail: { reason: "composer-save" } }),
          );
          if (saveResetTimeout.current) {
            window.clearTimeout(saveResetTimeout.current);
          }
          saveResetTimeout.current = window.setTimeout(() => {
            setState((prev) =>
              prev.saveStatus.state === "succeeded"
                ? { ...prev, saveStatus: createIdleSaveStatus() }
                : prev,
            );
          }, 2600);
        }

        return memoryId;
      } catch (error) {
        const message =
          error instanceof Error && error.message ? error.message : "Failed to save creation.";
        setState((prev) => ({
          ...prev,
          saveStatus: { state: "failed", message },
        }));
        if (typeof window !== "undefined") {
          if (saveResetTimeout.current) {
            window.clearTimeout(saveResetTimeout.current);
          }
          saveResetTimeout.current = window.setTimeout(() => {
            setState((prev) =>
              prev.saveStatus.state === "failed"
                ? { ...prev, saveStatus: createIdleSaveStatus() }
                : prev,
            );
          }, 3000);
        }
        return null;
      }
    },
    [activeCapsuleId, envelopePayload, setState],
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

  const applyAiResponse = useComposerAi({
    activeCapsuleId,
    setState,
    shouldPreservePollOptions,
  });

  const handleAiResponse = React.useCallback(
    (prompt: string, payload: PromptResponse, mode: PromptRunMode = "default") => {
      const resolvedMode: PromptRunMode = payload.action === "chat_reply" ? "chatOnly" : mode;
      const result = applyAiResponse(prompt, payload, resolvedMode);
      if (!result) return;
      const { draft, rawPost, history, threadId, message } = result;

      recordRecentChat({
        prompt,
        message,
        draft: draft ?? null,
        rawPost,
        history,
        threadId,
      });

    },
    [applyAiResponse, recordRecentChat],
  );

  const runAiPromptHandoff = React.useCallback(
    async ({ prompt, attachments, options }: AiPromptHandoff) => {
      const trimmedPrompt = prompt.trim();
      if (!trimmedPrompt.length) return;
      const normalizedAttachments = attachments && attachments.length ? attachments : undefined;
      const composeOptions: Record<string, unknown> = {};
      if (options?.composeMode) {
        composeOptions.compose = options.composeMode;
      }
      if (options?.prefer) {
        composeOptions.prefer = options.prefer;
      }
      if (options?.extras && Object.keys(options.extras).length) {
        Object.assign(composeOptions, options.extras);
      }
      const requestedComposeKind =
        typeof (composeOptions as { compose?: unknown }).compose === "string" &&
        String((composeOptions as { compose?: string }).compose).toLowerCase() === "image"
          ? "image"
          : null;
      const replyMode =
        typeof (composeOptions as { replyMode?: unknown }).replyMode === "string"
          ? String((composeOptions as { replyMode?: string }).replyMode)
          : null;
      composeOptions.imageQuality = imageSettings.quality;
      const resolvedOptions = Object.keys(composeOptions).length ? composeOptions : undefined;

      const createdAt = new Date().toISOString();
      const workingMessageId = safeRandomUUID();
      const attachmentForChat =
        normalizedAttachments?.map((attachment) => mapPrompterAttachmentToChat(attachment)) ?? [];
      const pendingMessage: ComposerChatMessage = {
        id: safeRandomUUID(),
        role: "user",
        content: trimmedPrompt,
        createdAt,
        attachments: attachmentForChat.length ? attachmentForChat : null,
      };
      let baseHistory: ComposerChatMessage[] = [];
      let threadIdForRequest: string | null = null;
      setState((prev) => {
        const existingHistory = prev.history ?? [];
        baseHistory = existingHistory.slice();
        const lastEntry = existingHistory.length ? existingHistory[existingHistory.length - 1] : null;
        const nextHistory =
          lastEntry &&
          lastEntry.role === "user" &&
          lastEntry.content.trim().toLowerCase() === trimmedPrompt.toLowerCase()
            ? existingHistory
            : [...existingHistory, pendingMessage];
        const resolvedThreadId = prev.threadId ?? safeRandomUUID();
        threadIdForRequest = resolvedThreadId;
        const workingAssistant: ComposerChatMessage = {
          id: workingMessageId,
          role: "assistant",
          content: "Working on your request...",
          createdAt,
          attachments: null,
        };
        return {
          ...prev,
          open: true,
          loading: true,
          loadingKind: requestedComposeKind,
          prompt: trimmedPrompt,
          message: workingAssistant.content,
          choices: null,
          history: [...nextHistory, workingAssistant],
          threadId: resolvedThreadId,
          summaryContext: null,
          summaryResult: null,
          summaryOptions: null,
          summaryMessageId: null,
        };
      });

      const updateWorking = (content: string) => {
        setState((prev) => {
          const history = (prev.history ?? []).map((entry) =>
            entry.id === workingMessageId ? { ...entry, content } : entry,
          );
          const message = prev.history?.some((entry) => entry.id === workingMessageId)
            ? content
            : prev.message;
          return { ...prev, history, message };
        });
      };

      try {
          const payload = await callAiPrompt({
            message: trimmedPrompt,
            ...(resolvedOptions ? { options: resolvedOptions } : {}),
            ...(state.rawPost && replyMode !== "chat" ? { post: state.rawPost } : {}),
            ...(normalizedAttachments ? { attachments: normalizedAttachments } : {}),
            history: baseHistory,
            ...(threadIdForRequest ? { threadId: threadIdForRequest } : {}),
            ...(activeCapsuleId ? { capsuleId: activeCapsuleId } : {}),
          useContext: smartContextEnabled,
          stream: true,
          onStreamMessage: updateWorking,
        });
        setState((prev) => ({
          ...prev,
          history: (prev.history ?? []).filter((entry) => entry.id !== workingMessageId),
          loadingKind: null,
        }));
        handleAiResponse(trimmedPrompt, payload);
      } catch (error) {
        console.error("AI prompt failed", error);
        setState((prev) => resetStateWithPreference(prev));
      }
    },
    [activeCapsuleId, handleAiResponse, imageSettings, setState, smartContextEnabled, state.rawPost],
  );

  const runLogoHandoff = React.useCallback(
    async ({ prompt }: ImageLogoHandoff) => {
      const createdAt = new Date().toISOString();
      const workingAssistant: ComposerChatMessage = {
        id: safeRandomUUID(),
        role: "assistant",
        content: "Generating your visual...",
        createdAt,
        attachments: null,
      };
      setState((prev) => ({
        ...prev,
        open: true,
        loading: true,
        loadingKind: "image",
        prompt,
        message: workingAssistant.content,
        choices: null,
        history: [workingAssistant],
      }));
      try {
        const result = await requestImageGeneration(prompt, imageRequestOptions);
        const draft: ComposerDraft = {
          kind: "image",
          title: null,
          content: "",
          mediaUrl: result.url,
          mediaPrompt: prompt,
          poll: null,
        };
        const assistantMessage: ComposerChatMessage = {
          id: safeRandomUUID(),
          role: "assistant",
          content: "Generated a logo concept from your prompt.",
          createdAt: new Date().toISOString(),
          attachments: null,
        };
        setState((prev) => ({
          ...prev,
          open: true,
          loading: false,
          loadingKind: null,
          prompt,
          draft,
          rawPost: appendCapsuleContext(
            { kind: "image", mediaUrl: result.url, media_prompt: prompt, source: "ai-prompter" },
            activeCapsuleId,
          ),
          message: assistantMessage.content,
          choices: null,
          history: [assistantMessage],
          threadId: safeRandomUUID(),
        }));
      } catch (error) {
        console.error("Logo tool failed", error);
        setState((prev) => ({
          ...prev,
          open: true,
          loading: false,
          loadingKind: null,
          message: "Image generation failed. Tap retry to try again.",
          choices: null,
        }));
      }
    },
    [activeCapsuleId, imageRequestOptions, setState],
  );

  const runImageEditHandoff = React.useCallback(
    async ({ prompt, reference }: ImageEditHandoff) => {
      if (!reference?.url) return;
      const createdAt = new Date().toISOString();
      const workingAssistant: ComposerChatMessage = {
        id: safeRandomUUID(),
        role: "assistant",
        content: "Applying your edits...",
        createdAt,
        attachments: null,
      };
      setState((prev) => ({
        ...prev,
        open: true,
        loading: true,
        loadingKind: "image",
        prompt,
        message: workingAssistant.content,
        choices: null,
        history: [workingAssistant],
      }));
      try {
        const result = await requestImageEdit({
          imageUrl: reference.url,
          instruction: prompt,
          options: imageRequestOptions,
        });
        const draft: ComposerDraft = {
          kind: "image",
          title: null,
          content: "",
          mediaUrl: result.url,
          mediaPrompt: prompt,
          poll: null,
        };
        const assistantMessage: ComposerChatMessage = {
          id: safeRandomUUID(),
          role: "assistant",
          content: "Updated your image with those vibes.",
          createdAt: new Date().toISOString(),
          attachments: null,
        };
        setState((prev) => ({
          ...prev,
          open: true,
          loading: false,
          loadingKind: null,
          prompt,
          draft,
          rawPost: appendCapsuleContext(
            { kind: "image", mediaUrl: result.url, media_prompt: prompt, source: "ai-prompter" },
            activeCapsuleId,
          ),
          message: assistantMessage.content,
          choices: null,
          history: [assistantMessage],
          threadId: safeRandomUUID(),
        }));
      } catch (error) {
        console.error("Image edit tool failed", error);
        setState((prev) => ({
          ...prev,
          open: true,
          loading: false,
          loadingKind: null,
          message: "Image edit failed. Tap retry to try again.",
          choices: null,
        }));
      }
    },
    [activeCapsuleId, imageRequestOptions, setState],
  );

  const handlePrompterHandoff = React.useCallback(
    async (handoff: PrompterHandoff) => {
      switch (handoff.intent) {
        case "ai_prompt":
          await runAiPromptHandoff(handoff);
          return;
        case "image_logo":
          await runLogoHandoff(handoff);
          return;
        case "image_edit":
          await runImageEditHandoff(handoff);
          return;
        default:
          return;
      }
    },
    [runAiPromptHandoff, runLogoHandoff, runImageEditHandoff],
  );

  const close = React.useCallback(
    () => {
      endPreviewThemeVars();
      setState((prev) => resetStateWithPreference(prev));
    },
    [setState],
  );

  const previewThemePlan = React.useCallback(
    (plan: { summary: string; details?: string | null; source: "heuristic" | "ai"; variants: ThemeVariants }) => {
      endPreviewThemeVars();
      startPreviewThemeVars(plan.variants);
      setState((prev) => ({
        ...prev,
        themePreview: {
          summary: plan.summary,
          details: plan.details ?? null,
          source: plan.source,
          variants: plan.variants,
        },
      }));
    },
    [setState],
  );

  const applyThemePreview = React.useCallback(() => {
    setState((prev) => {
      const current = prev.themePreview;
      if (!current) return prev;
      applyThemeVars(current.variants);
      endPreviewThemeVars();
      return { ...prev, themePreview: null };
    });
  }, [setState]);

  const cancelThemePreview = React.useCallback(() => {
    endPreviewThemeVars();
    setState((prev) => ({ ...prev, themePreview: null }));
  }, [setState]);

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
          setState((prev) => resetStateWithPreference(prev));
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
          previewThemePlan({
            summary: heuristicPlan.summary,
            details: heuristicPlan.details ?? null,
            source: "heuristic",
            variants: heuristicPlan.variants,
          });
          setState((prev) => ({ ...prev, open: true }));
          return;
        }
        try {
          const response = await callStyler(action.prompt, envelopePayload);
          const normalized = normalizeThemeVariantsInput(response.variants);
          previewThemePlan({
            summary: response.summary,
            details: response.details ?? null,
            source: response.source,
            variants: normalized,
          });
          setState((prev) => ({ ...prev, open: true }));
        } catch (error) {
          console.error("Styler action failed", error);
        }
        return;
      }
      if (action.kind === "tool_poll") {
        await handlePrompterHandoff({
          intent: "ai_prompt",
          prompt: action.prompt,
          options: { prefer: "poll", extras: { replyMode: "draft" } },
        });
        return;
      }
      if (action.kind === "tool_logo") {
        await handlePrompterHandoff({ intent: "image_logo", prompt: action.prompt });
        return;
      }
      if (action.kind === "tool_image_edit") {
        const attachment = action.attachments?.[0];
        if (!attachment) return;
        await handlePrompterHandoff({ intent: "image_edit", prompt: action.prompt, reference: attachment });
        return;
      }
      if (action.kind === "post_ai") {
        const attachments = action.attachments && action.attachments.length ? action.attachments : undefined;
        await handlePrompterHandoff({
          intent: "ai_prompt",
          prompt: action.prompt,
          ...(attachments ? { attachments } : {}),
          options: { composeMode: action.mode, extras: { replyMode: "draft" } },
        });
        return;
      }
      if (action.kind === "generate") {
        const attachments = action.attachments && action.attachments.length ? action.attachments : undefined;
        await handlePrompterHandoff({
          intent: "ai_prompt",
          prompt: action.text,
          ...(attachments ? { attachments } : {}),
          options: { extras: { replyMode: "chat" } },
        });
        return;
      }
    },
    [activeCapsuleId, envelopePayload, handlePrompterHandoff, previewThemePlan, setState],
  );

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
      setState((prev) => resetStateWithPreference(prev));
      window.dispatchEvent(new CustomEvent("posts:refresh", { detail: { reason: "composer" } }));
    } catch (error) {
      console.error("Composer post failed", error);
      setState((prev) => ({ ...prev, loading: false }));
    }
  }, [
    state.draft,
    state.rawPost,
    author.name,
    author.avatar,
    activeCapsuleId,
    envelopePayload,
    setState,
  ]);

  const showSummary = React.useCallback(
    (
      result: SummaryResult,
      options: SummaryPresentationOptions,
      extras?: SummaryConversationExtras,
    ) => {
      const attachmentsForChat =
        extras?.attachments?.map((attachment) => mapPrompterAttachmentToChat(attachment)) ?? null;
      const messageId = safeRandomUUID();
      const assistantMessage: ComposerChatMessage = {
        id: messageId,
        role: "assistant",
        content: formatSummaryMessage(result, options),
        createdAt: new Date().toISOString(),
        attachments: attachmentsForChat && attachmentsForChat.length ? attachmentsForChat : null,
      };
      setState((prev) => ({
        ...prev,
        open: true,
        loading: false,
        prompt: "",
        message: null,
        choices: null,
        history: [assistantMessage],
        threadId: safeRandomUUID(),
        summaryContext: extras?.context ?? null,
        summaryResult: result,
        summaryOptions: options,
        summaryMessageId: messageId,
      }));
    },
    [setState],
  );

  const submitPrompt = React.useCallback(
    async (
      promptText: string,
      attachments?: PrompterAttachment[] | null,
      options?: PromptSubmitOptions,
    ) => {
      const trimmed = promptText.trim();
      if (!trimmed) return;
      const attachmentList = attachments && attachments.length ? attachments : undefined;
      const expectVideo = shouldExpectVideoResponse(trimmed, attachmentList ?? null);
      const expectImage =
        !expectVideo && (state.draft?.kind ?? "").toLowerCase() === "image";
      const preserveSummary = options?.preserveSummary ?? Boolean(state.summaryResult);
      const chatAttachments =
        attachmentList?.map((attachment) => mapPrompterAttachmentToChat(attachment)) ?? [];
      const pendingMessage: ComposerChatMessage = {
        id: safeRandomUUID(),
        role: "user",
        content: trimmed,
        createdAt: new Date().toISOString(),
        attachments: chatAttachments.length ? chatAttachments : null,
      };
      let previousHistory: ComposerChatMessage[] = [];
      let threadIdForRequest: string | null = null;
      setState((prev) => {
        const existingHistory = prev.history ?? [];
        previousHistory = existingHistory.slice();
        const lastEntry = existingHistory.length ? existingHistory[existingHistory.length - 1] : null;
        const nextHistory =
          lastEntry &&
          lastEntry.role === "user" &&
          lastEntry.content.trim().toLowerCase() === trimmed.toLowerCase()
            ? existingHistory
            : [...existingHistory, pendingMessage];
        const resolvedThreadId = prev.threadId ?? safeRandomUUID();
        threadIdForRequest = resolvedThreadId;
        let nextVideoStatus: ComposerVideoStatus = prev.videoStatus;
        if (expectVideo) {
          nextVideoStatus = {
            state: "running",
            runId: prev.videoStatus.state === "running" ? prev.videoStatus.runId : null,
            prompt: trimmed,
            attachments: attachmentList ?? null,
            error: null,
            message: "Rendering your clip...",
            memoryId: prev.videoStatus.memoryId ?? null,
          };
        } else if (prev.videoStatus.state !== "idle") {
          nextVideoStatus = createIdleVideoStatus();
        }
        return {
          ...prev,
          loading: true,
          loadingKind: expectVideo ? null : expectImage ? "image" : null,
          prompt: trimmed,
          message: null,
          choices: null,
          history: nextHistory,
          threadId: resolvedThreadId,
          summaryContext: preserveSummary ? prev.summaryContext : null,
          summaryResult: preserveSummary ? prev.summaryResult : null,
          summaryOptions: preserveSummary ? prev.summaryOptions : null,
          summaryMessageId: preserveSummary ? prev.summaryMessageId : null,
          videoStatus: nextVideoStatus,
        };
      });
      try {
        const requestOptions: Record<string, unknown> = {
          imageQuality: imageSettings.quality,
        };
        if (options?.mode === "chatOnly") {
          requestOptions.replyMode = "chat";
        }
        const payload = await callAiPrompt({
          message: trimmed,
          ...(Object.keys(requestOptions).length ? { options: requestOptions } : {}),
          ...(state.rawPost && options?.mode !== "chatOnly" ? { post: state.rawPost } : {}),
          ...(attachmentList ? { attachments: attachmentList } : {}),
          history: previousHistory,
          ...(threadIdForRequest ? { threadId: threadIdForRequest } : {}),
          ...(activeCapsuleId ? { capsuleId: activeCapsuleId } : {}),
          useContext: smartContextEnabled,
        });
        handleAiResponse(trimmed, payload, options?.mode ?? "default");
      } catch (error) {
        console.error("Composer prompt submit failed", error);
        const errorMessage =
          error instanceof Error && error.message ? error.message.trim() : "Capsule AI ran into an unexpected error.";
        setState((prev) => {
          const fallbackVideoStatus = expectVideo
            ? {
                state: "failed" as const,
                runId: prev.videoStatus.runId,
                prompt: trimmed,
                attachments: prev.videoStatus.attachments ?? (attachmentList ?? null) ?? null,
                error: errorMessage,
                message: errorMessage,
                memoryId: prev.videoStatus.memoryId ?? null,
              }
            : prev.videoStatus.state !== "idle"
              ? createIdleVideoStatus()
              : prev.videoStatus;
          return {
            ...prev,
            loading: false,
            loadingKind: null,
            history: previousHistory,
            videoStatus: fallbackVideoStatus,
          };
        });
      }
    },
    [
      activeCapsuleId,
      handleAiResponse,
      imageSettings,
      setState,
      state.rawPost,
      state.draft?.kind,
      smartContextEnabled,
      state.summaryResult,
    ],
  );

  const retryVideo = React.useCallback(() => {
    const status = state.videoStatus;
    if (status.state !== "failed" || !status.prompt) return;
    void submitPrompt(status.prompt, status.attachments ?? undefined);
  }, [state.videoStatus, submitPrompt]);

  const forceChoiceInternal = React.useCallback(
    async (key: string) => {
      if (!state.prompt) return;
      setState((prev) => ({ ...prev, loading: true }));
      try {
        const payload = await callAiPrompt({
          message: state.prompt,
          options: { force: key },
          ...(state.rawPost ? { post: state.rawPost } : {}),
          history: state.history,
          ...(state.threadId ? { threadId: state.threadId } : {}),
          ...(activeCapsuleId ? { capsuleId: activeCapsuleId } : {}),
          useContext: smartContextEnabled,
        });
        handleAiResponse(state.prompt, payload);
      } catch (error) {
        console.error("Composer force choice failed", error);
        setState((prev) => ({ ...prev, loading: false }));
      }
    },
    [
      activeCapsuleId,
      handleAiResponse,
      setState,
      state.history,
      state.prompt,
      state.rawPost,
      state.threadId,
      smartContextEnabled,
    ],
  );

  const updateDraft = React.useCallback((draft: ComposerDraft) => {
    setState((prev) => ({ ...prev, draft }));
  }, [setState]);

  const sidebarData = React.useMemo<ComposerSidebarData>(() => {
    const recentChats = sidebarStore.recentChats.map((entry) => {
      const caption = describeRecentCaption(entry);
      const snippet = describeRecentSnippet(entry);
      const combined = snippet ? `${caption} - ${snippet}` : caption;
      return {
        id: entry.id,
        title: describeRecentTitle(entry),
        caption: truncateLabel(combined, 120),
      };
    });

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
      feedTarget,
      activeCapsuleId,
      smartContextEnabled,
      imageSettings,
      updateImageSettings,
      handlePrompterAction,
      handlePrompterHandoff,
      close,
      post,
      submitPrompt,
      showSummary,
      updateDraft,
      sidebar: sidebarData,
      selectRecentChat,
      selectDraft: selectSavedDraft,
      createProject,
      selectProject,
      saveDraft,
      retryVideo,
      saveCreation,
      setSmartContextEnabled,
      applyThemePreview,
      cancelThemePreview,
    };
    if (forceChoice) {
      base.forceChoice = forceChoice;
    }
    return base;
  }, [
    state,
    feedTarget,
    activeCapsuleId,
    handlePrompterAction,
    handlePrompterHandoff,
    close,
    post,
    submitPrompt,
    showSummary,
    forceChoice,
    updateDraft,
    sidebarData,
    selectRecentChat,
    selectSavedDraft,
    createProject,
    selectProject,
    saveDraft,
    retryVideo,
    saveCreation,
    setSmartContextEnabled,
    smartContextEnabled,
    imageSettings,
    updateImageSettings,
    applyThemePreview,
    cancelThemePreview,
  ]);

  return <ComposerContext.Provider value={contextValue}>{children}</ComposerContext.Provider>;
}

export function ComposerProvider({ children }: { children: React.ReactNode }) {
  const { user } = useCurrentUser();
  return (
    <ComposerSidebarProvider userId={user?.id ?? null}>
      <ComposerSmartContextProvider>
        <ComposerSessionProvider user={user}>{children}</ComposerSessionProvider>
      </ComposerSmartContextProvider>
    </ComposerSidebarProvider>
  );
}

export function AiComposerRoot() {
  const {
    state,
    smartContextEnabled,
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
    retryVideo,
    saveCreation,
    setSmartContextEnabled,
    applyThemePreview,
    cancelThemePreview,
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
      loadingKind={state.loadingKind}
      draft={state.draft}
      prompt={state.prompt}
      message={state.message}
      choices={state.choices}
      history={state.history}
      summaryContext={state.summaryContext}
      summaryResult={state.summaryResult}
      summaryOptions={state.summaryOptions}
      summaryMessageId={state.summaryMessageId}
      videoStatus={state.videoStatus}
      saveStatus={state.saveStatus}
      smartContextEnabled={smartContextEnabled}
      contextSnapshot={state.contextSnapshot}
      themePreview={
        state.themePreview
          ? {
              summary: state.themePreview.summary,
              details: state.themePreview.details ?? null,
              source: state.themePreview.source,
            }
          : null
      }
      onSmartContextChange={setSmartContextEnabled}
      onChange={updateDraft}
      onClose={close}
      onPost={post}
      onPrompt={submitPrompt}
      sidebar={sidebar}
      onSelectRecentChat={selectRecentChat}
      onSelectDraft={selectDraft}
      onCreateProject={createProject}
      onSelectProject={selectProject}
      onApplyThemePreview={applyThemePreview}
      onCancelThemePreview={cancelThemePreview}
      onSave={saveDraft}
      onRetryVideo={retryVideo}
      onSaveCreation={saveCreation}
      {...forceHandlers}
    />
  );
}
