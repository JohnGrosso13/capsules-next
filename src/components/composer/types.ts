import type { PrompterAttachment } from "@/components/ai-prompter-stage";

export type PromptRunMode = "default" | "chatOnly";

export type PromptSubmitOptions = {
  mode?: PromptRunMode;
  preserveSummary?: boolean;
};

export type ClarifierPrompt = {
  questionId: string;
  question: string;
  rationale?: string | null;
  suggestions: string[];
  styleTraits: string[];
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
