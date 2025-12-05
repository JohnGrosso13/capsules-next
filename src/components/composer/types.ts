import type { PrompterAttachment } from "@/components/ai-prompter-stage";
import type { ComposerDraft } from "@/lib/composer/draft";
import type { ComposerChatMessage } from "@/lib/composer/chat-types";
import type { SummaryResult } from "@/types/summary";
import type { SummaryConversationContext, SummaryPresentationOptions } from "@/lib/composer/summary-context";

export type PromptRunMode = "default" | "chatOnly";

export type PromptSubmitOptions = {
  mode?: PromptRunMode;
  preserveSummary?: boolean;
};

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

export type ComposerChoice = { key: string; label: string };

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

export type BackgroundReadyNotice = {
  kind: "image" | "video" | "text";
  label: string;
  threadId: string | null;
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
  backgrounded: boolean;
  backgroundReadyNotice: BackgroundReadyNotice | null;
  backgroundReminderVisible: boolean;
  backgroundPreference: {
    remindOnBackground: boolean;
  };
  lastPrompt: {
    prompt: string;
    attachments: PrompterAttachment[] | null;
    mode: PromptRunMode;
  } | null;
};
