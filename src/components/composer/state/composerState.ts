"use client";

import { truncateLabel, formatRelativeTime } from "@/lib/composer/sidebar-types";
import { ensurePollStructure, type ComposerDraft } from "@/lib/composer/draft";
import { detectVideoIntent } from "@/shared/ai/video-intent";
import { type ComposerState, type ComposerSaveStatus, type ComposerVideoStatus } from "../types";
import type {
  ComposerStoredDraft,
  ComposerStoredProject,
  ComposerStoredRecentChat,
} from "@/lib/composer/sidebar-store";
import type { PrompterAttachment } from "@/components/ai-prompter-stage";
import type { ComposerChatAttachment } from "@/lib/composer/chat-types";
import type { SummaryResult } from "@/types/summary";
import type { SummaryPresentationOptions } from "@/lib/composer/summary-context";

export const MAX_PROMPT_LENGTH = 4000;
export const MAX_ATTACHMENTS = 6;
export const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024; // 25MB
export const BACKGROUND_REMINDER_KEY = "composer:background:reminder";

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

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const EMPTY_RECENT_DRAFT: ComposerDraft = {
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

export function ensureRecentDraft(draft: ComposerDraft | null): ComposerDraft {
  if (draft && typeof draft === "object") {
    return draft;
  }
  return { ...EMPTY_RECENT_DRAFT };
}

export function shouldPreservePollOptions(prompt: string, prevDraft: ComposerDraft | null): boolean {
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

export function normalizeCapsuleId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return UUID_PATTERN.test(trimmed) ? trimmed : null;
}

export function hasVideoAttachment(list?: PrompterAttachment[] | null): boolean {
  if (!list || !list.length) return false;
  return list.some(
    (attachment) =>
      typeof attachment.mimeType === "string" &&
      attachment.mimeType.toLowerCase().startsWith("video/"),
  );
}

export function shouldExpectVideoResponse(
  prompt: string,
  attachments?: PrompterAttachment[] | null,
): boolean {
  if (hasVideoAttachment(attachments)) return true;
  return detectVideoIntent(prompt);
}

export function validatePromptAndAttachments(
  prompt: string,
  attachments?: PrompterAttachment[] | null,
): string | null {
  if (prompt.length > MAX_PROMPT_LENGTH) {
    return `Your prompt is too long (${prompt.length} characters). Please keep it under ${MAX_PROMPT_LENGTH}.`;
  }
  if (attachments && attachments.length > MAX_ATTACHMENTS) {
    return `Too many attachments. Limit is ${MAX_ATTACHMENTS}.`;
  }
  if (attachments) {
    const oversized = attachments.find(
      (attachment) => typeof attachment.size === "number" && attachment.size > MAX_ATTACHMENT_BYTES,
    );
    if (oversized) {
      return `Attachment "${oversized.name}" is larger than ${Math.round(MAX_ATTACHMENT_BYTES / (1024 * 1024))}MB. Please choose a smaller file.`;
    }
  }
  return null;
}

export function createIdleVideoStatus(): ComposerVideoStatus {
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

export function createIdleSaveStatus(): ComposerSaveStatus {
  return {
    state: "idle",
    message: null,
  };
}

export function softenSummaryLine(text: string): string {
  const trimmed = text.trim();
  if (!trimmed.length) return trimmed;
  const lower = trimmed.toLowerCase();
  if (lower.includes("no caption") || lower.includes("lack captions") || lower.includes("without captions")) {
    return "These updates lean on the visuals themselves, so consider pairing them with a quick note when you share them onward.";
  }
  return trimmed;
}

export function formatSummaryMessage(result: SummaryResult, options: SummaryPresentationOptions): string {
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

export function pickFirstMeaningfulText(...values: Array<string | null | undefined>): string | null {
  for (const value of values) {
    if (!value) continue;
    const trimmed = value.replace(/\s+/g, " ").trim();
    if (trimmed.length) return trimmed;
  }
  return null;
}

export function describeRecentTitle(entry: ComposerStoredRecentChat): string {
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

export function describeDraftTitle(entry: ComposerStoredDraft): string {
  const primary = pickFirstMeaningfulText(
    entry.title,
    entry.prompt,
    entry.draft.content ?? "",
    entry.message,
  );
  return truncateLabel(primary ?? "Saved draft", 70);
}

export function describeDraftCaption(updatedAt: string): string {
  return `Updated ${formatRelativeTime(updatedAt)}`;
}

export function describeRecentCaption(entry: ComposerStoredRecentChat): string {
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

export function describeRecentSnippet(entry: ComposerStoredRecentChat): string | null {
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

export function describeProjectCaption(project: ComposerStoredProject): string {
  const countLabel = project.draftIds.length === 1 ? "1 draft" : `${project.draftIds.length} drafts`;
  return `${countLabel} - ${formatRelativeTime(project.updatedAt)}`;
}

export function mapPrompterAttachmentToChat(
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

export const initialComposerState: ComposerState = {
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
  backgrounded: false,
  backgroundReadyNotice: null,
  backgroundReminderVisible: false,
  backgroundPreference: {
    remindOnBackground: true,
  },
  lastPrompt: null,
};

export function resetStateWithPreference(
  prev: ComposerState,
  overrides: Partial<ComposerState> = {},
): ComposerState {
  return {
    ...initialComposerState,
    backgroundPreference: prev.backgroundPreference,
    ...overrides,
  };
}
