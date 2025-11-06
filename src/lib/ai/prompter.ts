type Json = string | number | boolean | null | Json[] | { [key: string]: Json };

import "@/lib/polyfills/dom-parser";

import { fetchOpenAI, hasOpenAIApiKey } from "@/adapters/ai/openai/server";
import {
  generateStabilityImage,
  hasStabilityApiKey,
  type StabilityGenerateOptions,
} from "@/adapters/ai/stability/server";
import {
  generateVideoFromPrompt,
  editVideoWithInstruction,
  type VideoGenerationResult,
} from "@/lib/ai/video";
import { serverEnv } from "../env/server";
import { safeRandomUUID } from "@/lib/random";

import { getDatabaseAdminClient } from "@/config/database";

import { storeImageSrcToSupabase } from "../supabase/storage";
import {
  createAiImageRun,
  updateAiImageRun,
  listRecentAiImageRuns,
  type AiImageRunAttempt,
  type UpdateAiImageRunInput,
} from "@/server/ai/image-runs";
import { publishAiImageEvent } from "@/services/realtime/ai-images";
import type { ComposerChatAttachment, ComposerChatMessage } from "@/lib/composer/chat-types";
import { detectVideoIntent, extractPreferHints } from "@/shared/ai/video-intent";

export class AIConfigError extends Error {
  constructor(message: string) {
    super(message);

    this.name = "AIConfigError";
  }
}

type ChatMessage = Record<string, unknown>;

type JsonSchema = { name: string; schema: Record<string, unknown> };

type DraftPost = {
  kind: string;

  content: string;

  mediaUrl: string | null;

  mediaPrompt: string | null;
  thumbnailUrl?: string | null;
  playbackUrl?: string | null;
  muxPlaybackId?: string | null;
  muxAssetId?: string | null;
  durationSeconds?: number | null;
  videoRunId?: string | null;
  videoRunStatus: "pending" | "running" | "succeeded" | "failed" | null;
  videoRunError: string | null;
  memoryId: string | null;
};

type PollDraft = { message: string; poll: { question: string; options: string[] } };

type FeedSummary = {
  message: string;

  bullets: string[];

  next_actions: string[];

  suggestion: { title: string | null; prompt: string | null } | null;
};

const HISTORY_MESSAGE_LIMIT = 6;

function summarizeAttachmentForConversation(attachment: ComposerChatAttachment): string {
  const parts = [attachment.name];
  if (attachment.mimeType) {
    parts.push(`(${attachment.mimeType})`);
  }
  if (attachment.url) {
    parts.push(`-> ${attachment.url}`);
  }
  return parts.join(" ");
}

function mapConversationToMessages(
  history: ComposerChatMessage[] | undefined,
  limit: number = HISTORY_MESSAGE_LIMIT,
): ChatMessage[] {
  if (!history || !Array.isArray(history) || history.length === 0) {
    return [];
  }
  const recent = history.slice(-limit);
  return recent.map((entry) => {
    const role = entry.role === "user" ? "user" : "assistant";
    const attachmentsNote = entry.attachments && entry.attachments.length
      ? `\n\nAttachments referenced:\n${entry.attachments
          .map((attachment) => `- ${summarizeAttachmentForConversation(attachment)}`)
          .join("\n")}`
      : "";
    return {
      role,
      content: `${entry.content}${attachmentsNote}`.trim(),
    };
  });
}

function buildContextMessages(context: ComposeDraftOptions): ChatMessage[] {
  const messages: ChatMessage[] = [];
  const userCard = typeof context.userCard === "string" ? context.userCard.trim() : "";
  if (userCard.length) {
    messages.push({
      role: "system",
      content: `User profile:\n${userCard}`,
    });
  }

  let prompt = typeof context.contextPrompt === "string" ? context.contextPrompt.trim() : "";
  if (!prompt && Array.isArray(context.contextRecords) && context.contextRecords.length) {
    const lines: string[] = ["Context memories to ground your response:"];
    context.contextRecords.slice(0, 6).forEach((record, index) => {
      const headerParts = [
        `Memory #${index + 1}`,
        record.title ? `title: ${record.title}` : null,
        record.kind ? `kind: ${record.kind}` : null,
        record.source ? `source: ${record.source}` : null,
        record.tags.length ? `tags: ${record.tags.join(", ")}` : null,
      ].filter(Boolean);
      lines.push(headerParts.join(" | "));
      lines.push(record.snippet);
      if (record.url) {
        lines.push(`media: ${record.url}`);
      }
      lines.push("---");
    });
    lines.push("If you reference a memory, mention its Memory # to ground the response.");
    prompt = lines.join("\n");
  }

  if (prompt.length) {
    messages.push({
      role: "system",
      content: prompt,
    });
  }

  return messages;
}

export type PromptClarifierInput = {
  questionId?: string | null;
  answer?: string | null;
  skip?: boolean;
};

type NormalizedClarifierInput = {
  questionId: string | null;
  answer: string | null;
  skip: boolean;
};

type DraftPostPlan = {
  action: "draft_post";
  message?: string;
  post: Record<string, unknown>;
  choices?: Array<{ key: string; label: string }>;
};

type ClarifyImagePromptPlan = {
  action: "clarify_image_prompt";
  questionId: string;
  question: string;
  rationale?: string | null;
  suggestions?: string[];
  styleTraits?: string[];
};

type ClarifierExample = {
  prompt: string;
  resolved: string;
  style: string | null;
  status: string;
  model: string | null;
};

const CLARIFIER_STATIC_EXAMPLES: ClarifierExample[] = [
  {
    prompt: "Design a neon cyberpunk skyline for our Capsule banner.",
    resolved:
      "Design a neon cyberpunk skyline with magenta and teal lights, layered holographic billboards, and a soft depth-of-field blur.",
    style: "vibrant-future",
    status: "succeeded",
    model: "openai:gpt-image-1",
  },
  {
    prompt: "Create a cozy pastel avatar of a friendly community manager.",
    resolved:
      "Create a cozy pastel illustration of a friendly community manager with soft lighting, gentle gradients, and a subtle grain texture.",
    style: "soft-pastel",
    status: "succeeded",
    model: "openai:gpt-image-1",
  },
  {
    prompt: "Render a dramatic noir-style logo for Midnight Dispatch.",
    resolved:
      "Render a dramatic noir logo for Midnight Dispatch with high-contrast lighting, a single spotlight rim, and a minimalist serif wordmark.",
    style: "noir-spotlight",
    status: "succeeded",
    model: "openai:dall-e-2",
  },
  {
    prompt: "Generate a minimal matte background for a Capsule landing page.",
    resolved:
      "Generate a minimal matte background with soft shadows, neutral tones, and ample negative space for headline contrast.",
    style: "minimal-matte",
    status: "succeeded",
    model: "openai:gpt-image-1",
  },
];

type ComposeDraftResult = DraftPostPlan | ClarifyImagePromptPlan;

type ComposeContextRecord = {
  id: string;
  title: string | null;
  snippet: string;
  source: string | null;
  url: string | null;
  kind: string | null;
  tags: string[];
  highlightHtml?: string | null;
};

type ComposeDraftOptions = {
  history?: ComposerChatMessage[];
  attachments?: ComposerChatAttachment[];
  capsuleId?: string | null;
  rawOptions?: Record<string, unknown>;
  clarifier?: PromptClarifierInput | null;
  stylePreset?: string | null;
  ownerId?: string | null;
  userCard?: string | null;
  contextPrompt?: string | null;
  contextRecords?: ComposeContextRecord[];
  contextMetadata?: Record<string, unknown> | null;
};

type ImageProviderId = "openai" | "stability";

const STYLE_PROVIDER_OVERRIDES: Record<string, ImageProviderId> = {
  "vibrant-future": "stability",
  "noir-spotlight": "stability",
  "capsule-default": "openai",
};

const PROMPT_PROVIDER_HINTS: Array<{ pattern: RegExp; provider: ImageProviderId }> = [
  { pattern: /\bflux\b/i, provider: "stability" },
  { pattern: /\bphotoreal\b/i, provider: "openai" },
  { pattern: /\bvector\b/i, provider: "stability" },
];
const nullableStringSchema = {
  anyOf: [{ type: "string" }, { type: "null" }],
};

const CLARIFIER_HISTORY_LOOKBACK = 4;
const CLARIFIER_RECENT_RUN_LIMIT = 12;

const IMAGE_INTENT_REGEX =
  /(image|logo|banner|thumbnail|picture|photo|icon|cover|poster|graphic|illustration|art|avatar|background)\b/i;
const VISUAL_KIND_HINTS = new Set([
  "visual",
  "image",
  "media",
  "graphic",
  "graphics",
  "photo",
  "photograph",
  "art",
  "illustration",
  "logo",
  "banner",
  "thumbnail",
  "cover",
  "poster",
  "avatar",
  "video",
  "clip",
]);

const VIDEO_KIND_HINTS = new Set([
  "video",
  "clip",
  "reel",
  "story",
  "short",
  "highlight",
  "montage",
  "edit",
  "b-roll",
  "broll",
]);

const TEXT_KIND_HINTS = new Set(["text", "post", "caption", "copy", "write"]);

const clarifierSchema: JsonSchema = {
  name: "CapsulesImageClarifier",
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["should_clarify"],
    properties: {
      should_clarify: { type: "boolean" },
      question: { type: "string" },
      rationale: nullableStringSchema,
      suggestions: {
        type: "array",
        items: { type: "string" },
        maxItems: 6,
      },
      style_traits: {
        type: "array",
        items: { type: "string" },
        maxItems: 6,
      },
    },
  },
};

const creationSchema: JsonSchema = {
  name: "CapsulesDraftCreation",

  schema: {
    type: "object",

    additionalProperties: false,

    required: ["message", "post"],

    properties: {
      message: { type: "string", description: "Short acknowledgement for the user." },

      post: {
        type: "object",

        additionalProperties: false,

        required: ["content"],

        properties: {
          content: {
            type: "string",
            description: "Complete social post copy ready for publishing.",
          },

          kind: { type: "string", enum: ["text", "image", "video"] },

          media_prompt: nullableStringSchema,

          media_url: nullableStringSchema,

          notes: nullableStringSchema,
        },
      },
    },
  },
};

const editSchema: JsonSchema = {
  name: "CapsulesDraftEdit",

  schema: {
    type: "object",

    additionalProperties: false,

    required: ["message", "post"],

    properties: {
      message: { type: "string" },

      post: {
        type: "object",

        additionalProperties: false,

        required: ["content"],

        properties: {
          content: { type: "string" },

          kind: { type: "string", enum: ["text", "image", "video"] },

          media_prompt: nullableStringSchema,

          media_url: nullableStringSchema,

          keep_existing_media: { type: "boolean" },

          edit_current_media: { type: "boolean" },
        },
      },
    },
  },
};

const pollSchema: JsonSchema = {
  name: "CapsulesPollDraft",

  schema: {
    type: "object",

    additionalProperties: false,

    required: ["message", "poll"],

    properties: {
      message: { type: "string", description: "Short acknowledgement for the user." },

      poll: {
        type: "object",

        additionalProperties: false,

        required: ["question", "options"],

        properties: {
          question: { type: "string" },

          options: { type: "array", minItems: 2, maxItems: 6, items: { type: "string" } },
        },
      },
    },
  },
};

const feedSummarySchema: JsonSchema = {
  name: "FeedSummary",

  schema: {
    type: "object",

    additionalProperties: false,

    required: ["message"],

    properties: {
      message: { type: "string" },

      bullets: { type: "array", items: { type: "string" } },

      next_actions: { type: "array", items: { type: "string" } },

      suggested_title: { type: "string" },

      suggested_post_prompt: { type: "string" },
    },
  },
};

function requireOpenAIKey() {
  if (!hasOpenAIApiKey()) {
    throw new AIConfigError(
      "OpenAI API key is not configured. Set OPENAI_API_KEY in the environment.",
    );
  }
}

export function extractJSON<T = Record<string, unknown>>(maybeJSONString: unknown): T | null {
  if (maybeJSONString && typeof maybeJSONString === "object") {
    return maybeJSONString as T;
  }

  const text = String(maybeJSONString ?? "");

  try {
    return JSON.parse(text) as T;
  } catch {
    // continue
  }

  try {
    const fenced = text.replace(/^\s*```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "");

    return JSON.parse(fenced) as T;
  } catch {
    // continue
  }

  try {
    const start = text.indexOf("{");

    const end = text.lastIndexOf("}");

    if (start >= 0 && end > start) {
      return JSON.parse(text.slice(start, end + 1)) as T;
    }
  } catch {
    // ignore incomplete fragments
  }

  return null;
}

export async function callOpenAIChat(
  messages: ChatMessage[],

  schema: JsonSchema | null,

  options: { temperature?: number } = {},
): Promise<{ content: string; raw: Json }> {
  requireOpenAIKey();

  const temperature = options.temperature ?? 0.7;

  const payload: Record<string, unknown> = {
    model: serverEnv.OPENAI_MODEL,

    messages,

    temperature,
  };

  if (schema) {
    payload.response_format = { type: "json_schema", json_schema: schema };
  } else {
    payload.response_format = { type: "json_object" };
  }

  let response = await fetchOpenAI("/chat/completions", {
    method: "POST",

    headers: {
      "Content-Type": "application/json",
    },

    body: JSON.stringify(payload),
  });

  let json = (await response.json().catch(() => ({}))) as Json;

  if (!response.ok) {
    const fallbackBody = { model: serverEnv.OPENAI_MODEL, messages, temperature };

    response = await fetchOpenAI("/chat/completions", {
      method: "POST",

      headers: {
        "Content-Type": "application/json",
      },

      body: JSON.stringify(fallbackBody),
    });

    json = (await response.json().catch(() => ({}))) as Json;

    if (!response.ok) {
      const error = new Error(`OpenAI chat error: ${response.status}`);

      (error as Error & { meta?: Json }).meta = json;

      throw error;
    }
  }

  const choices = (json as Record<string, unknown>).choices;

  const content = Array.isArray(choices)
    ? (choices[0] as Record<string, unknown>)?.message &&
      ((choices[0] as Record<string, unknown>).message as Record<string, unknown>)?.content
    : null;

  if (!content || typeof content !== "string") {
    throw new Error("OpenAI chat returned empty content.");
  }

  return { content, raw: json };
}

type ImageOptions = { quality?: string; size?: string };

type ImageParams = { size: string; quality: string };

function resolveImageParams(options: ImageOptions = {}): ImageParams {
  let quality = options.quality ?? "standard";

  let size = options.size ?? serverEnv.OPENAI_IMAGE_SIZE;

  const override = serverEnv.OPENAI_IMAGE_QUALITY;

  const isNonProd = (process.env.NODE_ENV ?? "").toLowerCase() !== "production";

  if (override === "low" || (isNonProd && override !== "standard" && override !== "high")) {
    quality = "standard";

    size = serverEnv.OPENAI_IMAGE_SIZE_LOW;
  } else if (override === "high") {
    quality = "hd";
  } else if (override === "standard") {
    quality = "standard";
  }

  return { size, quality };
}

const DEFAULT_IMAGE_RETRY_DELAYS_MS = [0, 1200, 3200];

export type ImageGenerationResult = {
  url: string;
  runId: string | null;
  provider: string | null;
  metadata?: Record<string, unknown> | null;
};

export type ImageRunExecutionContext = {
  ownerId?: string | null;
  capsuleId?: string | null;
  assetKind: string;
  mode: "generate" | "edit";
  userPrompt: string;
  resolvedPrompt: string;
  stylePreset?: string | null;
  options?: Record<string, unknown>;
  retryDelaysMs?: number[];
  provider?: string | null;
  candidateProviders?: ImageProviderId[] | null;
};

type OpenAiErrorDetails = {
  message: string;
  code: string | null;
  status: number | null;
  meta: Record<string, unknown> | null;
};

type RunAttemptOutcome = {
  status: "succeeded" | "failed";
  imageUrl?: string | null;
  responseMetadata?: Record<string, unknown> | null;
  error?: OpenAiErrorDetails;
  terminal: boolean;
};

type RunState = {
  id: string;
  ownerId: string | null;
  assetKind: string;
  mode: "generate" | "edit";
  provider: string | null;
  stylePreset: string | null;
  options: Record<string, unknown>;
  attempts: AiImageRunAttempt[];
  completed: boolean;
  completionPublished: boolean;
  recordAttemptStart(attempt: AiImageRunAttempt): Promise<void>;
  recordAttemptOutcome(attempt: AiImageRunAttempt, outcome: RunAttemptOutcome): Promise<void>;
};

function nowIso(): string {
  return new Date().toISOString();
}

function waitFor(ms: number): Promise<void> {
  if (!ms || ms <= 0) return Promise.resolve();
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function truncateForClarifier(text: string, max = 220): string {
  const normalized = typeof text === "string" ? text.replace(/\s+/g, " ").trim() : "";
  if (!normalized) return "";
  if (normalized.length <= max) return normalized;
  const slicePoint = Math.max(0, max - 3);
  return `${normalized.slice(0, slicePoint)}...`;
}

function normalizeClarifierInput(
  input: PromptClarifierInput | null | undefined,
): NormalizedClarifierInput | null {
  if (!input || typeof input !== "object") return null;
  const questionIdRaw =
    typeof input.questionId === "string" ? input.questionId.trim() : null;
  const answerRaw = typeof input.answer === "string" ? input.answer.trim() : null;
  const skip = Boolean(input.skip);
  const questionId = questionIdRaw && questionIdRaw.length ? questionIdRaw : null;
  const answer = answerRaw && answerRaw.length ? answerRaw : null;
  if (!questionId && !answer && !skip) return null;
  return { questionId, answer, skip };
}

function summarizeHistoryForClarifier(
  history: ComposeDraftOptions["history"],
): Array<{ role: string; content: string }> {
  if (!history || !history.length) return [];
  return history
    .slice(-CLARIFIER_HISTORY_LOOKBACK)
    .map((entry) => ({
      role: entry.role,
      content: truncateForClarifier(entry.content ?? ""),
    }))
    .filter((entry) => entry.content.length > 0);
}

function summarizeAttachmentsForClarifier(
  attachments: ComposeDraftOptions["attachments"],
): string[] {
  if (!attachments || !attachments.length) return [];
  return attachments
    .slice(0, 3)
    .map((attachment) => truncateForClarifier(summarizeAttachmentForConversation(attachment), 180))
    .filter((entry) => entry.length > 0);
}

async function collectClarifierExamples(limit = CLARIFIER_RECENT_RUN_LIMIT): Promise<
  ClarifierExample[]
> {
  const examples: ClarifierExample[] = [...CLARIFIER_STATIC_EXAMPLES];
  if (examples.length >= limit) {
    return examples.slice(0, limit);
  }
  try {
    const runs = await listRecentAiImageRuns({ limit, status: ["succeeded"] });
    for (const run of runs) {
      const promptText = truncateForClarifier(run.userPrompt ?? "");
      const resolvedText = truncateForClarifier(run.resolvedPrompt ?? "");
      if (!promptText || !resolvedText) continue;
      examples.push({
        prompt: promptText,
        resolved: resolvedText,
        style: run.stylePreset ?? null,
        status: run.status,
        model: run.model ?? null,
      });
      if (examples.length >= limit) {
        break;
      }
    }
  } catch (error) {
    console.warn("image clarifier: failed to load recent runs", error);
  }
  return examples.slice(0, limit);
}

async function maybeGenerateImageClarifier(
  userPrompt: string,
  context: ComposeDraftOptions,
  clarifier: NormalizedClarifierInput | null,
): Promise<ClarifyImagePromptPlan | null> {
  if (clarifier?.skip) return null;
  const trimmedPrompt = truncateForClarifier(userPrompt, 320);
  if (!trimmedPrompt) return null;

  try {
    const historySummary = summarizeHistoryForClarifier(context.history);
    const attachmentSummary = summarizeAttachmentsForClarifier(context.attachments);
    const examples = (await collectClarifierExamples()).slice(0, 6);

    const clarifierPayload: Record<string, unknown> = {
      user_prompt: trimmedPrompt,
    };

    if (historySummary.length) {
      clarifierPayload.history = historySummary;
    }
    if (attachmentSummary.length) {
      clarifierPayload.attachments = attachmentSummary;
    }
    if (examples.length) {
      clarifierPayload.examples = examples;
    }
    if (clarifier?.questionId) {
      clarifierPayload.pending_question_id = clarifier.questionId;
    }

    const systemPrompt = [
      "You help Capsules AI clarify image generation requests before creating prompts.",
      "Review the user prompt and context to decide if a follow-up question about style, palette, lighting, medium, or mood is needed.",
      "If everything is already specific, set should_clarify to false.",
      "When asking a question, keep it concise and optionally provide up to three short suggestion options the user could pick.",
      "Do not reference this instruction text in your response.",
    ].join(" ");

    const { content } = await callOpenAIChat(
      [
        { role: "system", content: systemPrompt },
        {
          role: "system",
          content:
            "The user message will be JSON with fields: user_prompt, history, attachments, examples, pending_question_id.",
        },
        { role: "user", content: JSON.stringify(clarifierPayload) },
      ],
      clarifierSchema,
      { temperature: 0.2 },
    );

    const parsed = extractJSON<Record<string, unknown>>(content) ?? {};
    const shouldClarify =
      parsed.should_clarify === undefined ? true : Boolean(parsed.should_clarify);
    if (!shouldClarify) return null;

    const question =
      typeof parsed.question === "string" ? parsed.question.trim() : "";
    if (!question) return null;

    const rationale =
      typeof parsed.rationale === "string" && parsed.rationale.trim().length
        ? parsed.rationale.trim()
        : null;

    const suggestions =
      Array.isArray(parsed.suggestions)
        ? (parsed.suggestions as unknown[])
            .map((entry) => (typeof entry === "string" ? entry.trim() : ""))
            .filter((entry) => entry.length > 0)
            .slice(0, 4)
        : [];

    const styleTraits =
      Array.isArray(parsed.style_traits)
        ? (parsed.style_traits as unknown[])
            .map((entry) => (typeof entry === "string" ? entry.trim() : ""))
            .filter((entry) => entry.length > 0)
            .slice(0, 6)
        : [];

    const questionId = clarifier?.questionId ?? safeRandomUUID();

    console.info("image_clarifier_question", {
      questionId,
      question,
      rationale,
      suggestions,
      styleTraits,
      prompt: trimmedPrompt,
      stylePreset: context.stylePreset ?? null,
    });

    return {
      action: "clarify_image_prompt",
      questionId,
      question,
      rationale,
      suggestions,
      styleTraits,
    };
  } catch (error) {
    console.warn("image clarifier generation failed", error);
    return null;
  }
}

function compactObject(input: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  Object.entries(input).forEach(([key, value]) => {
    if (value !== undefined) {
      result[key] = value;
    }
  });
  return result;
}

function extractOpenAiErrorDetails(error: unknown): OpenAiErrorDetails {
  const fallback: OpenAiErrorDetails = {
    message: "Image request failed",
    code: null,
    status: null,
    meta: null,
  };

  if (!error) return fallback;

  if (error instanceof Error) {
    const enriched = error as Error & {
      code?: string;
      status?: number;
      meta?: unknown;
    };
    const meta =
      enriched.meta && typeof enriched.meta === "object"
        ? { ...(enriched.meta as Record<string, unknown>) }
        : null;

    const openAiMeta =
      meta && typeof meta.error === "object" ? (meta.error as Record<string, unknown>) : null;

    return {
      message: enriched.message || fallback.message,
      code:
        typeof enriched.code === "string"
          ? enriched.code
          : typeof openAiMeta?.code === "string"
            ? (openAiMeta.code as string)
            : typeof openAiMeta?.type === "string"
              ? (openAiMeta.type as string)
              : null,
      status:
        typeof enriched.status === "number"
          ? enriched.status
          : typeof openAiMeta?.status === "number"
            ? (openAiMeta.status as number)
            : null,
      meta,
    };
  }

  if (typeof error === "string") {
    return { ...fallback, message: error };
  }

  return fallback;
}

export type ImageProviderErrorDetails = {
  status?: number;
  code?: string;
  message: string;
};

export function extractImageProviderError(error: unknown): ImageProviderErrorDetails | null {
  if (!error) return null;
  const baseMessage =
    error instanceof Error && typeof error.message === "string" ? error.message.trim() : "";
  const status =
    typeof (error as { status?: unknown })?.status === "number"
      ? ((error as { status?: number }).status as number)
      : undefined;
  const meta = (error as { meta?: unknown })?.meta;

  const coerceMessage = (value: unknown): string | null => {
    if (typeof value === "string") {
      const trimmed = value.trim();
      return trimmed.length ? trimmed : null;
    }
    return null;
  };

  if (meta && typeof meta === "object" && !Array.isArray(meta)) {
    const record = meta as Record<string, unknown>;
    if (record.error && typeof record.error === "object") {
      const err = record.error as Record<string, unknown>;
      const message = coerceMessage(err.message) ?? coerceMessage(record.message) ?? baseMessage;
      const code =
        typeof err.code === "string" && err.code.trim().length ? err.code.trim() : undefined;
      if (message) return { status, code, message };
    }
    if (Array.isArray(record.errors) && record.errors.length) {
      const first = record.errors[0] as Record<string, unknown>;
      const message =
        coerceMessage(first?.message) ?? coerceMessage(record.message) ?? baseMessage;
      const codeCandidate =
        typeof first?.code === "string" && first.code.trim().length
          ? first.code.trim()
          : typeof record.name === "string" && record.name.trim().length
            ? record.name.trim()
            : undefined;
      if (message) {
        return { status, code: codeCandidate, message };
      }
    }
    const message = coerceMessage(record.message);
    if (message) {
      const code =
        typeof record.code === "string" && record.code.trim().length
          ? record.code.trim()
          : undefined;
      return { status, code, message };
    }
  }

  if (baseMessage) {
    return { status, message: baseMessage };
  }

  return null;
}

function shouldRetryError(details: OpenAiErrorDetails): boolean {
  if (details.status === 429) return true;
  if (typeof details.status === "number" && details.status >= 500) return true;
  const message = (details.message ?? "").toLowerCase();
  if (!details.status && /timeout|network|fetch|temporarily unavailable/.test(message)) {
    return true;
  }
  return false;
}

async function createRunState(
  context: ImageRunExecutionContext | undefined,
  resolvedOptions: Record<string, unknown>,
): Promise<RunState | null> {
  if (!context) return null;
  const combinedOptions = compactObject({
    ...(context.options ?? {}),
    ...resolvedOptions,
    candidateProviders:
      context.candidateProviders && context.candidateProviders.length
        ? context.candidateProviders
        : undefined,
  });

  try {
    const run = await createAiImageRun({
      ownerUserId: context.ownerId ?? null,
      capsuleId: context.capsuleId ?? null,
      mode: context.mode,
      assetKind: context.assetKind,
      userPrompt: context.userPrompt,
      resolvedPrompt: context.resolvedPrompt,
      stylePreset: context.stylePreset ?? null,
      provider: context.provider ?? null,
      options: combinedOptions,
    });

    await publishAiImageEvent(context.ownerId ?? null, {
      type: "ai.image.run.started",
      runId: run.id,
      assetKind: run.assetKind,
      mode: run.mode,
      userPrompt: run.userPrompt,
      resolvedPrompt: run.resolvedPrompt,
      stylePreset: run.stylePreset,
      options: run.options ?? {},
    });

    return {
      id: run.id,
      ownerId: context.ownerId ?? null,
      assetKind: run.assetKind,
      mode: run.mode,
      provider: run.provider ?? context.provider ?? "openai",
      stylePreset: run.stylePreset,
      options: run.options ?? {},
      attempts: [],
      completed: false,
      completionPublished: false,
      async recordAttemptStart(this: RunState, attempt: AiImageRunAttempt) {
        this.attempts.push(attempt);
        if (attempt.provider) {
          this.provider = attempt.provider;
        }
        const retryCount = Math.max(0, this.attempts.length - 1);
        try {
          await updateAiImageRun(this.id, {
            status: "running",
            model: attempt.model ?? null,
            provider: attempt.provider ?? this.provider ?? null,
            retryCount,
            attempts: this.attempts,
            options: this.options,
          });
        } catch (error) {
          console.error("AI image run update (start) failed", error);
        }
        await publishAiImageEvent(this.ownerId, {
          type: "ai.image.run.attempt",
          runId: this.id,
          attempt: attempt.attempt,
          model: attempt.model ?? null,
          provider: attempt.provider ?? this.provider ?? null,
          status: "started",
        });
      },
      async recordAttemptOutcome(
        this: RunState,
        attempt: AiImageRunAttempt,
        outcome: RunAttemptOutcome,
      ) {
        const retryCount = Math.max(0, this.attempts.length - 1);
        const patch: UpdateAiImageRunInput = {
          model: attempt.model ?? null,
          provider: attempt.provider ?? this.provider ?? null,
          retryCount,
          attempts: this.attempts,
          options: this.options,
        };

        if (outcome.status === "succeeded") {
          this.completed = true;
          patch.status = "succeeded";
          patch.imageUrl = outcome.imageUrl ?? null;
          patch.responseMetadata = outcome.responseMetadata ?? null;
          patch.errorCode = null;
          patch.errorMessage = null;
          patch.errorMeta = null;
          patch.completedAt = attempt.completedAt ?? nowIso();
        } else {
          patch.status = outcome.terminal ? "failed" : "running";
          patch.errorCode = outcome.error?.code ?? null;
          patch.errorMessage = outcome.error?.message ?? null;
          patch.errorMeta = outcome.error?.meta ?? null;
          if (outcome.terminal) {
            this.completed = true;
            patch.completedAt = attempt.completedAt ?? nowIso();
          }
        }

        try {
          await updateAiImageRun(this.id, patch);
        } catch (error) {
          console.error("AI image run update (outcome) failed", error);
        }

        await publishAiImageEvent(this.ownerId, {
          type: "ai.image.run.attempt",
            runId: this.id,
            attempt: attempt.attempt,
            model: attempt.model ?? null,
            provider: attempt.provider ?? this.provider ?? null,
            status: outcome.status === "succeeded" ? "succeeded" : "failed",
            errorCode: outcome.error?.code ?? null,
            errorMessage: outcome.error?.message ?? null,
          });

        if (this.completed && !this.completionPublished) {
          this.completionPublished = true;
          await publishAiImageEvent(this.ownerId, {
            type: "ai.image.run.completed",
            runId: this.id,
            status: outcome.status === "succeeded" ? "succeeded" : "failed",
            imageUrl: outcome.status === "succeeded" ? outcome.imageUrl ?? null : null,
            errorCode: outcome.error?.code ?? null,
            errorMessage: outcome.error?.message ?? null,
          });
        }
      },
    };
  } catch (error) {
    console.error("AI image run logging init failed", error);
    return null;
  }
}

function extractImageResponseMetadata(
  modelName: string,
  json: Record<string, unknown>,
): Record<string, unknown> {
  const metadata: Record<string, unknown> = {};
  if (typeof json.model === "string") {
    metadata.model = json.model;
  } else {
    metadata.model = modelName;
  }
  if (typeof json.created === "number") {
    metadata.created = json.created;
  }

  if (Array.isArray(json.data)) {
    const first = json.data.find(
      (entry) => entry && typeof entry === "object",
    ) as Record<string, unknown> | null;
    if (first) {
      if (typeof first.revised_prompt === "string") {
        metadata.revisedPrompt = first.revised_prompt;
      }
      if (typeof first.prompt === "string") {
        metadata.prompt = first.prompt;
      }
      metadata.hasUrl = typeof first.url === "string";
      metadata.hasBase64 = typeof first.b64_json === "string";
    }
    metadata.dataCount = json.data.length;
  }

  return metadata;
}
type ProviderAttemptCounter = { value: number };

type ProviderRuntimeParams = {
  prompt: string;
  params: ImageParams;
  delays: number[];
  runState: RunState | null;
  attemptCounter: ProviderAttemptCounter;
  context?: ImageRunExecutionContext;
};

function resolveProviderQueue(
  prompt: string,
  context: ImageRunExecutionContext | undefined,
): ImageProviderId[] {
  const queue: ImageProviderId[] = [];

  const normalizedProvider = (context?.provider ?? null)?.toLowerCase() as ImageProviderId | null;
  if (normalizedProvider && (normalizedProvider === "openai" || normalizedProvider === "stability")) {
    queue.push(normalizedProvider);
  }

  const style = context?.stylePreset ?? null;
  if (style) {
    const override = STYLE_PROVIDER_OVERRIDES[style];
    if (override && !queue.includes(override)) {
      queue.push(override);
    }
  }

  for (const hint of PROMPT_PROVIDER_HINTS) {
    if (hint.pattern.test(prompt) && !queue.includes(hint.provider)) {
      queue.push(hint.provider);
    }
  }

  if (Array.isArray(context?.candidateProviders)) {
    for (const candidate of context?.candidateProviders ?? []) {
      if ((candidate === "openai" || candidate === "stability") && !queue.includes(candidate)) {
        queue.push(candidate);
      }
    }
  }

  // Default ordering
  for (const provider of ["openai", "stability"] as ImageProviderId[]) {
    if (!queue.includes(provider)) {
      queue.push(provider);
    }
  }

  const available = queue.filter((provider) => {
    if (provider === "stability") return hasStabilityApiKey();
    if (provider === "openai") return hasOpenAIApiKey();
    return true;
  });

  return available.length ? available : (["openai"] as ImageProviderId[]);
}

function resolveInitialProvider(
  providers: ImageProviderId[],
  context?: ImageRunExecutionContext,
): string | null {
  if (context?.provider && providers.includes(context.provider as ImageProviderId)) {
    return context.provider;
  }
  return providers[0] ?? null;
}

type ProviderResult = {
  url: string;
  metadata?: Record<string, unknown> | null;
  provider: ImageProviderId;
};

const OPENAI_ALLOWED_SIZES = ["256x256", "512x512", "1024x1024"] as const;
type OpenAiAllowedSize = (typeof OPENAI_ALLOWED_SIZES)[number];

export function normalizeOpenAiImageSize(requested: string | null | undefined): OpenAiAllowedSize {
  if (typeof requested === "string" && requested.trim().length) {
    const normalized = requested.trim().toLowerCase();
    if (OPENAI_ALLOWED_SIZES.includes(normalized as OpenAiAllowedSize)) {
      return normalized as OpenAiAllowedSize;
    }
    const match = normalized.match(/^(\d+)\s*x\s*(\d+)$/);
    if (match) {
      const width = Number.parseInt(match[1], 10);
      const height = Number.parseInt(match[2], 10);
      const largest = Number.isFinite(width) && Number.isFinite(height) ? Math.max(width, height) : width || height;
      if (largest && largest <= 256) return "256x256";
      if (largest && largest <= 512) return "512x512";
      if (largest && largest >= 1024) return "1024x1024";
    }
  }
  return "1024x1024";
}

async function generateWithOpenAI(runtime: ProviderRuntimeParams): Promise<ProviderResult> {
  requireOpenAIKey();

  const isNonProd = (process.env.NODE_ENV ?? "").toLowerCase() !== "production";
  const candidateModels = Array.from(
    new Set(
      [
        isNonProd ? serverEnv.OPENAI_IMAGE_MODEL_DEV : null,
        serverEnv.OPENAI_IMAGE_MODEL,
        isNonProd ? "dall-e-2" : null,
        "gpt-image-1",
        "dall-e-3",
      ].filter((model): model is string => typeof model === "string" && model.length > 0),
    ),
  );

  let lastError: unknown = null;

  for (let modelIndex = 0; modelIndex < candidateModels.length; modelIndex++) {
    const modelName = candidateModels[modelIndex];
    if (!modelName) continue;

    for (let retryIndex = 0; retryIndex < runtime.delays.length; retryIndex++) {
      const delay = runtime.delays[retryIndex] ?? 0;
      if (runtime.attemptCounter.value > 0 && delay > 0) {
        await waitFor(delay);
      }

      runtime.attemptCounter.value += 1;
      const attemptRecord: AiImageRunAttempt = {
        attempt: runtime.attemptCounter.value,
        model: modelName,
        provider: "openai",
        startedAt: nowIso(),
      };

      if (runtime.runState) {
        await runtime.runState.recordAttemptStart(attemptRecord);
      }

      try {
        const normalizedSize = normalizeOpenAiImageSize(runtime.params.size);
        const normalizedQuality =
          runtime.params.quality === "hd" ? ("hd" as const) : ("standard" as const);
        const effectiveQuality =
          normalizedQuality === "hd" && normalizedSize !== "1024x1024" ? "hd" : normalizedQuality;
        const effectiveSize =
          normalizedQuality === "hd" ? ("1024x1024" as const) : normalizedSize;

        const body = {
          model: modelName,
          prompt: runtime.prompt,
          n: 1,
          size: effectiveSize,
          quality: effectiveQuality,
        };

        const response = await fetchOpenAI("/images/generations", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });

        const rawText = await response.text();
        let json: Record<string, unknown> = {};
        try {
          json = rawText ? (JSON.parse(rawText) as Record<string, unknown>) : {};
        } catch {
          json = {};
        }

        if (!response.ok) {
          const error = new Error(`OpenAI image error: ${response.status}`) as Error & {
            status?: number;
            meta?: Record<string, unknown>;
          };
          error.status = response.status;
          error.meta = json;
          throw error;
        }

        const image = Array.isArray(json.data)
          ? (json.data as Array<Record<string, unknown>>)[0]
          : null;
        if (!image) throw new Error("OpenAI image response missing data.");

        const imageData = (image ?? {}) as { url?: unknown; b64_json?: unknown };
        const url =
          typeof imageData.url === "string" ? (imageData.url as string) : null;
        const b64 =
          typeof imageData.b64_json === "string" ? (imageData.b64_json as string) : null;
        if (!url && !b64) {
          throw new Error("OpenAI image response missing url and b64_json.");
        }

        const finalUrl = url ?? `data:image/png;base64,${b64}`;
        const responseMetadata = extractImageResponseMetadata(modelName, json);

        attemptRecord.completedAt = nowIso();
        attemptRecord.meta = { response: responseMetadata };

        if (runtime.runState) {
          await runtime.runState.recordAttemptOutcome(attemptRecord, {
            status: "succeeded",
            imageUrl: finalUrl,
            responseMetadata,
            terminal: true,
          });
        }

        return { url: finalUrl, metadata: responseMetadata, provider: "openai" };
      } catch (error) {
        const details = extractOpenAiErrorDetails(error);
        attemptRecord.completedAt = nowIso();
        attemptRecord.errorCode = details.code;
        attemptRecord.errorMessage = details.message;
        attemptRecord.meta = details.meta;

        const retryable = shouldRetryError(details);
        const hasMoreRetries = retryable && retryIndex < runtime.delays.length - 1;
        const hasMoreModels = modelIndex < candidateModels.length - 1;
        const terminal = !(hasMoreRetries || hasMoreModels);

        if (runtime.runState) {
          await runtime.runState.recordAttemptOutcome(attemptRecord, {
            status: "failed",
            error: details,
            terminal,
          });
        }

        lastError = error;
        if (hasMoreRetries) {
          continue;
        }
        break;
      }
    }
  }

  if (lastError) {
    throw lastError;
  }
  throw new Error("OpenAI provider exhausted without success.");
}

function mapSizeToAspectRatio(size: string): string {
  const parts = String(size ?? "").split("x");
  const width = Number.parseInt(parts[0] ?? "", 10);
  const height = Number.parseInt(parts[1] ?? "", 10);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return "1:1";
  }
  const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));
  const divisor = gcd(width, height);
  return `${width / divisor}:${height / divisor}`;
}

async function generateWithStability(runtime: ProviderRuntimeParams): Promise<ProviderResult> {
  if (!hasStabilityApiKey()) {
    throw new Error("Stability API key is not configured.");
  }

  runtime.attemptCounter.value += 1;
  const attemptRecord: AiImageRunAttempt = {
    attempt: runtime.attemptCounter.value,
    model: serverEnv.STABILITY_IMAGE_MODEL ?? "sd3.5-large",
    provider: "stability",
    startedAt: nowIso(),
  };

  if (runtime.runState) {
    await runtime.runState.recordAttemptStart(attemptRecord);
  }

  try {
    const aspectRatio = mapSizeToAspectRatio(runtime.params.size);
    const stabilityOptions: StabilityGenerateOptions = {
      prompt: runtime.prompt,
      aspectRatio,
      stylePreset: runtime.context?.stylePreset ?? null,
    };
    if (typeof runtime.context?.options?.["seed"] === "number") {
      stabilityOptions.seed = Number(runtime.context?.options?.["seed"]);
    }
    if (typeof runtime.context?.options?.["guidance"] === "number") {
      stabilityOptions.guidance = Number(runtime.context?.options?.["guidance"]);
    }
    const result = await generateStabilityImage(stabilityOptions);

    const finalUrl = `data:${result.mimeType};base64,${result.base64}`;

    attemptRecord.completedAt = nowIso();
    attemptRecord.meta = { response: result.metadata ?? {} };

    if (runtime.runState) {
      await runtime.runState.recordAttemptOutcome(attemptRecord, {
        status: "succeeded",
        imageUrl: finalUrl,
        responseMetadata: result.metadata ?? {},
        terminal: true,
      });
    }

    return { url: finalUrl, metadata: result.metadata ?? {}, provider: "stability" };
  } catch (error) {
    const details = extractOpenAiErrorDetails(error);
    attemptRecord.completedAt = nowIso();
    attemptRecord.errorCode = details.code;
    attemptRecord.errorMessage = details.message;
    attemptRecord.meta = details.meta;

    if (runtime.runState) {
      await runtime.runState.recordAttemptOutcome(attemptRecord, {
        status: "failed",
        error: details,
        terminal: true,
      });
    }
    throw error;
  }
}

export async function generateImageFromPrompt(
  prompt: string,
  options: ImageOptions = {},
  runContext?: ImageRunExecutionContext,
): Promise<ImageGenerationResult> {
  const params = resolveImageParams(options);
  const providerQueue = resolveProviderQueue(prompt, runContext);
  const retryDelays =
    runContext?.retryDelaysMs && runContext.retryDelaysMs.length
      ? runContext.retryDelaysMs.filter((delay) => Number.isFinite(delay) && (delay as number) >= 0)
      : DEFAULT_IMAGE_RETRY_DELAYS_MS;
  const delays = retryDelays.length ? retryDelays : DEFAULT_IMAGE_RETRY_DELAYS_MS;

  const enrichedContext = runContext
    ? {
        ...runContext,
        provider: resolveInitialProvider(providerQueue, runContext),
        candidateProviders: providerQueue,
      }
    : undefined;

  const runState = await createRunState(enrichedContext, {
    size: params.size,
    quality: params.quality,
  });

  const attemptCounter: ProviderAttemptCounter = {
    value: runState ? runState.attempts.length : 0,
  };

  let lastError: unknown = null;

  for (const provider of providerQueue) {
    try {
      const runtime: ProviderRuntimeParams = {
        prompt,
        params,
        delays,
        runState,
        attemptCounter,
      };
      if (runContext) {
        runtime.context = runContext;
      }

      if (provider === "openai") {
        const result = await generateWithOpenAI(runtime);
        console.info("image_generation_completed", {
          provider,
          model: result.metadata?.model ?? serverEnv.OPENAI_IMAGE_MODEL,
          attempts: attemptCounter.value,
        });
        return {
          url: result.url,
          runId: runState?.id ?? null,
          provider: result.provider,
          metadata: result.metadata ?? null,
        };
      }

      if (provider === "stability") {
        const result = await generateWithStability(runtime);
        console.info("image_generation_completed", {
          provider,
          model: result.metadata?.model ?? serverEnv.STABILITY_IMAGE_MODEL ?? "sd3.5-large",
          attempts: attemptCounter.value,
        });
        return {
          url: result.url,
          runId: runState?.id ?? null,
          provider: result.provider,
          metadata: result.metadata ?? null,
        };
      }
    } catch (error) {
      lastError = error;
      console.warn("image_generation_provider_failed", { provider, error });
      continue;
    }
  }

  if (lastError instanceof Error) {
    throw lastError;
  }
  if (lastError) {
    throw new Error(String(lastError));
  }
  throw new Error("Failed to generate image.");
}

export async function editImageWithInstruction(
  imageUrl: string,
  instruction: string,
  options: ImageOptions = {},
  runContext?: ImageRunExecutionContext,
  maskData?: string | null,
): Promise<ImageGenerationResult> {
  requireOpenAIKey();

  const params = resolveImageParams(options);
  const runState = await createRunState(runContext, {
    size: params.size,
    quality: params.quality,
    sourceImageUrl: imageUrl,
  });

  const retryDelays =
    runContext?.retryDelaysMs && runContext.retryDelaysMs.length
      ? runContext.retryDelaysMs.filter((delay) => Number.isFinite(delay) && (delay as number) >= 0)
      : DEFAULT_IMAGE_RETRY_DELAYS_MS;
  const delays = retryDelays.length ? retryDelays : DEFAULT_IMAGE_RETRY_DELAYS_MS;

  let attemptCounter = runState ? runState.attempts.length : 0;

  let buffer: Buffer;
  try {
    const imgResponse = await fetch(imageUrl);
    if (!imgResponse.ok) {
      const error = new Error(`Failed to fetch source image (${imgResponse.status})`) as Error & {
        status?: number;
      };
      error.status = imgResponse.status;
      throw error;
    }

    buffer = Buffer.from(await imgResponse.arrayBuffer());

    try {
      const { default: Jimp } = await import("jimp");
      const image = await Jimp.read(buffer);
      buffer = await image.getBufferAsync(Jimp.MIME_PNG);
    } catch (conversionError) {
      console.warn(
        "PNG conversion failed, attempting edit with original format:",
        (conversionError as Error)?.message,
      );
    }
  } catch (error) {
    const details = extractOpenAiErrorDetails(error);
    if (runState) {
      attemptCounter += 1;
      const attemptRecord: AiImageRunAttempt = {
        attempt: attemptCounter,
        model: null,
        startedAt: nowIso(),
        completedAt: nowIso(),
        errorCode: details.code,
        errorMessage: details.message,
        meta: details.meta,
      };
      await runState.recordAttemptStart(attemptRecord);
      await runState.recordAttemptOutcome(attemptRecord, {
        status: "failed",
        error: details,
        terminal: true,
      });
    }
    throw error;
  }

  const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
  const baseBlob = new Blob([arrayBuffer as ArrayBuffer], { type: "image/png" });

  let maskBlob: Blob | null = null;
  if (maskData) {
    try {
      let maskBuffer: Buffer;
      if (/^data:/i.test(maskData)) {
        const match = maskData.match(/^data:([^;]+);base64,(.*)$/i);
        if (!match) {
          throw new Error("Invalid mask data URI");
        }
        const payload = match[2];
        if (!payload) {
          throw new Error("Invalid mask data URI");
        }
        maskBuffer = Buffer.from(payload, "base64");
      } else {
        const response = await fetch(maskData);
        if (!response.ok) {
          throw new Error(`Failed to fetch mask image (${response.status})`);
        }
        maskBuffer = Buffer.from(await response.arrayBuffer());
      }

      const { default: Jimp } = await import("jimp");
      const sourceMask = await Jimp.read(maskBuffer);
      const processedMask = await new Jimp(
        sourceMask.bitmap.width,
        sourceMask.bitmap.height,
        0xffffffff,
      );
      const targetData = processedMask.bitmap.data;
      sourceMask.scan(0, 0, sourceMask.bitmap.width, sourceMask.bitmap.height, function (_x, _y, idx) {
        const alpha = this.bitmap.data[idx + 3] ?? 0;
        targetData[idx + 3] = alpha > 10 ? 0 : 255;
      });
      const processedBuffer = await processedMask.getBufferAsync(Jimp.MIME_PNG);
      const processedArray = new Uint8Array(processedBuffer);
      maskBlob = new Blob(
        [processedArray.buffer.slice(processedArray.byteOffset, processedArray.byteOffset + processedArray.byteLength)],
        { type: "image/png" },
      );
    } catch (maskError) {
      console.warn("editImageWithInstruction mask processing failed", maskError);
    }
  }

  const promptText = instruction || "Make subtle improvements.";

  const allowedEditModelList = ["gpt-image-1", "dall-e-2", "gpt-image-0721-mini-alpha"];
  const allowedEditModels = new Set(allowedEditModelList.map((model) => model.toLowerCase()));

  const isNonProd = (process.env.NODE_ENV ?? "").toLowerCase() !== "production";
  const pickAllowedModel = (model: string | null | undefined) =>
    model && allowedEditModels.has(model.toLowerCase()) ? model : null;

  const preferredEditModel =
    (isNonProd ? pickAllowedModel(serverEnv.OPENAI_IMAGE_MODEL_DEV) : null) ??
    pickAllowedModel(serverEnv.OPENAI_IMAGE_MODEL) ??
    "gpt-image-1";

  const candidateModels = Array.from(new Set([preferredEditModel, ...allowedEditModelList])).filter(
    (model): model is string => typeof model === "string" && model.length > 0,
  );

  let lastError: unknown = null;

  for (let modelIndex = 0; modelIndex < candidateModels.length; modelIndex++) {
    const modelName = candidateModels[modelIndex];
    if (!modelName) {
      continue;
    }

    for (let retryIndex = 0; retryIndex < delays.length; retryIndex++) {
      const delay = delays[retryIndex] ?? 0;
      if (attemptCounter > 0 && delay > 0) {
        await waitFor(delay);
      }

      attemptCounter += 1;
      const attemptRecord: AiImageRunAttempt = {
        attempt: attemptCounter,
        model: modelName,
        startedAt: nowIso(),
      };

      if (runState) {
        await runState.recordAttemptStart(attemptRecord);
      }

      try {
        const normalizedSize = normalizeOpenAiImageSize(params.size);
        const normalizedQuality =
          params.quality === "hd" ? ("hd" as const) : ("standard" as const);
        const effectiveEditSize =
          normalizedQuality === "hd" ? ("1024x1024" as const) : normalizedSize;

        const fd = new FormData();
        fd.append("model", modelName);
        fd.append("image", baseBlob, "image.png");
        fd.append("prompt", promptText);
        fd.append("size", effectiveEditSize);
        if (maskBlob) fd.append("mask", maskBlob, "mask.png");

        const response = await fetchOpenAI("/images/edits", {
          method: "POST",
          body: fd,
        });

        const rawText = await response.text();
        let json: Record<string, unknown> = {};
        try {
          json = rawText ? (JSON.parse(rawText) as Record<string, unknown>) : {};
        } catch {
          json = {};
        }

        if (!response.ok) {
          const error = new Error(
            `OpenAI image edit error: ${response.status}`,
          ) as Error & { status?: number; meta?: Record<string, unknown> };
          error.status = response.status;
          error.meta = json;
          throw error;
        }

        const image = Array.isArray(json.data)
          ? (json.data as Array<Record<string, unknown>>)[0]
          : null;
        if (!image) throw new Error("OpenAI image edit missing data");

        const imageData = (image ?? {}) as { url?: unknown; b64_json?: unknown };
        const maybeUrl =
          typeof imageData.url === "string" ? (imageData.url as string) : null;
        const maybeB64 =
          typeof imageData.b64_json === "string" ? (imageData.b64_json as string) : null;
        const dataUri = maybeUrl ?? (maybeB64 ? `data:image/png;base64,${maybeB64}` : null);

        if (!dataUri) throw new Error("OpenAI image edit missing url/b64");

        const saved = await storeImageSrcToSupabase(dataUri, "edit");
        const finalUrl = saved?.url ?? dataUri;

        const responseMetadata = extractImageResponseMetadata(modelName, json);

        attemptRecord.completedAt = nowIso();
        attemptRecord.meta = { response: responseMetadata };

        if (runState) {
          await runState.recordAttemptOutcome(attemptRecord, {
            status: "succeeded",
            imageUrl: finalUrl,
            responseMetadata,
            terminal: true,
          });
        }

        return {
          url: finalUrl,
          runId: runState?.id ?? null,
          provider: attemptRecord.provider ?? runState?.provider ?? "openai",
          metadata: responseMetadata,
        };
      } catch (error) {
        const details = extractOpenAiErrorDetails(error);
        attemptRecord.completedAt = nowIso();
        attemptRecord.errorCode = details.code;
        attemptRecord.errorMessage = details.message;
        attemptRecord.meta = details.meta;

        const retryable = shouldRetryError(details);
        const hasMoreRetries = retryable && retryIndex < delays.length - 1;
        const hasMoreModels = modelIndex < candidateModels.length - 1;
        const terminal = !(hasMoreRetries || hasMoreModels);

        if (runState) {
          await runState.recordAttemptOutcome(attemptRecord, {
            status: "failed",
            error: details,
            terminal,
          });
        }

        lastError = error;
        if (hasMoreRetries) {
          continue;
        }
        break;
      }
    }
  }

  if (lastError instanceof Error) {
    throw lastError;
  }
  if (lastError) {
    throw new Error(String(lastError));
  }
  throw new Error("Failed to edit image.");
}

function buildBasePost(incoming: Record<string, unknown> = {}): DraftPost {
  return {
    kind: typeof incoming.kind === "string" ? incoming.kind : "text",

    content: typeof incoming.content === "string" ? incoming.content : "",

    mediaUrl: typeof incoming.mediaUrl === "string" ? incoming.mediaUrl : null,

    mediaPrompt: typeof incoming.mediaPrompt === "string" ? incoming.mediaPrompt : null,
    thumbnailUrl:
      typeof incoming.thumbnailUrl === "string"
        ? incoming.thumbnailUrl
        : typeof incoming.thumbnail_url === "string"
          ? incoming.thumbnail_url
          : null,
    playbackUrl:
      typeof incoming.playbackUrl === "string"
        ? incoming.playbackUrl
        : typeof incoming.playback_url === "string"
          ? incoming.playback_url
          : null,
    muxPlaybackId:
      typeof incoming.muxPlaybackId === "string"
        ? incoming.muxPlaybackId
        : typeof incoming.mux_playback_id === "string"
          ? incoming.mux_playback_id
          : null,
    muxAssetId:
      typeof incoming.muxAssetId === "string"
        ? incoming.muxAssetId
        : typeof incoming.mux_asset_id === "string"
          ? incoming.mux_asset_id
          : null,
    durationSeconds:
      typeof incoming.durationSeconds === "number"
        ? Number(incoming.durationSeconds)
        : typeof incoming.duration_seconds === "number"
          ? Number(incoming.duration_seconds)
          : null,
    videoRunId:
      typeof incoming.videoRunId === "string"
        ? incoming.videoRunId
        : typeof incoming.video_run_id === "string"
          ? incoming.video_run_id
          : null,
    videoRunStatus:
      typeof incoming.videoRunStatus === "string"
        ? (incoming.videoRunStatus as DraftPost["videoRunStatus"])
        : typeof incoming.video_run_status === "string"
          ? (incoming.video_run_status as DraftPost["videoRunStatus"])
          : null,
    videoRunError:
      typeof incoming.videoRunError === "string"
        ? incoming.videoRunError
        : typeof incoming.video_run_error === "string"
          ? incoming.video_run_error
          : null,
    memoryId:
      typeof incoming.memoryId === "string"
        ? incoming.memoryId
        : typeof incoming.memory_id === "string"
          ? incoming.memory_id
          : null,
  };
}

export async function createPostDraft(
  userText: string,
  context: ComposeDraftOptions = {},
): Promise<ComposeDraftResult> {
  const {
    history,
    attachments,
    capsuleId,
    rawOptions,
    clarifier,
    ownerId: explicitOwnerId,
  } = context;
  const preferHints = extractPreferHints(rawOptions ?? null);
  const ownerUserId = (() => {
    if (typeof explicitOwnerId === "string" && explicitOwnerId.trim().length) {
      return explicitOwnerId.trim();
    }
    if (!rawOptions || typeof rawOptions !== "object") return null;
    const candidates = ["ownerUserId", "owner_id", "ownerId"];
    for (const key of candidates) {
      const value = (rawOptions as Record<string, unknown>)[key];
      if (typeof value === "string" && value.trim().length) {
        return value.trim();
      }
    }
    return null;
  })();

  const preferVisual = preferHints.some((hint) => VISUAL_KIND_HINTS.has(hint));
  const preferText = preferHints.some((hint) => TEXT_KIND_HINTS.has(hint));
  const preferVideo = preferHints.some((hint) => VIDEO_KIND_HINTS.has(hint));

  const normalizedClarifier = normalizeClarifierInput(clarifier);
  const priorUserMessage =
    history && history.length
      ? [...history]
          .slice()
          .reverse()
          .find((entry) => entry.role === "user")?.content ?? null
      : null;
  const intentSource = [userText, priorUserMessage].filter(Boolean).join(" ");
  const imageIntent = IMAGE_INTENT_REGEX.test(intentSource);
  const videoIntent = detectVideoIntent(intentSource);
  const historyMessages = mapConversationToMessages(history);
  const clarifierAnswered =
    typeof normalizedClarifier?.answer === "string" && normalizedClarifier.answer.trim().length > 0;
  const clarifierSkip = normalizedClarifier?.skip === true;
  const allowGeneratedMedia =
    !clarifierSkip &&
    !preferText &&
    (preferVisual || preferVideo || imageIntent || videoIntent || clarifierAnswered);

  if (imageIntent && !(normalizedClarifier?.answer || normalizedClarifier?.skip)) {
    const clarifierPlan = await maybeGenerateImageClarifier(
      userText,
      context,
      normalizedClarifier,
    );
    if (clarifierPlan) {
      return clarifierPlan;
    }
  }

  const instructionForModel =
    normalizedClarifier?.answer && priorUserMessage
      ? `${priorUserMessage}\n\nClarification: ${normalizedClarifier.answer}`
      : userText;

  async function inferImagePromptFromInstruction(instruction: string) {
    const { content } = await callOpenAIChat(
      [
        {
          role: "system",

          content:
            "You turn user instructions into a single concise image generation prompt (one sentence). Do not return anything except the prompt text.",
        },

        { role: "user", content: instruction },
      ],

      null,

      { temperature: 0.7 },
    );

    return String(content)
      .replace(/^\s*```(?:json|text)?\s*/i, "")
      .replace(/\s*```\s*$/i, "")
      .trim();
  }

  const userPayload: Record<string, unknown> = { instruction: instructionForModel };
  if (normalizedClarifier?.answer) {
    userPayload.clarifier = compactObject({
      questionId: normalizedClarifier.questionId ?? undefined,
      answer: normalizedClarifier.answer,
      originalPrompt: priorUserMessage ?? undefined,
    });
  }
  if (attachments && attachments.length) {
    userPayload.attachments = attachments.map((attachment) => ({
      name: attachment.name,
      mimeType: attachment.mimeType,
      url: attachment.url,
      thumbnailUrl: attachment.thumbnailUrl ?? null,
    }));
  }
  if (capsuleId) {
    userPayload.capsuleId = capsuleId;
  }
  if (rawOptions && Object.keys(rawOptions).length) {
    userPayload.options = rawOptions;
  }
  if (context.contextMetadata && Object.keys(context.contextMetadata).length) {
    userPayload.contextMetadata = context.contextMetadata;
  }

  const messages: ChatMessage[] = [
    {
      role: "system",

      content: [
        "You are Capsules AI, an assistant that crafts polished social media posts and image prompts for community managers.",

        "Respond with JSON that follows the provided schema. Include engaging copy, actionable call-to-actions, and 1-3 relevant hashtags when appropriate.",

        "If the user requests an image, provide a vivid scene in post.media_prompt and still include post.content as the accompanying caption.",

        "Use clear, energetic but concise language.",
      ].join(" "),
    },

    ...buildContextMessages(context),

    ...historyMessages,

    {
      role: "user",

      content: JSON.stringify(userPayload),
    },
  ];

  const { content } = await callOpenAIChat(messages, creationSchema, { temperature: 0.75 });

  let parsed = extractJSON<Record<string, unknown>>(content);

  if (!parsed) {
    const fallback = await callOpenAIChat(
      [
        {
          role: "system",
          content: "Return only minified JSON matching the expected schema (no commentary).",
        },

        { role: "user", content: JSON.stringify({ instruction: userText }) },
      ],

      null,

      { temperature: 0.7 },
    );

    parsed = extractJSON<Record<string, unknown>>(fallback.content) || {};
  }

  const postResponse = (parsed.post as Record<string, unknown>) ?? {};

  let statusMessage =
    typeof parsed.message === "string" && parsed.message.trim().length
      ? parsed.message.trim()
      : "Here's a draft.";

  const result = buildBasePost();

  result.content = typeof postResponse.content === "string" ? postResponse.content.trim() : "";

  const requestedKindRaw = typeof postResponse.kind === "string" ? postResponse.kind : null;
  const requestedKind =
    requestedKindRaw && requestedKindRaw.trim().length
      ? requestedKindRaw.trim().toLowerCase()
      : null;

  let mediaPrompt =
    typeof postResponse.media_prompt === "string" ? postResponse.media_prompt : null;

  let mediaUrl = typeof postResponse.media_url === "string" ? postResponse.media_url : null;

  if (mediaPrompt && !mediaPrompt.trim()) mediaPrompt = null;
  if (mediaUrl && !mediaUrl.trim()) mediaUrl = null;

  if (!allowGeneratedMedia) {
    mediaPrompt = null;
    mediaUrl = null;
  }

  const videoAttachment =
    attachments?.find(
      (attachment) =>
        attachment?.url &&
        typeof attachment.url === "string" &&
        attachment.url.trim().length > 0 &&
        typeof attachment.mimeType === "string" &&
        attachment.mimeType.toLowerCase().startsWith("video/"),
    ) ?? null;

  let videoResult: VideoGenerationResult | null = null;
  const shouldGenerateVideo =
    allowGeneratedMedia &&
    (requestedKind === "video" || videoIntent || preferVideo || Boolean(videoAttachment));

  if (shouldGenerateVideo) {
    result.videoRunStatus = "running";
    result.videoRunError = null;

    if (mediaUrl) {
      result.kind = "video";
      result.mediaUrl = mediaUrl;
      result.mediaPrompt = mediaPrompt ?? instructionForModel;
      const thumbnailFromResponse =
        typeof postResponse.thumbnail_url === "string"
          ? postResponse.thumbnail_url
          : typeof postResponse.thumbnailUrl === "string"
            ? postResponse.thumbnailUrl
            : null;
      if (thumbnailFromResponse) {
        result.thumbnailUrl = thumbnailFromResponse;
      }
      const playbackFromResponse =
        typeof postResponse.playback_url === "string"
          ? postResponse.playback_url
          : typeof postResponse.playbackUrl === "string"
            ? postResponse.playbackUrl
            : null;
      if (playbackFromResponse) {
        result.playbackUrl = playbackFromResponse;
      }
      const muxPlaybackId =
        typeof postResponse.mux_playback_id === "string"
          ? postResponse.mux_playback_id
          : typeof postResponse.muxPlaybackId === "string"
            ? postResponse.muxPlaybackId
            : null;
      if (muxPlaybackId) {
        result.muxPlaybackId = muxPlaybackId;
      }
      const muxAssetId =
        typeof postResponse.mux_asset_id === "string"
          ? postResponse.mux_asset_id
          : typeof postResponse.muxAssetId === "string"
            ? postResponse.muxAssetId
            : null;
      if (muxAssetId) {
        result.muxAssetId = muxAssetId;
      }
      if (typeof postResponse.duration_seconds === "number") {
        result.durationSeconds = Number(postResponse.duration_seconds);
      }
      if (typeof postResponse.video_run_id === "string" && postResponse.video_run_id.trim().length) {
        result.videoRunId = postResponse.video_run_id.trim();
      } else if (
        typeof postResponse.videoRunId === "string" &&
        postResponse.videoRunId.trim().length &&
        !result.videoRunId
      ) {
        result.videoRunId = postResponse.videoRunId.trim();
      }
      if (typeof postResponse.memory_id === "string" && postResponse.memory_id.trim().length) {
        result.memoryId = postResponse.memory_id.trim();
      } else if (
        typeof postResponse.memoryId === "string" &&
        postResponse.memoryId.trim().length &&
        !result.memoryId
      ) {
        result.memoryId = postResponse.memoryId.trim();
      }
      result.videoRunStatus = result.videoRunStatus ?? "succeeded";
      result.videoRunError = null;
    } else {
      try {
        const videoInstruction = mediaPrompt ?? instructionForModel;
        if (videoAttachment?.url) {
          videoResult = await editVideoWithInstruction(videoAttachment.url, videoInstruction, {
            capsuleId: capsuleId ?? null,
            ownerUserId,
            mode: "edit",
          });
        } else {
          videoResult = await generateVideoFromPrompt(videoInstruction, {
            capsuleId: capsuleId ?? null,
            ownerUserId,
            mode: "generate",
          });
        }
      } catch (error) {
        console.error("Video generation failed for composer prompt:", error);
        const errorMessage =
          error instanceof Error && error.message ? error.message.trim() : "Unknown error";
        result.videoRunStatus = "failed";
        result.videoRunError = errorMessage;
        result.videoRunId = result.videoRunId ?? null;
        if (requestedKind === "video") {
          result.kind = "text";
        }
        result.mediaUrl = null;
        result.playbackUrl = null;
        result.thumbnailUrl = null;
        if (!statusMessage || !statusMessage.trim().length) {
          statusMessage = `I hit a snag while rendering that clip: ${errorMessage}`;
        } else {
          statusMessage = `${statusMessage}\n\nVideo generation error: ${errorMessage}`;
        }
      }
    }
  }

  if (videoResult) {
    const playbackUrl = videoResult.playbackUrl ?? videoResult.url;
    const downloadUrl = videoResult.url ?? videoResult.playbackUrl;
    result.kind = "video";
    result.mediaUrl = playbackUrl;
    result.mediaPrompt = mediaPrompt ?? instructionForModel;
    result.thumbnailUrl =
      videoResult.posterUrl ?? videoResult.thumbnailUrl ?? result.thumbnailUrl ?? null;
    result.playbackUrl = downloadUrl;
    result.muxPlaybackId = videoResult.muxPlaybackId ?? null;
    result.muxAssetId = videoResult.muxAssetId ?? null;
    result.durationSeconds = videoResult.durationSeconds ?? null;
    result.videoRunId = videoResult.runId ?? result.videoRunId ?? null;
    result.videoRunStatus = "succeeded";
    result.videoRunError = null;
    if (videoResult.memoryId) {
      result.memoryId = videoResult.memoryId;
    }
  }

  if (
    (videoResult || result.kind === "video") &&
    (!statusMessage || statusMessage === "Here's a draft.")
  ) {
    statusMessage = "Rendered a new clip. Tap play to preview and let me know any tweaks.";
  }

  if (result.kind !== "video") {
    if (allowGeneratedMedia && mediaUrl) {
      result.mediaUrl = mediaUrl;

      result.mediaPrompt = mediaPrompt || result.mediaPrompt;

      result.kind = requestedKind || "image";
    } else if (allowGeneratedMedia && mediaPrompt) {
      try {
        const generatedImage = await generateImageFromPrompt(mediaPrompt);

        result.mediaUrl = generatedImage.url;

        result.kind = "image";

        result.mediaPrompt = mediaPrompt;
      } catch (error) {
        console.error("Image generation failed for composer prompt:", error);

        result.kind = requestedKind || "text";

        mediaPrompt = null;
      }
    } else if (allowGeneratedMedia && !mediaPrompt && imageIntent) {
      try {
        mediaPrompt = await inferImagePromptFromInstruction(instructionForModel);
      } catch {
        // ignore inference failure
      }

      if (mediaPrompt) {
        try {
          const fallbackImage = await generateImageFromPrompt(mediaPrompt);

          result.mediaUrl = fallbackImage.url;

          result.kind = "image";

          result.mediaPrompt = mediaPrompt;
        } catch (error) {
          console.error("Image generation failed (intent path):", error);
        }
      }
    } else if (requestedKind && requestedKind !== "video") {
      result.kind = requestedKind === "image" && !allowGeneratedMedia ? "text" : requestedKind;
    } else {
      result.kind = result.mediaUrl ? "image" : "text";
    }
  } else if (!result.mediaUrl && mediaUrl) {
    result.mediaUrl = mediaUrl;
  }

  if (!result.mediaUrl) {
    result.mediaPrompt = null;
  }

  if (!result.content && result.mediaUrl) {
    result.content = "Here is the new visual. Let me know if you want changes to the copy!";
  }

  try {
    if (
      result.kind === "image" &&
      result.mediaUrl &&
      /^(?:https?:|data:)/i.test(result.mediaUrl)
    ) {
      const saved = await storeImageSrcToSupabase(result.mediaUrl, "generate");

      if (saved?.url) {
        result.mediaUrl = saved.url;
      }
    }
  } catch (error) {
    console.warn("Supabase store (create) failed:", (error as Error)?.message);
  }

  const postPayload: Record<string, unknown> = { ...result };
  if (result.thumbnailUrl) {
    postPayload.thumbnailUrl = result.thumbnailUrl;
    postPayload.thumbnail_url = result.thumbnailUrl;
  }
  if (result.playbackUrl) {
    postPayload.playbackUrl = result.playbackUrl;
    postPayload.playback_url = result.playbackUrl;
  }
  if (result.muxPlaybackId) {
    postPayload.muxPlaybackId = result.muxPlaybackId;
    postPayload.mux_playback_id = result.muxPlaybackId;
  }
  if (result.muxAssetId) {
    postPayload.muxAssetId = result.muxAssetId;
    postPayload.mux_asset_id = result.muxAssetId;
  }
  if (typeof result.durationSeconds === "number") {
    postPayload.duration_seconds = result.durationSeconds;
  }
  if (result.videoRunId) {
    postPayload.videoRunId = result.videoRunId;
    postPayload.video_run_id = result.videoRunId;
  }
  if (result.videoRunStatus) {
    postPayload.videoRunStatus = result.videoRunStatus;
    postPayload.video_run_status = result.videoRunStatus;
  }
  if (result.videoRunError) {
    postPayload.videoRunError = result.videoRunError;
    postPayload.video_run_error = result.videoRunError;
  }
  if (result.memoryId) {
    postPayload.memoryId = result.memoryId;
    postPayload.memory_id = result.memoryId;
  }

  return { action: "draft_post", message: statusMessage, post: postPayload };
}

export async function createPollDraft(
  userText: string,
  hint: Record<string, unknown> = {},
  context: ComposeDraftOptions = {},
): Promise<PollDraft> {
  const { history, attachments, capsuleId, rawOptions } = context;
  const historyMessages = mapConversationToMessages(history);
  const system = [
    "You are Capsules AI. Create a concise poll from the user instruction.",

    "Return JSON with a friendly message and a poll containing a question and 2-6 short, distinct options.",

    "Derive specific options from the topic (e.g., days of the week, product names); do not default to Yes/No unless explicitly requested.",

    "Only include options you are confident are accurate. If the request references brand-new or uncertain releases, use broad but relevant categories instead of inventing specific items.",

    "Keep options succinct (1-3 words when possible).",
  ].join(" ");

  const userPayload: Record<string, unknown> = { instruction: userText, seed: hint || {} };
  if (attachments && attachments.length) {
    userPayload.attachments = attachments.map((attachment) => ({
      name: attachment.name,
      mimeType: attachment.mimeType,
      url: attachment.url,
    }));
  }
  if (capsuleId) {
    userPayload.capsuleId = capsuleId;
  }
  if (rawOptions && Object.keys(rawOptions).length) {
    userPayload.options = rawOptions;
  }
  if (context.contextMetadata && Object.keys(context.contextMetadata).length) {
    userPayload.contextMetadata = context.contextMetadata;
  }

  const messages: ChatMessage[] = [
    { role: "system", content: system },

    ...buildContextMessages(context),

    ...historyMessages,

    { role: "user", content: JSON.stringify(userPayload) },
  ];

  const { content } = await callOpenAIChat(messages, pollSchema, { temperature: 0.5 });

  const parsed = extractJSON<Record<string, unknown>>(content) || {};

  let question = String(
    (parsed?.poll && (parsed.poll as Record<string, unknown>)?.question) || hint.question || "",
  ).trim();

  let options = Array.isArray(parsed?.poll && (parsed.poll as Record<string, unknown>)?.options)
    ? ((parsed.poll as Record<string, unknown>).options as unknown[])
        .map((entry) => String(entry ?? "").trim())
        .filter(Boolean)
    : [];

  if (!question) question = "What do you think?";

  if (!options.length && Array.isArray(hint.options)) {
    options = (hint.options as unknown[])
      .map((entry) => String(entry ?? "").trim())
      .filter(Boolean);
  }

  if (!options.length) options = ["Yes", "No"];

  const deduped = Array.from(new Set(options));

  options = deduped.length >= 2 ? deduped.slice(0, 6) : options.slice(0, 6);

  const rawMessage =
    typeof parsed.message === "string" && parsed.message.trim()
      ? parsed.message.trim()
      : "Here's a poll draft to start with.";
  const followUp =
    "Want me to tweak the question, add more options, or craft the intro copy?";
  const message = /add more options|tweak the question|anything else/i.test(rawMessage)
    ? rawMessage
    : `${rawMessage}${/[.!?]$/.test(rawMessage) ? "" : "."} ${followUp}`;

  return { message, poll: { question, options } };
}

export async function refinePostDraft(
  userText: string,

  incomingPost: Record<string, unknown>,

  context: ComposeDraftOptions = {},
): Promise<Record<string, unknown>> {
  const { history, attachments, capsuleId, rawOptions } = context;
  const historyMessages = mapConversationToMessages(history);
  const base = buildBasePost(incomingPost);

  const userPayload: Record<string, unknown> = {
    instruction: userText,
    post: incomingPost,
  };
  if (attachments && attachments.length) {
    userPayload.attachments = attachments.map((attachment) => ({
      name: attachment.name,
      mimeType: attachment.mimeType,
      url: attachment.url,
    }));
  }
  if (capsuleId) {
    userPayload.capsuleId = capsuleId;
  }
  if (rawOptions && Object.keys(rawOptions).length) {
    userPayload.options = rawOptions;
  }
  if (context.contextMetadata && Object.keys(context.contextMetadata).length) {
    userPayload.contextMetadata = context.contextMetadata;
  }

  const messages: ChatMessage[] = [
    {
      role: "system",

      content: [
        "You are Capsules AI, helping a user refine an in-progress social media post.",

        "Output JSON per the provided schema. Update post.content to reflect the new instruction.",

        "If the user requests new imagery, provide a short, concrete description via post.media_prompt. Lean on the current media description when the edit should be a remix rather than a brand new visual.",

        "If the user wants adjustments to the existing image, set post.edit_current_media to true and combine the current media prompt with the requested changes instead of inventing an unrelated scene.",

        "Keep tone consistent with the instruction and the existing copy.",
      ].join(" "),
    },

    ...buildContextMessages(context),

    ...historyMessages,

    {
      role: "user",

      content: JSON.stringify(userPayload),
    },
  ];

  const { content } = await callOpenAIChat(messages, editSchema, { temperature: 0.6 });

  const parsed = extractJSON<Record<string, unknown>>(content) || {};

  const postResponse = (parsed.post as Record<string, unknown>) ?? {};

  const statusMessage =
    typeof parsed.message === "string" && parsed.message.trim()
      ? parsed.message.trim()
      : "Here you go.";

  const next = buildBasePost(base);

  next.content =
    typeof postResponse.content === "string" ? postResponse.content.trim() : next.content;

  const keepExisting = postResponse.keep_existing_media === true;

  const editCurrent = postResponse.edit_current_media === true;

  const candidatePrompt =
    typeof postResponse.media_prompt === "string" ? postResponse.media_prompt.trim() : "";

  const candidateUrl =
    typeof postResponse.media_url === "string" ? postResponse.media_url.trim() : "";

  if (candidateUrl) {
    next.mediaUrl = candidateUrl;

    next.mediaPrompt = candidatePrompt || next.mediaPrompt;

    next.kind = typeof postResponse.kind === "string" ? postResponse.kind : next.kind;
  } else if (candidatePrompt) {
    try {
      const iterationImage = await generateImageFromPrompt(candidatePrompt);

      next.mediaUrl = iterationImage.url;

      next.mediaPrompt = candidatePrompt;

      next.kind = "image";
    } catch (error) {
      console.error("Image generation failed for refine:", error);
    }
  } else if (!keepExisting) {
    next.mediaPrompt = null;

    if (!editCurrent) {
      next.mediaUrl = null;
    }
  }

  if (editCurrent && base.mediaUrl) {
    try {
      const combinedPrompt = [base.mediaPrompt || "", candidatePrompt || userText]
        .filter(Boolean)
        .join(" ");

      const editedResult = await editImageWithInstruction(
        base.mediaUrl,
        combinedPrompt || userText,
        {},
      );

      next.mediaUrl = editedResult.url;

      next.mediaPrompt = combinedPrompt || userText;

      next.kind = "image";
    } catch (error) {
      console.error("Edit current image failed:", error);
    }
  }

  if (!next.mediaUrl) {
    next.mediaPrompt = null;
  }

  return { action: "draft_post", message: statusMessage, post: next };
}

export async function summarizeFeedFromDB({
  capsuleId,

  limit = 30,
}: {
  capsuleId: string | null;

  limit?: number;
}): Promise<FeedSummary> {
  const db = getDatabaseAdminClient();

  type FeedRow = {
    id: string;
    kind: string | null;
    content: string | null;
    media_url: string | null;
    media_prompt: string | null;
    user_name: string | null;
    capsule_id: string | null;
    created_at: string | null;
  };

  let query = db
    .from("posts_view")
    .select<FeedRow>("id,kind,content,media_url,media_prompt,user_name,capsule_id,created_at")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (capsuleId) {
    query = query.eq("capsule_id", capsuleId);
  }

  const result = await query.fetch();
  if (result.error) {
    throw new Error("summarizeFeedFromDB failed: " + result.error.message);
  }

  const rows = result.data ?? [];

  const posts = rows.map((row) => ({
    id: row.id,

    kind: row.kind,

    content: row.content || "",

    media: Boolean(row.media_url),

    media_prompt: row.media_prompt || null,

    user: row.user_name || null,

    created_at: row.created_at,
  }));

  const summaryResponse = await callOpenAIChat(
    [
      {
        role: "system",

        content:
          "You are Capsules AI. Summarize a feed of user posts in a friendly conversational tone. Focus on notable activity, what the visuals convey, and the community's energy. If captions are missing, infer intent from attachment context instead of dwelling on the absence. Mention image or video themes briefly and provide one relevant post idea the user could publish next.",
      },

      { role: "user", content: JSON.stringify({ capsule_id: capsuleId || null, posts }) },
    ],

    feedSummarySchema,

    { temperature: 0.5 },
  );

  const parsed = extractJSON<Record<string, unknown>>(summaryResponse.content) || {};

  const message =
    typeof parsed.message === "string" && parsed.message.trim()
      ? parsed.message.trim()
      : "Here is a brief summary of recent activity.";

  let suggestionTitle =
    typeof parsed.suggested_title === "string" ? parsed.suggested_title.trim() : "";

  let suggestionPrompt =
    typeof parsed.suggested_post_prompt === "string" ? parsed.suggested_post_prompt.trim() : "";

  if (!suggestionPrompt) {
    try {
      const secondary = await callOpenAIChat(
        [
          {
            role: "system",

            content:
              "Given a feed summary, propose a single relevant post idea. Return JSON with suggested_title and suggested_post_prompt fields. Keep the prompt one sentence.",
          },

          {
            role: "user",
            content: JSON.stringify({ summary: message, bullets: parsed.bullets || [] }),
          },
        ],

        {
          name: "SuggestionOnly",

          schema: {
            type: "object",

            additionalProperties: false,

            required: ["suggested_post_prompt"],

            properties: {
              suggested_title: { type: "string" },

              suggested_post_prompt: { type: "string" },
            },
          },
        },

        { temperature: 0.6 },
      );

      const fallback = extractJSON<Record<string, unknown>>(secondary.content) || {};

      suggestionTitle =
        typeof fallback.suggested_title === "string" && fallback.suggested_title.trim()
          ? fallback.suggested_title.trim()
          : suggestionTitle;

      suggestionPrompt =
        typeof fallback.suggested_post_prompt === "string" && fallback.suggested_post_prompt.trim()
          ? fallback.suggested_post_prompt.trim()
          : suggestionPrompt;
    } catch {
      // ignore secondary failure
    }
  }

  const bullets = Array.isArray(parsed.bullets)
    ? (parsed.bullets as unknown[]).map((entry) => String(entry ?? "").trim()).filter(Boolean)
    : [];

  const nextActions = Array.isArray(parsed.next_actions)
    ? (parsed.next_actions as unknown[]).map((entry) => String(entry ?? "").trim()).filter(Boolean)
    : [];

  return {
    message,

    bullets,

    next_actions: nextActions,

    suggestion:
      suggestionTitle || suggestionPrompt
        ? { title: suggestionTitle || null, prompt: suggestionPrompt || null }
        : null,
  };
}

function decodeBase64ToUint8Array(base64: string): Uint8Array {
  const normalized = base64
    .replace(/[\r\n\s]+/g, "")
    .replace(/-/g, "+")
    .replace(/_/g, "/");
  const padLength = normalized.length % 4;
  const padded = padLength ? normalized + "=".repeat(4 - padLength) : normalized;

  if (typeof globalThis.atob === "function") {
    const binary = globalThis.atob(padded);
    const length = binary.length;
    const bytes = new Uint8Array(length);
    for (let index = 0; index < length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }
    return bytes;
  }

  const bufferConstructor = (globalThis as {
    Buffer?: { from(input: string, encoding: string): Uint8Array };
  }).Buffer;
  if (bufferConstructor && typeof bufferConstructor.from === "function") {
    const nodeBuffer = bufferConstructor.from(padded, "base64");
    return new Uint8Array(nodeBuffer.buffer, nodeBuffer.byteOffset, nodeBuffer.byteLength);
  }

  throw new Error("Base64 decoding is not supported in this runtime.");
}

function parseBase64Audio(
  input: string,
  fallbackMime: string | null,
): { bytes: Uint8Array; mime: string | null } {
  if (!input) {
    throw new Error("audio_base64 is required");
  }

  let base64 = input.trim();

  let detectedMime = fallbackMime || "";

  const dataUrlMatch = base64.match(/^data:([^;,]+)(?:;[^,]*)?,/i);

  if (dataUrlMatch) {
    const matchMime = dataUrlMatch[1];
    if (matchMime) {
      detectedMime = detectedMime || matchMime;
    }

    base64 = base64.slice(dataUrlMatch[0].length);
  }

  const bytes = decodeBase64ToUint8Array(base64);

  const mime = detectedMime || fallbackMime || "audio/webm";

  return { bytes, mime };
}

function audioExtensionFromMime(mime: string) {
  const value = mime.toLowerCase();

  if (value.includes("ogg")) return "ogg";

  if (value.includes("mp3") || value.includes("mpeg")) return "mp3";

  if (value.includes("mp4")) return "mp4";

  if (value.includes("wav")) return "wav";

  if (value.includes("m4a")) return "m4a";

  return "webm";
}

export async function transcribeAudioFromBase64({
  audioBase64,

  mime,
}: {
  audioBase64: string;

  mime: string | null;
}): Promise<{ text: string; model: string | null; raw: Json | null }> {
  requireOpenAIKey();

  const { bytes, mime: resolvedMime } = parseBase64Audio(audioBase64, mime);

  const audioBuffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  const blob = new Blob([audioBuffer], { type: resolvedMime || "audio/webm" });

  const extension = audioExtensionFromMime(resolvedMime || "audio/webm");

  const filename = `recording.${extension}`;

  const models = Array.from(
    new Set(
      [serverEnv.OPENAI_TRANSCRIBE_MODEL, "gpt-4o-mini-transcribe", "whisper-1"].filter(Boolean),
    ),
  );

  let lastError: Error | null = null;

  for (const model of models) {
    try {
      const fd = new FormData();

      fd.append("file", blob, filename);

      fd.append("model", model);

      const response = await fetchOpenAI("/audio/transcriptions", {
        method: "POST",

        body: fd,
      });

      const json = (await response.json().catch(() => ({}))) as Json;

      if (!response.ok) {
        const payload = json as Record<string, unknown>;

        const rawError = payload?.error;

        let errorMessage = `OpenAI transcription error: ${response.status}`;

        if (typeof rawError === "string") {
          errorMessage = rawError;
        } else if (rawError && typeof rawError === "object" && "message" in rawError) {
          const maybeMessage = (rawError as { message?: unknown }).message;

          if (typeof maybeMessage === "string" && maybeMessage.length) {
            errorMessage = maybeMessage;
          }
        }

        const error = new Error(errorMessage);

        (error as Error & { meta?: Json; status?: number }).meta = json;

        (error as Error & { status?: number }).status = response.status;

        lastError = error;

        continue;
      }

      const record = json as Record<string, unknown>;

      const transcript =
        typeof record.text === "string"
          ? record.text
          : typeof record.transcript === "string"
            ? record.transcript
            : "";

      return { text: transcript.toString(), raw: json, model };
    } catch (error) {
      lastError = error as Error;
    }
  }

  if (lastError) throw lastError;

  throw new Error("Transcription failed");
}
