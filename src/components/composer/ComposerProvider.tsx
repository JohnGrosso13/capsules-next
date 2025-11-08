"use client";

import * as React from "react";
import type { AuthClientUser } from "@/ports/auth-client";
import { useCurrentUser } from "@/services/auth/client";

import { AiComposerDrawer } from "@/components/ai-composer";
import type { ComposerChoice } from "@/components/composer/ComposerForm";
import type { PrompterAction, PrompterAttachment } from "@/components/ai-prompter-stage";
import type { PrompterHandoff } from "@/components/composer/prompter-handoff";
import { applyThemeVars } from "@/lib/theme";
import { resolveStylerHeuristicPlan } from "@/lib/theme/styler-heuristics";
import { safeRandomUUID } from "@/lib/random";
import { ensurePollStructure, type ComposerDraft } from "@/lib/composer/draft";
import { useComposerCore } from "@/components/composer/state/useComposerCore";
import { useSmartContextPersistence } from "@/components/composer/state/useSmartContextPersistence";
import { useRemoteConversations } from "@/components/composer/state/useRemoteConversations";
import { cloneComposerData } from "@/components/composer/state/utils";
import { useSidebarStore } from "@/components/composer/state/useSidebarStore";
import {
  sanitizeComposerChatHistory,
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
import { normalizeDraftFromPost } from "@/lib/composer/normalizers";
import { buildPostPayload } from "@/lib/composer/payload";
import {
  promptResponseSchema,
  stylerResponseSchema,
  type PromptResponse,
  type StylerResponse,
} from "@/shared/schemas/ai";
import type { SummaryResult } from "@/types/summary";
import type { SummaryConversationContext, SummaryPresentationOptions } from "@/lib/composer/summary-context";
import { detectVideoIntent } from "@/shared/ai/video-intent";

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
async function callAiPrompt(
  message: string,
  options?: Record<string, unknown>,
  post?: Record<string, unknown>,
  attachments?: PrompterAttachment[],
  history?: ComposerChatMessage[],
  threadId?: string | null,
  capsuleId?: string | null,
  useContext?: boolean,
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
  body.useContext = useContext !== false;

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
  return `${countLabel} · ${relative}`;
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

export type ComposerVideoStatus = {
  state: "idle" | "running" | "succeeded" | "failed";
  runId: string | null;
  prompt: string | null;
  attachments: PrompterAttachment[] | null;
  error: string | null;
  message: string | null;
  memoryId?: string | null;
};

export type ComposerSaveStatus = {
  state: "idle" | "saving" | "succeeded" | "failed";
  message: string | null;
};

export type ComposerMemorySavePayload = {
  title: string;
  description: string;
  kind: string;
  mediaUrl: string;
  mediaType: string | null;
  downloadUrl?: string | null;
  thumbnailUrl?: string | null;
  prompt?: string | null;
  durationSeconds?: number | null;
  muxPlaybackId?: string | null;
  muxAssetId?: string | null;
  runId?: string | null;
  tags?: string[] | null;
  metadata?: Record<string, unknown> | null;
};

export type ComposerSaveRequest = {
  target: "draft" | "attachment";
  payload: ComposerMemorySavePayload;
};

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
  prompt: string;
  draft: ComposerDraft | null;
  rawPost: Record<string, unknown> | null;
  message: string | null;
  choices: ComposerChoice[] | null;
  history: ComposerChatMessage[];
  threadId: string | null;
  clarifier: ClarifierState | null;
  summaryContext: SummaryConversationContext | null;
  summaryResult: SummaryResult | null;
  summaryOptions: SummaryPresentationOptions | null;
  summaryMessageId: string | null;
  videoStatus: ComposerVideoStatus;
  saveStatus: ComposerSaveStatus;
  smartContextEnabled: boolean;
  contextSnapshot: ComposerContextSnapshot | null;
};

type ClarifierState = {
  questionId: string;
  question: string;
  rationale: string | null;
  suggestions: string[];
  styleTraits: string[];
};

type AiPromptHandoff = Extract<PrompterHandoff, { intent: "ai_prompt" }>;
type ImageLogoHandoff = Extract<PrompterHandoff, { intent: "image_logo" }>;
type ImageEditHandoff = Extract<PrompterHandoff, { intent: "image_edit" }>;

type ComposerContextValue = {
  state: ComposerState;
  feedTarget: FeedTarget;
  activeCapsuleId: string | null;
  handlePrompterAction(action: PrompterAction): void;
  handlePrompterHandoff(handoff: PrompterHandoff): void;
  close(): void;
  post(): Promise<void>;
  submitPrompt(prompt: string, attachments?: PrompterAttachment[] | null): Promise<void>;
  showSummary(
    result: SummaryResult,
    options: SummaryPresentationOptions,
    extras?: SummaryConversationExtras,
  ): void;
  answerClarifier(answer: string): void;
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
  summaryContext: null,
  summaryResult: null,
  summaryOptions: null,
  summaryMessageId: null,
  videoStatus: createIdleVideoStatus(),
  saveStatus: createIdleSaveStatus(),
  smartContextEnabled: true,
  contextSnapshot: null,
};

function resetStateWithPreference(
  prev: ComposerState,
  overrides: Partial<ComposerState> = {},
): ComposerState {
  return {
    ...initialState,
    smartContextEnabled: prev.smartContextEnabled,
    ...overrides,
  };
}

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

  if (typeof draft.mediaThumbnailUrl === "string" && draft.mediaThumbnailUrl.trim().length) {
    const thumb = draft.mediaThumbnailUrl.trim();
    merged.thumbnailUrl = thumb;
    merged.thumbnail_url = thumb;
  } else if (draft.mediaThumbnailUrl === null) {
    delete merged.thumbnailUrl;
    delete merged.thumbnail_url;
  }

  if (typeof draft.mediaPlaybackUrl === "string" && draft.mediaPlaybackUrl.trim().length) {
    const playback = draft.mediaPlaybackUrl.trim();
    merged.playbackUrl = playback;
    merged.playback_url = playback;
  } else if (draft.mediaPlaybackUrl === null) {
    delete merged.playbackUrl;
    delete merged.playback_url;
  }

  if (typeof draft.muxPlaybackId === "string" && draft.muxPlaybackId.trim().length) {
    const playbackId = draft.muxPlaybackId.trim();
    merged.muxPlaybackId = playbackId;
    merged.mux_playback_id = playbackId;
  } else if (draft.muxPlaybackId === null) {
    delete merged.muxPlaybackId;
    delete merged.mux_playback_id;
  }

  if (typeof draft.muxAssetId === "string" && draft.muxAssetId.trim().length) {
    const assetId = draft.muxAssetId.trim();
    merged.muxAssetId = assetId;
    merged.mux_asset_id = assetId;
  } else if (draft.muxAssetId === null) {
    delete merged.muxAssetId;
    delete merged.mux_asset_id;
  }

  if (
    typeof draft.mediaDurationSeconds === "number" &&
    Number.isFinite(draft.mediaDurationSeconds)
  ) {
    const duration = Number(draft.mediaDurationSeconds);
    merged.mediaDurationSeconds = duration;
    merged.duration_seconds = duration;
  } else if (draft.mediaDurationSeconds === null) {
    delete merged.mediaDurationSeconds;
    delete merged.duration_seconds;
  }

  if (typeof draft.videoRunId === "string" && draft.videoRunId.trim().length) {
    const runId = draft.videoRunId.trim();
    merged.videoRunId = runId;
    merged.video_run_id = runId;
  } else if (draft.videoRunId === null) {
    delete merged.videoRunId;
    delete merged.video_run_id;
  }

  if (typeof draft.videoRunStatus === "string" && draft.videoRunStatus.trim().length) {
    const status = draft.videoRunStatus.trim().toLowerCase();
    merged.videoRunStatus = status;
    merged.video_run_status = status;
  } else if (draft.videoRunStatus === null) {
    delete merged.videoRunStatus;
    delete merged.video_run_status;
  }

  if (typeof draft.videoRunError === "string" && draft.videoRunError.trim().length) {
    const errorMessage = draft.videoRunError.trim();
    merged.videoRunError = errorMessage;
    merged.video_run_error = errorMessage;
  } else if (draft.videoRunError === null) {
    delete merged.videoRunError;
    delete merged.video_run_error;
  }

  if (typeof draft.memoryId === "string" && draft.memoryId.trim().length) {
    const memoryId = draft.memoryId.trim();
    merged.memoryId = memoryId;
    merged.memory_id = memoryId;
  } else if (draft.memoryId === null) {
    delete merged.memoryId;
    delete merged.memory_id;
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
  const { state, setState } = useComposerCore(initialState);
  const smartContextEnabled = state.smartContextEnabled;
  const [feedTarget, setFeedTarget] = React.useState<FeedTarget>({ scope: "home" });
  const { sidebarStore, updateSidebarStore } = useSidebarStore(user?.id ?? null);
  const saveResetTimeout = React.useRef<number | null>(null);

  const setSmartContextEnabled = React.useCallback((enabled: boolean) => {
    setState((prev) =>
      prev.smartContextEnabled === enabled
        ? prev
        : {
            ...prev,
            smartContextEnabled: enabled,
            contextSnapshot: enabled ? prev.contextSnapshot : null,
          },
    );
  }, [setState]);

  useSmartContextPersistence(smartContextEnabled, setSmartContextEnabled);
  useRemoteConversations(user?.id ?? null, updateSidebarStore);

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
          draft: cloneComposerData(input.draft),
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
        const metadata: Record<string, unknown> = {
          source: "ai-composer",
          category: "capsule_creation",
          kind: payload.kind,
        };
        if (payload.prompt) metadata.prompt = payload.prompt;
        if (payload.downloadUrl) metadata.download_url = payload.downloadUrl;
        if (payload.thumbnailUrl) metadata.thumbnail_url = payload.thumbnailUrl;
        if (payload.muxPlaybackId) metadata.mux_playback_id = payload.muxPlaybackId;
        if (payload.muxAssetId) metadata.mux_asset_id = payload.muxAssetId;
        if (payload.runId) metadata.video_run_id = payload.runId;
        if (payload.durationSeconds != null) {
          metadata.duration_seconds = payload.durationSeconds;
        }
        if (activeCapsuleId) {
          metadata.capsule_id = activeCapsuleId;
        }
        if (payload.metadata && typeof payload.metadata === "object") {
          Object.assign(metadata, payload.metadata);
        }

        const body = {
          user: envelopePayload,
          item: {
            title: payload.title,
            description: payload.description,
            kind: payload.kind,
            mediaUrl: payload.mediaUrl,
            mediaType: payload.mediaType ?? null,
            downloadUrl: payload.downloadUrl ?? null,
            thumbnailUrl: payload.thumbnailUrl ?? null,
            prompt: payload.prompt ?? null,
            muxPlaybackId: payload.muxPlaybackId ?? null,
            muxAssetId: payload.muxAssetId ?? null,
            durationSeconds: payload.durationSeconds ?? null,
            runId: payload.runId ?? null,
            tags: payload.tags ?? null,
            metadata,
          },
        };

        const response = await fetch("/api/composer/save", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        if (!response.ok) {
          const errorText = await response.text().catch(() => "");
          throw new Error(errorText || `Save request failed (${response.status})`);
        }
        const result = (await response.json().catch(() => null)) as {
          memoryId?: string | null;
          message?: string | null;
        } | null;

        const memoryId =
          typeof result?.memoryId === "string" ? result.memoryId.trim() || null : null;

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
        const rawVideoRunId =
          typeof (mergedRawPost as { video_run_id?: unknown }).video_run_id === "string"
            ? ((mergedRawPost as { video_run_id: string }).video_run_id ?? "").trim() || null
            : typeof (mergedRawPost as { videoRunId?: unknown }).videoRunId === "string"
              ? ((mergedRawPost as { videoRunId: string }).videoRunId ?? "").trim() || null
              : null;
        const rawVideoRunStatus =
          typeof (mergedRawPost as { video_run_status?: unknown }).video_run_status === "string"
            ? ((mergedRawPost as { video_run_status: string }).video_run_status ?? "")
                .trim()
                .toLowerCase() || null
            : typeof (mergedRawPost as { videoRunStatus?: unknown }).videoRunStatus === "string"
              ? ((mergedRawPost as { videoRunStatus: string }).videoRunStatus ?? "")
                  .trim()
                  .toLowerCase() || null
              : null;
        const rawVideoRunError =
          typeof (mergedRawPost as { video_run_error?: unknown }).video_run_error === "string"
            ? ((mergedRawPost as { video_run_error: string }).video_run_error ?? "").trim() || null
            : typeof (mergedRawPost as { videoRunError?: unknown }).videoRunError === "string"
              ? ((mergedRawPost as { videoRunError: string }).videoRunError ?? "").trim() || null
              : null;
        const rawMemoryId =
          typeof (mergedRawPost as { memory_id?: unknown }).memory_id === "string"
            ? ((mergedRawPost as { memory_id: string }).memory_id ?? "").trim() || null
            : typeof (mergedRawPost as { memoryId?: unknown }).memoryId === "string"
              ? ((mergedRawPost as { memoryId: string }).memoryId ?? "").trim() || null
              : null;
        const resolvedRunId = mergedDraft.videoRunId ?? rawVideoRunId ?? prev.videoStatus.runId;
        const normalizedRunStatus = (() => {
          const candidate = mergedDraft.videoRunStatus ?? rawVideoRunStatus;
          if (!candidate) return null;
          const lowered = candidate.toLowerCase();
          if (lowered === "pending" || lowered === "running") return "running" as const;
          if (lowered === "succeeded" || lowered === "failed") {
            return lowered as ComposerVideoStatus["state"];
          }
          return null;
        })();
        let nextVideoStatus: ComposerVideoStatus = prev.videoStatus;
        if (normalizedRunStatus === "succeeded") {
          nextVideoStatus = {
            state: "succeeded",
            runId: resolvedRunId ?? null,
            prompt,
            attachments: prev.videoStatus.attachments,
            error: null,
            message: messageText,
            memoryId: mergedDraft.memoryId ?? rawMemoryId ?? prev.videoStatus.memoryId ?? null,
          };
        } else if (normalizedRunStatus === "failed") {
          const errorText =
            mergedDraft.videoRunError ??
            rawVideoRunError ??
            prev.videoStatus.error ??
            "Video generation failed.";
          nextVideoStatus = {
            state: "failed",
            runId: resolvedRunId ?? null,
            prompt,
            attachments: prev.videoStatus.attachments,
            error: errorText,
            message: messageText,
            memoryId: mergedDraft.memoryId ?? rawMemoryId ?? prev.videoStatus.memoryId ?? null,
          };
        } else if (normalizedRunStatus === "running") {
          nextVideoStatus = {
            state: "running",
            runId: resolvedRunId ?? null,
            prompt,
            attachments: prev.videoStatus.attachments,
            error: null,
            message: messageText,
            memoryId: mergedDraft.memoryId ?? rawMemoryId ?? prev.videoStatus.memoryId ?? null,
          };
        } else if (prev.videoStatus.state !== "idle") {
          nextVideoStatus = {
            state: "idle",
            runId: null,
            prompt: null,
            attachments: null,
            error: null,
            message: null,
            memoryId: null,
          };
        }
        const nextSnapshot =
          payload.context && payload.context.enabled
            ? {
                query: payload.context.query ?? null,
                memoryIds: payload.context.memoryIds ?? [],
                snippets: (payload.context.snippets ?? []).map((snippet) => ({
                  id: snippet.id,
                  title: snippet.title ?? null,
                  snippet: snippet.snippet,
                  source: snippet.source ?? null,
                  kind: snippet.kind ?? null,
                  url: snippet.url ?? null,
                  highlightHtml: snippet.highlightHtml ?? null,
                  tags: Array.isArray(snippet.tags) ? snippet.tags : [],
                })),
                userCard: payload.context.userCard ?? null,
              }
            : null;
        return {
          ...prev,
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
          videoStatus: nextVideoStatus,
          contextSnapshot: nextSnapshot,
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
    [activeCapsuleId, recordRecentChat, setState],
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
      const resolvedOptions = Object.keys(composeOptions).length ? composeOptions : undefined;

      const createdAt = new Date().toISOString();
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
        const resolvedThreadId = prev.threadId ?? safeRandomUUID();
        threadIdForRequest = resolvedThreadId;
        return {
          ...prev,
          open: true,
          loading: true,
          prompt: trimmedPrompt,
          message: null,
          choices: null,
          history: [...existingHistory, pendingMessage],
          threadId: resolvedThreadId,
          clarifier: null,
          summaryContext: null,
          summaryResult: null,
          summaryOptions: null,
          summaryMessageId: null,
        };
      });
      try {
        const payload = await callAiPrompt(
          trimmedPrompt,
          resolvedOptions,
          undefined,
          normalizedAttachments,
          baseHistory,
          threadIdForRequest,
          activeCapsuleId,
          smartContextEnabled,
        );
        handleAiResponse(trimmedPrompt, payload);
      } catch (error) {
        console.error("AI prompt failed", error);
        setState((prev) => resetStateWithPreference(prev));
      }
    },
    [activeCapsuleId, handleAiResponse, setState, smartContextEnabled],
  );

  const runLogoHandoff = React.useCallback(
    async ({ prompt }: ImageLogoHandoff) => {
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
        setState((prev) => ({
          ...prev,
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
        setState((prev) => resetStateWithPreference(prev));
      }
    },
    [activeCapsuleId, setState],
  );

  const runImageEditHandoff = React.useCallback(
    async ({ prompt, reference }: ImageEditHandoff) => {
      if (!reference?.url) return;
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
          body: JSON.stringify({ imageUrl: reference.url, instruction: prompt }),
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
        setState((prev) => ({
          ...prev,
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
        setState((prev) => resetStateWithPreference(prev));
      }
    },
    [activeCapsuleId, setState],
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
        await handlePrompterHandoff({
          intent: "ai_prompt",
          prompt: action.prompt,
          options: { prefer: "poll" },
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
          options: { composeMode: action.mode },
        });
        return;
      }
      if (action.kind === "generate") {
        const attachments = action.attachments && action.attachments.length ? action.attachments : undefined;
        await handlePrompterHandoff({
          intent: "ai_prompt",
          prompt: action.text,
          ...(attachments ? { attachments } : {}),
        });
        return;
      }
    },
    [activeCapsuleId, envelopePayload, handlePrompterHandoff, setState],
  );

  const close = React.useCallback(
    () => setState((prev) => resetStateWithPreference(prev)),
    [setState],
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
        clarifier: null,
        summaryContext: extras?.context ?? null,
        summaryResult: result,
        summaryOptions: options,
        summaryMessageId: messageId,
      }));
    },
    [setState],
  );

  const submitPrompt = React.useCallback(
    async (promptText: string, attachments?: PrompterAttachment[] | null) => {
      const trimmed = promptText.trim();
      if (!trimmed) return;
      const attachmentList = attachments && attachments.length ? attachments : undefined;
      const expectVideo = shouldExpectVideoResponse(trimmed, attachmentList ?? null);
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
          prompt: trimmed,
          message: null,
          choices: null,
          history: [...existingHistory, pendingMessage],
          threadId: resolvedThreadId,
          summaryContext: null,
          summaryResult: null,
          summaryOptions: null,
          summaryMessageId: null,
          videoStatus: nextVideoStatus,
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
          state.smartContextEnabled,
        );
        handleAiResponse(trimmed, payload);
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
            history: previousHistory,
            videoStatus: fallbackVideoStatus,
          };
        });
      }
    },
    [
      activeCapsuleId,
      handleAiResponse,
      setState,
      state.clarifier,
      state.rawPost,
      state.smartContextEnabled,
    ],
  );

  const retryVideo = React.useCallback(() => {
    const status = state.videoStatus;
    if (status.state !== "failed" || !status.prompt) return;
    void submitPrompt(status.prompt, status.attachments ?? undefined);
  }, [state.videoStatus, submitPrompt]);

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
          state.smartContextEnabled,
        );
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
      state.smartContextEnabled,
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
      handlePrompterAction,
      handlePrompterHandoff,
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
      retryVideo,
      saveCreation,
      setSmartContextEnabled,
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
    answerClarifier,
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
    retryVideo,
    saveCreation,
    setSmartContextEnabled,
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
      summaryContext={state.summaryContext}
      summaryResult={state.summaryResult}
      summaryOptions={state.summaryOptions}
      summaryMessageId={state.summaryMessageId}
      videoStatus={state.videoStatus}
      saveStatus={state.saveStatus}
      smartContextEnabled={state.smartContextEnabled}
      contextSnapshot={state.contextSnapshot}
      onSmartContextChange={setSmartContextEnabled}
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
      onRetryVideo={retryVideo}
      onSaveCreation={saveCreation}
      {...forceHandlers}
    />
  );
}


