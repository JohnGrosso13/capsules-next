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
import { ensurePollStructure, type ComposerDraft } from "@/lib/composer/draft";
import {
  sanitizeComposerChatHistory,
  type ComposerChatAttachment,
  type ComposerChatMessage,
} from "@/lib/composer/chat-types";
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
  promptResponseSchema,
  stylerResponseSchema,
  type PromptResponse,
  type StylerResponse,
} from "@/shared/schemas/ai";
import type { SummaryResult, SummaryTarget } from "@/types/summary";

const ATTACHMENT_CONTEXT_LIMIT = 2;
const ATTACHMENT_CONTEXT_CHAR_LIMIT = 2000;
const TEXT_MIME_PREFIXES = ["text/", "application/json", "application/xml", "application/yaml"];
const TEXT_EXTENSIONS = new Set([
  "txt",
  "md",
  "markdown",
  "csv",
  "tsv",
  "json",
  "yaml",
  "yml",
  "xml",
  "log",
  "ini",
]);

function extractExtension(name: string | undefined): string | null {
  if (!name) return null;
  const trimmed = name.trim();
  if (!trimmed.length) return null;
  const parts = trimmed.split(".");
  if (parts.length <= 1) return null;
  const ext = parts.pop();
  return ext ? ext.toLowerCase() : null;
}

function isLikelyTextAttachment(attachment: PrompterAttachment): boolean {
  const mime = (attachment.mimeType ?? "").toLowerCase();
  if (TEXT_MIME_PREFIXES.some((prefix) => mime.startsWith(prefix))) {
    return true;
  }
  const extension = extractExtension(attachment.name);
  if (extension && TEXT_EXTENSIONS.has(extension)) {
    return true;
  }
  return false;
}

async function buildAttachmentContext(
  attachments?: PrompterAttachment[] | null,
): Promise<Array<{ id: string; name: string; text: string }>> {
  if (!attachments || !attachments.length) return [];
  const collected: Array<{ id: string; name: string; text: string }> = [];

  for (const attachment of attachments) {
    if (collected.length >= ATTACHMENT_CONTEXT_LIMIT) break;
    const role = attachment.role ?? "reference";
    if (role !== "reference") continue;
    if (!attachment.url) continue;
    const excerpt =
      typeof attachment.excerpt === "string" && attachment.excerpt.trim().length
        ? attachment.excerpt.trim()
        : null;
    if (excerpt) {
      collected.push({
        id: attachment.id,
        name: attachment.name,
        text: excerpt.slice(0, ATTACHMENT_CONTEXT_CHAR_LIMIT),
      });
      continue;
    }
    if (!isLikelyTextAttachment(attachment)) continue;
    try {
      const response = await fetch(attachment.url);
      if (!response.ok) continue;
      const raw = await response.text();
      const snippet = raw.slice(0, ATTACHMENT_CONTEXT_CHAR_LIMIT).trim();
      if (!snippet.length) continue;
      collected.push({
        id: attachment.id,
        name: attachment.name,
        text: snippet,
      });
    } catch {
      // Ignore fetch failures when building attachment context
    }
  }

  return collected;
}

type PollMergeOptions = {
  preserveOptions?: boolean;
};

function mergePollStructures(
  prevDraft: ComposerDraft | null,
  nextDraft: ComposerDraft | null,
  options?: PollMergeOptions,
): { question: string; options: string[] } | null {
  const prevPoll = prevDraft?.poll ? ensurePollStructure(prevDraft) : null;
  const nextPoll = nextDraft?.poll ? ensurePollStructure(nextDraft) : null;
  if (!prevPoll && !nextPoll) {
    return null;
  }
  if (!prevPoll) {
    return nextPoll ? { question: nextPoll.question, options: [...nextPoll.options] } : null;
  }
  if (!nextPoll) {
    return { question: prevPoll.question, options: [...prevPoll.options] };
  }
  if (options?.preserveOptions && prevPoll) {
    const question =
      nextPoll.question.trim().length > 0 ? nextPoll.question : prevPoll.question;
    const preserved = [...prevPoll.options];
    while (preserved.length < 2) {
      preserved.push("");
    }
    return { question, options: preserved };
  }
  const question = nextPoll.question.trim().length > 0 ? nextPoll.question : prevPoll.question;
  const length = Math.max(prevPoll.options.length, nextPoll.options.length, 2);
  const mergedOptions = Array.from({ length }, (_, index) => {
    const nextValueRaw = nextPoll.options[index] ?? "";
    const nextValue = nextValueRaw.trim();
    if (nextValue.length > 0) {
      return nextPoll.options[index]!;
    }
    return prevPoll.options[index] ?? "";
  });
  while (mergedOptions.length < 2) {
    mergedOptions.push("");
  }
  return { question, options: mergedOptions };
}

type DraftMergeOptions = {
  preservePollOptions?: boolean;
};

function mergeComposerDrafts(
  prevDraft: ComposerDraft | null,
  nextDraft: ComposerDraft,
  options?: DraftMergeOptions,
): ComposerDraft {
  const preservePollOptions = options?.preservePollOptions ?? false;
  if (!prevDraft) {
    const poll = mergePollStructures(null, nextDraft, { preserveOptions: preservePollOptions });
    return poll ? { ...nextDraft, poll } : nextDraft;
  }

  const prevKind = (prevDraft.kind ?? "").toLowerCase();
  const nextKind = (nextDraft.kind ?? "").toLowerCase();
  const mergedPoll = mergePollStructures(prevDraft, nextDraft, {
    preserveOptions: preservePollOptions,
  });

  if (nextKind === "poll" && prevKind !== "poll") {
    const merged: ComposerDraft = {
      ...prevDraft,
      poll: mergedPoll ?? prevDraft.poll ?? nextDraft.poll ?? null,
    };
    if (Array.isArray(nextDraft.suggestions) && nextDraft.suggestions.length) {
      merged.suggestions = nextDraft.suggestions;
    }
    return merged;
  }

  if (nextKind === "poll" && prevKind === "poll") {
    return {
      ...prevDraft,
      ...nextDraft,
      kind: "poll",
      poll: mergedPoll ?? nextDraft.poll ?? prevDraft.poll ?? null,
    };
  }

  const merged: ComposerDraft = {
    ...prevDraft,
    ...nextDraft,
  };
  merged.kind = nextDraft.kind ?? prevDraft.kind;
  if (mergedPoll || prevDraft.poll || nextDraft.poll) {
    merged.poll = mergedPoll ?? nextDraft.poll ?? prevDraft.poll ?? null;
  }
  return merged;
}

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

type SummaryPresentationOptions = {
  title?: string | null;
  sourceLabel?: string | null;
  sourceType: SummaryTarget;
};

function formatSummaryMessage(result: SummaryResult, options: SummaryPresentationOptions): string {
  const lines: string[] = [];
  const heading = options.sourceLabel?.trim().length
    ? `Summary: ${options.sourceLabel}`
    : "Summary";
  lines.push(heading);
  lines.push("");
  lines.push(result.summary);
  if (result.highlights.length) {
    lines.push("");
    lines.push("Highlights:");
    result.highlights.forEach((item) => lines.push(`• ${item}`));
  }
  if (result.insights.length) {
    lines.push("");
    lines.push("Insights:");
    result.insights.forEach((item) => lines.push(`• ${item}`));
  }
  if (result.nextActions.length) {
    lines.push("");
    lines.push("Next steps:");
    result.nextActions.forEach((item) => lines.push(`• ${item}`));
  }
  if (result.postPrompt || result.postTitle) {
    lines.push("");
    lines.push("Post idea:");
    if (result.postTitle && result.postPrompt) {
      lines.push(`• ${result.postTitle} — ${result.postPrompt}`);
    } else if (result.postPrompt) {
      lines.push(`• ${result.postPrompt}`);
    } else if (result.postTitle) {
      lines.push(`• ${result.postTitle}`);
    }
  }
  if (result.hashtags.length) {
    lines.push("");
    lines.push(`Hashtags: ${result.hashtags.join(" ")}`);
  }
  return lines.join("\n").trim();
}

function buildSummaryDraftContent(result: SummaryResult): string {
  const sections: string[] = [result.summary];
  if (result.highlights.length) {
    sections.push("");
    result.highlights.forEach((item) => sections.push(`• ${item}`));
  }
  if (result.insights.length) {
    sections.push("");
    result.insights.forEach((item) => sections.push(`• ${item}`));
  }
  if (result.nextActions.length) {
    sections.push("");
    result.nextActions.forEach((item) => sections.push(`• ${item}`));
  }
  if (result.hashtags.length) {
    sections.push("");
    sections.push(result.hashtags.join(" "));
  }
  return sections.join("\n").trim();
}

async function callAiPrompt(
  message: string,
  options?: Record<string, unknown>,
  post?: Record<string, unknown>,
  attachments?: PrompterAttachment[],
  history?: ComposerChatMessage[],
  threadId?: string | null,
  capsuleId?: string | null,
): Promise<PromptResponse> {
  const contextSnippets = await buildAttachmentContext(attachments);
  let requestMessage = message;
  if (contextSnippets.length) {
    const contextText = contextSnippets
      .map(({ name, text }) => `Attachment "${name}":\n${text}`)
      .join("\n\n");
    requestMessage = `${message}\n\n---\nAttachment context provided:\n${contextText}`;
  }

  const body: Record<string, unknown> = { message: requestMessage };
  if (options && Object.keys(options).length) body.options = options;
  if (post) body.post = post;
  if (attachments && attachments.length) {
    const excerptMap = new Map(contextSnippets.map(({ id, text }) => [id, text]));
    body.attachments = attachments.map((attachment) => ({
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
      excerpt: attachment.excerpt ?? excerptMap.get(attachment.id) ?? null,
    }));
  }
  if (contextSnippets.length) {
    body.context = contextSnippets;
  }
  if (history && history.length) {
    body.history = history.map(({ attachments, ...rest }) => {
      if (Array.isArray(attachments) && attachments.length) {
        return { ...rest, attachments };
      }
      return rest;
    });
  }
  if (threadId) {
    body.threadId = threadId;
  }
  if (capsuleId) {
    body.capsuleId = capsuleId;
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
  return promptResponseSchema.parse(json);
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

type RemoteConversationSummary = {
  threadId: string;
  prompt: string;
  message: string | null;
  updatedAt: string;
  draft: Record<string, unknown> | null;
  rawPost: Record<string, unknown> | null;
  history: ComposerChatMessage[];
};

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
  return `${countLabel} · ${relative}`;
}

function describeRecentSnippet(entry: ComposerStoredRecentChat): string | null {
  const history = Array.isArray(entry.history) ? entry.history : [];
  for (let index = history.length - 1; index >= 0; index -= 1) {
    const message = history[index];
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
  history: ComposerChatMessage[];
  threadId: string | null;
  clarifier: ClarifierState | null;
};

type ClarifierState = {
  questionId: string;
  question: string;
  rationale: string | null;
  suggestions: string[];
  styleTraits: string[];
};

type ComposerContextValue = {
  state: ComposerState;
  feedTarget: FeedTarget;
  activeCapsuleId: string | null;
  handlePrompterAction(action: PrompterAction): void;
  close(): void;
  post(): Promise<void>;
  submitPrompt(prompt: string, attachments?: PrompterAttachment[] | null): Promise<void>;
  showSummary(result: SummaryResult, options: SummaryPresentationOptions): void;
  answerClarifier(answer: string): void;
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
  history: [],
  threadId: null,
  clarifier: null,
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function normalizeCapsuleId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return UUID_PATTERN.test(trimmed) ? trimmed : null;
}

function mergeComposerRawPost(
  prevRaw: Record<string, unknown> | null,
  nextRaw: Record<string, unknown> | null,
  draft: ComposerDraft,
): Record<string, unknown> {
  const merged: Record<string, unknown> = { ...(prevRaw ?? {}) };
  if (nextRaw) {
    for (const [key, value] of Object.entries(nextRaw)) {
      if (value === undefined) continue;
      merged[key] = value;
    }
  }

  if (typeof draft.kind === "string" && draft.kind.trim().length) {
    merged.kind = draft.kind;
  }
  if (typeof draft.title === "string") {
    merged.title = draft.title;
  } else if (draft.title === null) {
    merged.title = null;
  }

  if (typeof draft.content === "string") {
    merged.content = draft.content;
  }

  if (typeof draft.mediaUrl === "string" && draft.mediaUrl.trim().length) {
    merged.mediaUrl = draft.mediaUrl;
    merged.media_url = draft.mediaUrl;
  } else if (draft.mediaUrl === null) {
    delete merged.mediaUrl;
    delete merged.media_url;
  }

  if (typeof draft.mediaPrompt === "string" && draft.mediaPrompt.trim().length) {
    merged.mediaPrompt = draft.mediaPrompt;
    merged.media_prompt = draft.mediaPrompt;
  } else if (draft.mediaPrompt === null) {
    delete merged.mediaPrompt;
    delete merged.media_prompt;
  }

  if (draft.poll) {
    const structured = ensurePollStructure(draft);
    merged.poll = {
      question: structured.question,
      options: [...structured.options],
    };
  } else if (!draft.poll) {
    delete merged.poll;
  }

  return merged;
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

  React.useEffect(() => {
    if (!user) return;
    let cancelled = false;
    const loadRemoteConversations = async () => {
      try {
        const response = await fetch("/api/ai/conversations", {
          method: "GET",
          credentials: "include",
        });
        if (!response.ok || cancelled) return;
        const payload = (await response.json().catch(() => null)) as {
          conversations?: RemoteConversationSummary[];
        } | null;
        const conversations = payload?.conversations;
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
              draft: cloneData(normalizedDraft),
              rawPost: conversation.rawPost ? cloneData(conversation.rawPost) : null,
              createdAt: conversation.updatedAt,
              updatedAt: conversation.updatedAt,
              history: cloneData(history),
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
  }, [updateSidebarStore, user]);

  const recordRecentChat = React.useCallback(
    (input: {
      prompt: string;
      message: string | null;
      draft: ComposerDraft;
      rawPost: Record<string, unknown> | null;
      history: ComposerChatMessage[];
      threadId: string | null;
    }) => {
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
          draft: cloneData(input.draft),
          rawPost: input.rawPost ? cloneData(input.rawPost) : null,
          createdAt,
          updatedAt: now,
          history: cloneData(historySlice),
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
        const sanitizedDraft = cloneData(draft);
        const sanitizedRawPost = rawPost ? cloneData(rawPost) : null;
        const historySlice = cloneData(history.slice(-20));
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
      history: cloneData(entry.history ?? []),
      threadId: entry.threadId ?? null,
      clarifier: null,
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
      history: cloneData(entry.history ?? []),
      threadId: entry.threadId ?? entry.id ?? null,
      clarifier: null,
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
    (prompt: string, payload: PromptResponse) => {
      if (payload.action === "clarify_image_prompt") {
        const normalizedHistory = sanitizeComposerChatHistory(payload.history ?? []);
        setState((prev) => {
          const nextThreadId = payload.threadId ?? prev.threadId ?? safeRandomUUID();
          const historyForState =
            normalizedHistory.length > 0 ? normalizedHistory : prev.history ?? [];
          return {
            ...prev,
            open: true,
            loading: false,
            prompt,
            message: payload.question,
            choices: null,
            history: historyForState,
            threadId: nextThreadId,
            clarifier: {
              questionId: payload.questionId,
              question: payload.question,
              rationale: payload.rationale ?? null,
              suggestions: [...(payload.suggestions ?? [])],
              styleTraits: [...(payload.styleTraits ?? [])],
            },
          };
        });
        console.info("image_clarifier_question_displayed", {
          questionId: payload.questionId,
          suggestions: payload.suggestions ?? [],
          styleTraits: payload.styleTraits ?? [],
        });
        return;
      }

      const rawSource = (payload.post ?? {}) as Record<string, unknown>;
      const rawPost = appendCapsuleContext({ ...rawSource }, activeCapsuleId);
      const normalizedHistory = sanitizeComposerChatHistory(payload.history ?? []);
      const messageText = payload.message ?? null;
      let recordedHistory: ComposerChatMessage[] = [];
      let recordedThreadId: string | null = null;
      let resolvedQuestionId: string | null = null;
      let recordedDraft: ComposerDraft | null = null;
      let recordedRawPost: Record<string, unknown> | null = null;
      setState((prev) => {
        const nextThreadId = payload.threadId ?? prev.threadId ?? safeRandomUUID();
        const historyForState =
          normalizedHistory.length > 0 ? normalizedHistory : prev.history ?? [];
        recordedHistory = historyForState;
        recordedThreadId = nextThreadId;
        if (prev.clarifier?.questionId) {
          resolvedQuestionId = prev.clarifier.questionId;
        }
        const preserveOptions = shouldPreservePollOptions(prompt, prev.draft ?? null);
        const baseDraft = normalizeDraftFromPost(rawPost);
        const mergedDraft = mergeComposerDrafts(prev.draft, baseDraft, {
          preservePollOptions: preserveOptions,
        });
        recordedDraft = mergedDraft;
        const mergedRawPost = mergeComposerRawPost(prev.rawPost ?? null, rawPost, mergedDraft);
        recordedRawPost = mergedRawPost;
        return {
          open: true,
          loading: false,
          prompt,
          draft: mergedDraft,
          rawPost: mergedRawPost,
          message: messageText,
          choices: payload.choices ?? null,
          history: historyForState,
          threadId: nextThreadId,
          clarifier: null,
        };
      });
      if (resolvedQuestionId) {
        console.info("image_clarifier_resolved", {
          questionId: resolvedQuestionId,
          prompt,
        });
      }
      recordRecentChat({
        prompt,
        message: messageText,
        draft: recordedDraft ?? normalizeDraftFromPost(rawPost),
        rawPost: recordedRawPost,
        history: recordedHistory,
        threadId: recordedThreadId,
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
      const pendingMessage: ComposerChatMessage = {
        id: safeRandomUUID(),
        role: "user",
        content: prompt,
        createdAt: new Date().toISOString(),
        attachments: null,
      };
      let baseHistory: ComposerChatMessage[] = [];
      let threadIdForRequest: string | null = null;
      setState((prev) => {
        const existingHistory = prev.history ?? [];
        baseHistory = existingHistory.slice();
        const resolvedThreadId = prev.threadId ?? safeRandomUUID();
        threadIdForRequest = resolvedThreadId;
        return {
          ...prev,
          open: true,
          loading: true,
          prompt,
          message: null,
          choices: null,
          history: [...existingHistory, pendingMessage],
          threadId: resolvedThreadId,
          clarifier: null,
        };
      });
      try {
        const payload = await callAiPrompt(
          prompt,
          { prefer: "poll" },
          undefined,
          undefined,
          baseHistory,
          threadIdForRequest,
          activeCapsuleId,
        );
        handleAiResponse(prompt, payload);
      } catch (error) {
        console.error("Poll tool failed", error);
        setState((prev) => ({
          ...prev,
          loading: false,
          history: baseHistory,
        }));
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
          clarifier: null,
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
          const assistantMessage: ComposerChatMessage = {
            id: safeRandomUUID(),
            role: "assistant",
            content: "Generated a logo concept from your prompt.",
            createdAt: new Date().toISOString(),
            attachments: null,
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
            message: assistantMessage.content,
            choices: null,
            history: [assistantMessage],
            threadId: safeRandomUUID(),
            clarifier: null,
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
          clarifier: null,
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
          const assistantMessage: ComposerChatMessage = {
            id: safeRandomUUID(),
            role: "assistant",
            content: "Updated your image with those vibes.",
            createdAt: new Date().toISOString(),
            attachments: null,
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
            message: assistantMessage.content,
            choices: null,
            history: [assistantMessage],
            threadId: safeRandomUUID(),
            clarifier: null,
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
      const createdAt = new Date().toISOString();
      const attachmentForChat =
        action.attachments?.map((attachment) => mapPrompterAttachmentToChat(attachment)) ?? [];
      const pendingMessage: ComposerChatMessage = {
        id: safeRandomUUID(),
        role: "user",
        content: prompt,
        createdAt,
        attachments: attachmentForChat.length ? attachmentForChat : null,
      };
      let baseHistory: ComposerChatMessage[] = [];
      let threadIdForRequest: string | null = null;
      setState((prev) => {
        const existingHistory = prev.history ?? [];
        baseHistory = existingHistory.slice();
        const resolvedThreadId = prev.threadId ?? safeRandomUUID();
        threadIdForRequest = resolvedThreadId;
        return {
          ...prev,
          open: true,
          loading: true,
          prompt,
          message: null,
          choices: null,
          history: [...existingHistory, pendingMessage],
          threadId: resolvedThreadId,
          clarifier: null,
        };
      });
      try {
        const payload = await callAiPrompt(
          prompt,
          composeOptions,
          undefined,
          action.attachments,
          baseHistory,
          threadIdForRequest,
          activeCapsuleId,
        );
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

  const showSummary = React.useCallback(
    (result: SummaryResult, options: SummaryPresentationOptions) => {
      const draftTitle = result.postTitle ?? options.title ?? null;
      const content = buildSummaryDraftContent(result);
      const assistantMessage: ComposerChatMessage = {
        id: safeRandomUUID(),
        role: "assistant",
        content: formatSummaryMessage(result, options),
        createdAt: new Date().toISOString(),
        attachments: null,
      };
      const suggestionList: string[] = [];
      if (result.nextActions.length) {
        suggestionList.push(...result.nextActions);
      }
      if (result.postPrompt) {
        suggestionList.push(result.postPrompt);
      }
      const draft: ComposerDraft = {
        kind: "text",
        title: draftTitle,
        content,
        mediaUrl: null,
        mediaPrompt: null,
        poll: null,
      };
      if (suggestionList.length) {
        draft.suggestions = suggestionList;
      }
      const rawPostPayload: Record<string, unknown> = {
        kind: "text",
        title: draftTitle,
        content,
        hashtags: result.hashtags.length ? result.hashtags : undefined,
        summary_source: options.sourceType,
        summary_title: options.sourceLabel ?? options.title ?? null,
        tone: result.tone,
      };
      const rawPostWithContext = appendCapsuleContext(rawPostPayload, activeCapsuleId);
      setState({
        open: true,
        loading: false,
        prompt: "",
        draft,
        rawPost: rawPostWithContext,
        message: assistantMessage.content,
        choices: null,
        history: [assistantMessage],
        threadId: safeRandomUUID(),
        clarifier: null,
      });
    },
    [activeCapsuleId],
  );

  const submitPrompt = React.useCallback(
    async (promptText: string, attachments?: PrompterAttachment[] | null) => {
      const trimmed = promptText.trim();
      if (!trimmed) return;
      const attachmentList = attachments && attachments.length ? attachments : undefined;
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
        const resolvedThreadId = prev.threadId ?? safeRandomUUID();
        threadIdForRequest = resolvedThreadId;
        return {
          ...prev,
          loading: true,
          prompt: trimmed,
          message: null,
          choices: null,
          history: [...existingHistory, pendingMessage],
          threadId: resolvedThreadId,
        };
      });
      try {
        const clarifierOption =
          state.clarifier && state.clarifier.questionId
            ? {
                clarifier: {
                  questionId: state.clarifier.questionId,
                  answer: trimmed,
                },
              }
            : undefined;
        if (clarifierOption?.clarifier) {
          console.info("image_clarifier_answer_submitted", {
            questionId: clarifierOption.clarifier.questionId,
            answer: clarifierOption.clarifier.answer,
          });
        }
        const payload = await callAiPrompt(
          trimmed,
          clarifierOption,
          state.rawPost ?? undefined,
          attachmentList,
          previousHistory,
          threadIdForRequest,
          activeCapsuleId,
        );
        handleAiResponse(trimmed, payload);
      } catch (error) {
        console.error("Composer prompt submit failed", error);
        setState((prev) => ({
          ...prev,
          loading: false,
          history: previousHistory,
        }));
      }
    },
    [activeCapsuleId, handleAiResponse, state.clarifier, state.rawPost],
  );

  const answerClarifier = React.useCallback(
    (answer: string) => {
      const trimmed = answer.trim();
      if (!trimmed) return;
      console.info("image_clarifier_suggestion_selected", {
        questionId: state.clarifier?.questionId ?? null,
        answer: trimmed,
      });
      void submitPrompt(trimmed);
    },
    [state.clarifier?.questionId, submitPrompt],
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
          undefined,
          state.history,
          state.threadId,
          activeCapsuleId,
        );
        handleAiResponse(state.prompt, payload);
      } catch (error) {
        console.error("Composer force choice failed", error);
        setState((prev) => ({ ...prev, loading: false }));
      }
    },
    [activeCapsuleId, handleAiResponse, state.history, state.prompt, state.rawPost, state.threadId],
  );

  const updateDraft = React.useCallback((draft: ComposerDraft) => {
    setState((prev) => ({ ...prev, draft }));
  }, []);

  const sidebarData = React.useMemo<ComposerSidebarData>(() => {
    const recentChats = sidebarStore.recentChats.map((entry) => {
      const caption = describeRecentCaption(entry);
      const snippet = describeRecentSnippet(entry);
      const combined = snippet ? `${caption} · ${snippet}` : caption;
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
      handlePrompterAction,
      close,
      post,
      submitPrompt,
      showSummary,
      answerClarifier,
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
    feedTarget,
    activeCapsuleId,
    handlePrompterAction,
    close,
    post,
    submitPrompt,
    showSummary,
    answerClarifier,
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
    answerClarifier,
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
      history={state.history}
      clarifier={state.clarifier}
      onChange={updateDraft}
      onClose={close}
      onPost={post}
      onPrompt={submitPrompt}
      onClarifierRespond={answerClarifier}
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
