import "@/lib/polyfills/dom-parser";

import { getDatabaseAdminClient } from "@/config/database";
import type { ComposerChatAttachment, ComposerChatMessage } from "@/lib/composer/chat-types";
import { detectVideoIntent, extractPreferHints } from "@/shared/ai/video-intent";
import { extractComposerImageOptions } from "@/lib/composer/image-settings";
import {
  callOpenAIChat,
  extractJSON,
  type ChatMessage,
  type JsonSchema,
} from "./prompter/core";
import { serverEnv } from "../env/server";
import {
  composeMediaPrompt,
  generateComposerVideo,
  type VideoAttachment,
} from "./prompter/videos";
import {
  editImageWithInstruction,
  generateImageFromPrompt,
  maybeGenerateImageClarifier,
  normalizeClarifierInput,
  storeComposerImageMemory,
  promptFeelsDescriptive,
  compactObject,
  type ImageRunExecutionContext,
} from "./prompter/images";
import { storeImageSrcToSupabase } from "../supabase/storage";

export {
  AIConfigError,
  callOpenAIChat,
  extractJSON,
  requireOpenAIKey,
  type ChatMessage,
  type Json,
  type JsonSchema,
} from "./prompter/core";
export { transcribeAudioFromBase64 } from "./prompter/transcription";
export {
  editImageWithInstruction,
  extractImageProviderError,
  generateImageFromPrompt,
  normalizeOpenAiImageSize,
  type ImageGenerationResult,
  type ImageProviderErrorDetails,
  type ImageRunExecutionContext,
} from "./prompter/images";

type DraftPost = {
  kind: string;

  content: string;

  mediaUrl: string | null;

  mediaPrompt: string | null;
  thumbnailUrl: string | null;
  playbackUrl: string | null;
  muxPlaybackId: string | null;
  muxAssetId: string | null;
  durationSeconds: number | null;
  videoRunId: string | null;
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
  return parts.join(" ");
}

function selectHistoryLimit(userText: string | undefined): number {
  const length = typeof userText === "string" ? userText.trim().length : 0;
  if (length === 0) return HISTORY_MESSAGE_LIMIT;
  // Short "tweak" edits generally do not need deep history.
  return length <= 160 ? Math.min(4, HISTORY_MESSAGE_LIMIT) : HISTORY_MESSAGE_LIMIT;
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
    // Only include user-provided reference attachments to avoid resending AI-generated media.
    const promptAttachments =
      role === "user" && entry.attachments?.length
        ? entry.attachments
            .filter((attachment) => (attachment.role ?? "reference") === "reference")
            .slice(0, 3)
        : [];
    const attachmentsNote = promptAttachments.length
      ? `\n\nAttachments referenced:\n${promptAttachments
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
      const snippet = record.snippet.length > 800 ? `${record.snippet.slice(0, 800)}...` : record.snippet;
      lines.push(snippet);
      if (record.url) {
        const safeUrl =
          record.url.length > 256 || /^data:/i.test(record.url) ? "[attachment]" : record.url;
        lines.push(`media: ${safeUrl}`);
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

type DraftPostPlan = {
  action: "draft_post";
  message?: string;
  post: Record<string, unknown>;
  choices?: Array<{ key: string; label: string }>;
};

export type ClarifyImagePromptPlan = {
  action: "clarify_image_prompt";
  questionId: string;
  question: string;
  rationale?: string | null;
  suggestions?: string[];
  styleTraits?: string[];
};



const _CLARIFIER_STYLE_KEYWORDS = [
  "realistic",
  "hyper-real",
  "photoreal",
  "cinematic",
  "futuristic",
  "retro",
  "vintage",
  "noir",
  "pastel",
  "cartoon",
  "cartoonish",
  "anime",
  "manga",
  "pixel",
  "pixelated",
  "low poly",
  "low-poly",
  "gritty",
  "moody",
  "surreal",
  "abstract",
  "minimalist",
  "flat",
  "vaporwave",
  "brutalist",
  "bold",
  "luxury",
  "watercolor",
  "oil painting",
  "sketch",
  "illustration",
  "comic",
  "storybook",
];

const _CLARIFIER_STYLE_PATTERNS = [
  /\b(isometric|3d|3-d)\s+(render|model|illustration)\b/i,
  /\b(?:oil|watercolor|acrylic|gouache|charcoal|ink|pencil)\s+(?:painting|drawing|sketch)\b/i,
  /\bcyberpunk\b/i,
  /\b(?:pop|street)\s+art\b/i,
  /\bcinematic\b/i,
  /\b(?:film|motion|dramatic)\s+lighting\b/i,
  /\b(?:studio|natural|golden|neon)\s+light/i,
  /\b(?:vector|flat|minimal)\s+(?:illustration|graphic|art)\b/i,
  /\b(?:storybook|storybook-style)\b/i,
  /\b(?:logo|poster|cover)\s+(?:concept|direction)\b/i,
];

const _PROMPT_DETAIL_KEYWORDS = [
  "with",
  "featuring",
  "against",
  "over",
  "under",
  "beneath",
  "surrounded",
  "crowded",
  "storm",
  "sunset",
  "sunrise",
  "night",
  "dawn",
  "dusk",
  "rain",
  "snow",
  "mist",
  "fire",
  "battle",
  "heroic",
  "intense",
  "dramatic",
  "cinematic",
  "epic",
  "futuristic",
  "retro",
  "neon",
  "dogfight",
  "dogfighting",
  "jets",
  "aircraft",
  "warrior",
  "landscape",
  "mountain",
  "ocean",
  "city",
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

export type ComposeDraftOptions = {
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

const MODEL_STRING_SOFT_LIMIT = 4000;

function isDataUri(value: string): boolean {
  return /^data:/i.test(value.trim());
}

export function sanitizePostForModel(
  post: Record<string, unknown> | null | undefined,
): Record<string, unknown> | null {
  if (!post || typeof post !== "object") return null;

  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(post)) {
    if (value === undefined || value === null) continue;
    if (typeof value === "string") {
      const trimmed = value.trim();
      if (!trimmed.length) continue;

      const lowerKey = key.toLowerCase();
      if (lowerKey.includes("url")) {
        if (isDataUri(trimmed)) continue; // drop giant data URIs to keep prompts small
        result[key] = trimmed.slice(0, 1024);
        continue;
      }

      result[key] =
        trimmed.length > MODEL_STRING_SOFT_LIMIT
          ? `${trimmed.slice(0, MODEL_STRING_SOFT_LIMIT)}...`
          : trimmed;
      continue;
    }

    if (Array.isArray(value)) {
      // avoid shipping large arrays to the model; keep small ones only
      if (value.length > 16) continue;
      result[key] = value;
      continue;
    }

    if (typeof value === "object") {
      // shallow copy small nested objects; skip huge ones
      const entries = Object.entries(value as Record<string, unknown>);
      if (entries.length > 24) continue;
      result[key] = value;
      continue;
    }

    result[key] = value;
  }

  if (!Object.keys(result).length) return null;
  return result;
}

function buildImageRunContext(
  prompt: string,
  context: ComposeDraftOptions,
  options?: Record<string, unknown>,
  mode: "generate" | "edit" = "generate",
): ImageRunExecutionContext {
  const resolvedOptions = options ?? context.rawOptions ?? null;
  return {
    ownerId: context.ownerId ?? null,
    capsuleId: context.capsuleId ?? null,
    assetKind: "composer_image",
    mode,
    userPrompt: prompt,
    resolvedPrompt: prompt,
    stylePreset: context.stylePreset ?? null,
    ...(resolvedOptions ? { options: resolvedOptions } : {}),
  };
}

const nullableStringSchema = {
  anyOf: [{ type: "string" }, { type: "null" }],
};

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

function normalizeTopicForMessage(input: string | null | undefined, fallback = "that idea"): string {
  if (typeof input !== "string") return fallback;
  const condensed = input.replace(/\s+/g, " ").trim();
  if (!condensed.length) return fallback;
  if (condensed.length <= 90) return condensed;
  return `${condensed.slice(0, 87).trim()}...`;
}

function sanitizeAssistantTone(message: string | null | undefined): string {
  if (!message) return "";
  return message
    .trim();
}

function assistantMessageHasError(message: string): boolean {
  return /\b(error|snag|fail|issue|problem|apologize|sorry)\b/i.test(message);
}

function extractEditSuggestions(raw: unknown): string[] {
  if (!raw) return [];
  const normalize = (value: string) =>
    value
      .replace(/^[\s\-\u2022*]+/, "")
      .trim()
      .replace(/\.+$/, "");
  const collect = (values: string[]): string[] =>
    values
      .map((entry) => (typeof entry === "string" ? normalize(entry) : ""))
      .filter((entry) => entry.length > 0)
      .slice(0, 3);
  if (Array.isArray(raw)) {
    return collect(raw as string[]);
  }
  if (typeof raw === "string") {
    const parts = raw.split(/[\n;,]+/);
    return collect(parts);
  }
  return [];
}

function buildSuggestionSentence(suggestions: string[], kind: string | null | undefined): string {
  let defaults: string[];
  if (kind === "video") {
    defaults = ["tighten the pacing", "swap a scene", "boost the transitions"];
  } else if (kind === "image") {
    defaults = ["adjust the colors", "try another angle", "add a new background"];
  } else {
    defaults = ["tighten the hook", "add hashtags", "shorten it to a one-liner"];
  }
  const ideas = (suggestions.length ? suggestions : defaults).slice(0, 2);
  if (!ideas.length) return "Let me know if you'd like any tweaks.";
  if (ideas.length === 1) return `Want me to ${ideas[0]} next?`;
  return `Want me to ${ideas[0]} or ${ideas[1]} next?`;
}

type AssistantMessageContext = {
  base: string | null | undefined;
  requestText: string;
  assetKind: string | null | undefined;
  hasImage: boolean;
  hasVideo: boolean;
  suggestions: string[];
};

function finalizeAssistantMessage(context: AssistantMessageContext): string {
  const topic = normalizeTopicForMessage(context.requestText, "that visual");
  const sanitized = sanitizeAssistantTone(context.base);
  if (sanitized && assistantMessageHasError(sanitized)) {
    return sanitized;
  }
  const suggestionSentence = buildSuggestionSentence(context.suggestions, context.assetKind ?? null);
  if (sanitized) {
    const alreadyInvitesFeedback = /\b(tweak|adjust|change|edit|iterate|else|let me know)\b/i.test(sanitized);
    if (alreadyInvitesFeedback) {
      return sanitized;
    }
    return `${sanitized}\n\n${suggestionSentence}`;
  }
  if (context.hasImage) {
    return `Got it - I pulled together ${topic}. Here's the new visual.\n\n${suggestionSentence}`;
  }
  if (context.hasVideo) {
    return `Got it - I staged the clip for ${topic}.\n\n${suggestionSentence}`;
  }
  return `Got it - here's where I'd take ${topic}.\n\n${suggestionSentence}`;
}

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

  const chatOnlyFlag =
    rawOptions &&
    typeof rawOptions === "object" &&
    ((rawOptions as { chatOnly?: unknown }).chatOnly === true ||
      (rawOptions as { chat_only?: unknown }).chat_only === true);
  const preferVisual = !chatOnlyFlag && preferHints.some((hint) => VISUAL_KIND_HINTS.has(hint));
  const preferText = chatOnlyFlag || preferHints.some((hint) => TEXT_KIND_HINTS.has(hint));
  const preferVideo = chatOnlyFlag ? false : preferHints.some((hint) => VIDEO_KIND_HINTS.has(hint));

  const normalizedClarifier = normalizeClarifierInput(clarifier);
  const imageOptions = extractComposerImageOptions(rawOptions);
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
  const historyMessages = mapConversationToMessages(history, selectHistoryLimit(userText));
  const clarifierAnswered =
    typeof normalizedClarifier?.answer === "string" && normalizedClarifier.answer.trim().length > 0;
  const clarifierSkip = normalizedClarifier?.skip === true;
  const wantsAnyMedia = preferVisual || preferVideo || imageIntent || videoIntent || clarifierAnswered;
  const allowGeneratedMedia =
    !chatOnlyFlag &&
    !clarifierSkip &&
    wantsAnyMedia &&
    (!preferText || imageIntent || videoIntent);

  const shouldClarifyImageRequest =
    imageIntent &&
    !(normalizedClarifier?.answer || normalizedClarifier?.skip) &&
    !promptFeelsDescriptive(userText, context);

  if (shouldClarifyImageRequest) {
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

      {
        temperature: 0.7,
        model: serverEnv.OPENAI_MODEL_NANO ?? serverEnv.OPENAI_MODEL,
        fallbackModel: serverEnv.OPENAI_MODEL_FALLBACK ?? null,
      },
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
        "You are Capsules AI, a friendly creative partner chatting with community managers inside Composer.",
        "Always respond with JSON that matches the schema. `message` is the conversational reply shown to the user: greet them, acknowledge what you're creating, and after the asset is staged invite them to iterate or request edits.",
        "Avoid words like 'post' or 'draft' inside `message`; describe visuals, scenes, captions, or clips instead. Keep it to 1-3 warm, modern sentences.",
        "`post.content` is the publishable caption with a clear CTA and up to three relevant hashtags when helpful.",
        "When imagery is requested, set `post.kind` to `image` and supply a single specific `post.media_prompt` that highlights composition, subject focus, lighting, palette, and mood. Keep `post.media_url` empty unless editing a provided reference.",
        "If the user implies video, set `post.kind` to `video` and describe camera moves or beats in `post.media_prompt`.",
        "Use `post.notes` as a newline-separated list (max three items) of smart edit ideas the assistant could offer next (e.g., 'Warm up the dusk lighting').",
        "Honor clarifier answers, attachment context, and prior history when shaping the prompt.",
      ].join(" "),
    },

    ...buildContextMessages(context),

    ...historyMessages,

    {
      role: "user",

      content: JSON.stringify(userPayload),
    },
  ];

  const parseResponse = async (
    extraSystem: string | null = null,
    temperature = 0.75,
  ): Promise<Record<string, unknown>> => {
    const runMessages = extraSystem
      ? [{ role: "system", content: extraSystem }, ...messages]
      : messages;
    const { content } = await callOpenAIChat(runMessages, creationSchema, { temperature });
    return extractJSON<Record<string, unknown>>(content) || {};
  };

  let parsed = await parseResponse();
  let reranForMissingContent = false;
  if (!parsed || !parsed.post || !(parsed.post as Record<string, unknown>).content) {
    reranForMissingContent = true;
    const fallback = await parseResponse(
      "Return only minified JSON matching the expected schema (no commentary). Ensure post.content is populated with the caption that reflects the latest instruction.",
      0.72,
    );
    parsed = Object.keys(fallback).length ? fallback : {};
  }

  let reranForMissingMedia = false;

  let postResponse = (parsed.post as Record<string, unknown>) ?? {};
  let requestedKindRaw = typeof postResponse.kind === "string" ? postResponse.kind : null;
  let requestedKind =
    requestedKindRaw && requestedKindRaw.trim().length
      ? requestedKindRaw.trim().toLowerCase()
      : null;

  let mediaPrompt =
    typeof postResponse.media_prompt === "string" ? postResponse.media_prompt : null;

  let mediaUrl = typeof postResponse.media_url === "string" ? postResponse.media_url : null;

  if (mediaPrompt && !mediaPrompt.trim()) mediaPrompt = null;
  if (mediaUrl && !mediaUrl.trim()) mediaUrl = null;

  const wantsImage =
    allowGeneratedMedia &&
    !preferText &&
    (requestedKind === "image" || preferVisual || imageIntent) &&
    !videoIntent;
  const wantsVideo = allowGeneratedMedia && (requestedKind === "video" || preferVideo || videoIntent);

  if (!reranForMissingMedia && allowGeneratedMedia && !mediaUrl && !mediaPrompt && (wantsImage || wantsVideo)) {
    reranForMissingMedia = true;
    const mediaRetry = await parseResponse(
      "User requested imagery or video. Return JSON with post.media_prompt (and kind set appropriately). Do not omit media when requested.",
      0.78,
    );
    if (mediaRetry && mediaRetry.post) {
      parsed = mediaRetry;
      postResponse = (mediaRetry.post as Record<string, unknown>) ?? postResponse;
      requestedKindRaw = typeof postResponse.kind === "string" ? postResponse.kind : requestedKindRaw;
      requestedKind =
        requestedKindRaw && requestedKindRaw.trim().length
          ? requestedKindRaw.trim().toLowerCase()
          : requestedKind;
      mediaPrompt = typeof postResponse.media_prompt === "string" ? postResponse.media_prompt : mediaPrompt;
      mediaUrl = typeof postResponse.media_url === "string" ? postResponse.media_url : mediaUrl;
      if (mediaPrompt && !mediaPrompt.trim()) mediaPrompt = null;
      if (mediaUrl && !mediaUrl.trim()) mediaUrl = null;
    }
  }

  const editSuggestions = extractEditSuggestions(postResponse.notes);

  let statusMessage =
    typeof parsed.message === "string" && parsed.message.trim()
      ? parsed.message.trim()
      : reranForMissingContent || reranForMissingMedia
        ? "Drafted what you asked—let me know any tweaks."
        : "Here's a draft.";

  const result = buildBasePost();

  result.content = typeof postResponse.content === "string" ? postResponse.content.trim() : "";

  const videoAttachment: VideoAttachment =
    attachments?.find(
      (attachment) =>
        attachment?.url &&
        typeof attachment.url === "string" &&
        attachment.url.trim().length > 0 &&
        typeof attachment.mimeType === "string" &&
        attachment.mimeType.toLowerCase().startsWith("video/"),
    ) ?? null;

  const imageOnlyIntent =
    (requestedKind === "image" || preferVisual) && !preferText && !videoIntent && !videoAttachment;
  if (imageOnlyIntent) {
    result.content = "";
  }

  if (!allowGeneratedMedia) {
    mediaPrompt = null;
    mediaUrl = null;
  }

  const { videoResult, statusMessage: videoStatus, result: videoDraft } =
    await generateComposerVideo({
      allowGeneratedMedia,
      requestedKind,
      videoIntent,
      preferVideo,
      videoAttachment,
      mediaUrlFromModel: mediaUrl,
      mediaPromptFromModel: mediaPrompt,
      instructionForModel,
      postResponse,
      capsuleId: capsuleId ?? null,
      ownerUserId,
      statusMessage,
      result,
    });

  statusMessage = videoStatus;
  Object.assign(result, videoDraft);

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
      let composedPrompt: string | null = null;
      try {
        composedPrompt = composeMediaPrompt(instructionForModel, mediaPrompt);
        const generatedImage = await generateImageFromPrompt(
          composedPrompt,
          imageOptions,
          buildImageRunContext(composedPrompt, context, imageOptions),
        );

        result.mediaUrl = generatedImage.url;

        result.kind = "image";

        result.mediaPrompt = composedPrompt;
      } catch (error) {
        console.error("Image generation failed for composer prompt:", error);

        const failedPrompt = composedPrompt ?? mediaPrompt;
        result.kind = requestedKind || "image";
        result.mediaPrompt = failedPrompt;
        if (!statusMessage) {
          statusMessage = "I drafted the visual prompt, but rendering hiccupped. Want me to try again?";
        }
      }
    } else if (allowGeneratedMedia && !mediaPrompt && (imageIntent || clarifierAnswered)) {
      try {
        mediaPrompt = await inferImagePromptFromInstruction(instructionForModel);
      } catch {
        // ignore inference failure
      }

      const derivedPrompt =
        typeof mediaPrompt === "string" && mediaPrompt.trim().length
          ? mediaPrompt
          : instructionForModel;

      if (derivedPrompt && derivedPrompt.trim().length) {
        let finalPrompt = derivedPrompt;
        try {
          finalPrompt = composeMediaPrompt(instructionForModel, derivedPrompt);
          const fallbackImage = await generateImageFromPrompt(
            finalPrompt,
            imageOptions,
            buildImageRunContext(finalPrompt, context, imageOptions),
          );

          result.mediaUrl = fallbackImage.url;

          result.kind = "image";

          result.mediaPrompt = finalPrompt;
        } catch (error) {
          console.error("Image generation failed (intent path):", error);

          mediaPrompt = finalPrompt;
          result.kind = result.kind || requestedKind || "image";
          if (!statusMessage) {
            statusMessage = "I captured the image idea. Want me to try rendering that visual?";
          }
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
    const pendingPrompt =
      typeof result.mediaPrompt === "string" && result.mediaPrompt.trim().length
        ? result.mediaPrompt
        : typeof mediaPrompt === "string" && mediaPrompt.trim().length
          ? mediaPrompt
          : null;
    if (pendingPrompt) {
      result.mediaPrompt = pendingPrompt;
      result.kind = result.kind || "image";
    } else {
      result.mediaPrompt = null;
    }
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

  statusMessage = finalizeAssistantMessage({
    base: statusMessage,
    requestText: instructionForModel || userText,
    assetKind: result.kind ?? null,
    hasImage: (result.kind ?? "").toLowerCase() === "image" && Boolean(result.mediaUrl),
    hasVideo: (result.kind ?? "").toLowerCase() === "video" && Boolean(result.mediaUrl || result.playbackUrl),
    suggestions: editSuggestions,
  });

  const postPayload: Record<string, unknown> = { ...result };
  const trimmedNotes =
    typeof postResponse.notes === "string" && postResponse.notes.trim().length
      ? postResponse.notes.trim()
      : null;
  if (trimmedNotes) {
    postPayload.notes = trimmedNotes;
  }
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
  const historyMessages = mapConversationToMessages(history, selectHistoryLimit(userText));
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

  const parsePoll = (payload: Record<string, unknown>): { question: string; options: string[] } => {
    const pollObj = (payload as { poll?: Record<string, unknown> })?.poll ?? {};
    const rawQuestion = (pollObj as { question?: unknown }).question ?? hint.question ?? "";
    const question = String(rawQuestion ?? "").trim();
    const rawOptions = (pollObj as { options?: unknown }).options;
    const options = Array.isArray(rawOptions)
      ? (rawOptions as unknown[])
          .map((entry) => String(entry ?? "").trim())
          .filter(Boolean)
      : [];
    return { question, options };
  };

  const pollParsed = parsePoll(parsed);
  let question = pollParsed.question;
  let options = pollParsed.options;

  if ((!question || !question.trim()) || options.length < 2) {
    const retry = await callOpenAIChat(
      [
        { role: "system", content: `${system} Do not return empty polls. Include a clear question and 3-6 concrete options.` },
        ...messages.slice(1),
      ],
      pollSchema,
      { temperature: 0.55 },
    );
    const retryParsed = extractJSON<Record<string, unknown>>(retry.content) || {};
    const retryPoll = parsePoll(retryParsed);
    if (retryPoll.question.trim()) {
      question = retryPoll.question;
    }
    if (retryPoll.options.length >= 2) {
      options = retryPoll.options;
    }
  }

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
  const historyMessages = mapConversationToMessages(history, selectHistoryLimit(userText));
  const base = buildBasePost(incomingPost);
  const imageOptions = extractComposerImageOptions(rawOptions);
  const preferHints = extractPreferHints(rawOptions ?? null);
  const chatOnlyFlag =
    rawOptions &&
    typeof rawOptions === "object" &&
    ((rawOptions as { chatOnly?: unknown }).chatOnly === true ||
      (rawOptions as { chat_only?: unknown }).chat_only === true);
  const preferVisual = !chatOnlyFlag && preferHints.some((hint) => VISUAL_KIND_HINTS.has(hint));
  const preferText = chatOnlyFlag || preferHints.some((hint) => TEXT_KIND_HINTS.has(hint));
  const preferVideo = chatOnlyFlag ? false : preferHints.some((hint) => VIDEO_KIND_HINTS.has(hint));
  const priorUserMessage =
    history && history.length
      ? [...history].slice().reverse().find((entry) => entry.role === "user")?.content ?? null
      : null;
  const intentSource = [userText, priorUserMessage].filter(Boolean).join(" ");

  const safePostForModel =
    sanitizePostForModel(incomingPost) ||
    sanitizePostForModel({
      content: base.content,
      kind: base.kind,
      media_url: base.mediaUrl ?? undefined,
      media_prompt: base.mediaPrompt ?? undefined,
    });

  const userPayload: Record<string, unknown> = { instruction: userText };
  if (safePostForModel) {
    userPayload.post = safePostForModel;
  }
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

        "If the user does not ask for media changes, leave post.media_url and post.media_prompt untouched and avoid adding new visuals.",

        "Carry the post forward verbatim except for the explicit edit request—preserve tone, emojis, and hashtags unless the user wants them changed.",

        "If the user requests new imagery, provide a short, concrete description via post.media_prompt. Lean on the current media description when the edit should be a remix rather than a brand new visual.",

        "If the user wants adjustments to the existing image, set post.edit_current_media to true and combine the current media prompt with the requested changes instead of inventing an unrelated scene.",

        "Keep tone consistent with the instruction and the existing copy. If the request is unclear, ask a concise clarifying question in the `message` field instead of guessing.",
      ].join(" "),
    },

    ...buildContextMessages(context),

    ...historyMessages,

    {
      role: "user",

      content: JSON.stringify(userPayload),
    },
  ];

  let parsed: Record<string, unknown> = {};
  let modelError: unknown = null;
  let reranForNoChange = false;
  try {
    const { content } = await callOpenAIChat(messages, editSchema, { temperature: 0.6 });
    parsed = extractJSON<Record<string, unknown>>(content) || {};
  } catch (error) {
    modelError = error;
    const enriched = error as Error & { status?: number; meta?: unknown; code?: string };
    const meta = enriched?.meta;
    const status =
      typeof enriched?.status === "number"
        ? enriched.status
        : typeof (meta as Record<string, unknown>)?.["status"] === "number"
          ? ((meta as Record<string, unknown>)["status"] as number)
          : null;
    const code =
      typeof enriched?.code === "string"
        ? enriched.code
        : typeof (meta as { error?: { code?: string } })?.error?.code === "string"
          ? (meta as { error?: { code?: string } }).error?.code
          : null;
    console.warn("refinePostDraft: model call failed, falling back", {
      message: enriched?.message ?? String(error),
      status,
      code,
      meta: meta && typeof meta === "object" ? meta : null,
    });
    parsed = {};
  }

  let postResponse = (parsed.post as Record<string, unknown>) ?? {};
  const incomingContent =
    typeof base.content === "string" && base.content.trim().length ? base.content.trim() : "";
  let draftedContentRaw =
    typeof postResponse.content === "string" && postResponse.content.trim().length
      ? postResponse.content.trim()
      : null;

  if (!modelError && (!draftedContentRaw || draftedContentRaw === incomingContent)) {
    reranForNoChange = true;
    try {
      const retryMessages: ChatMessage[] = [
        {
          role: "system",
          content:
            "IMPORTANT: Apply the user's latest edit directly to post.content. Do not return the original unchanged content. If the instruction is ambiguous, make a best-effort edit and mention the ambiguity in the message field.",
        },
        ...messages,
      ];
      const { content } = await callOpenAIChat(retryMessages, editSchema, { temperature: 0.7 });
      const retryParsed = extractJSON<Record<string, unknown>>(content) || {};
      parsed = retryParsed;
      postResponse = (retryParsed.post as Record<string, unknown>) ?? {};
      draftedContentRaw =
        typeof postResponse.content === "string" && postResponse.content.trim().length
          ? postResponse.content.trim()
          : draftedContentRaw;
    } catch (retryError) {
      modelError = modelError ?? retryError;
    }
  }

  let statusMessage: string =
    typeof parsed.message === "string" && parsed.message.trim()
      ? parsed.message.trim()
      : "Here you go.";

  const next = buildBasePost(base);

  const finalContent =
    typeof draftedContentRaw === "string" && draftedContentRaw.trim().length
      ? draftedContentRaw.trim()
      : incomingContent;

  next.content = finalContent || next.content;

  const editCurrent = postResponse.edit_current_media === true;

  let candidatePrompt =
    typeof postResponse.media_prompt === "string" ? postResponse.media_prompt.trim() : "";

  let candidateUrl =
    typeof postResponse.media_url === "string" ? postResponse.media_url.trim() : "";
  let pendingPrompt = candidatePrompt || "";

  const hasExistingMedia = Boolean(base.mediaUrl);
  const explicitMediaRemoval =
    postResponse.keep_existing_media === false ||
    /remove\s+(?:the\s+)?(image|photo|picture|media)/i.test(userText) ||
    /(?:no|without)\s+(?:image|photo|picture|media|visual)/i.test(userText) ||
    /text\s+only/i.test(userText);
  const mediaIntent = IMAGE_INTENT_REGEX.test(intentSource);
  const textSuggestsMedia =
    mediaIntent || /\b(photo|picture|visual|graphic|media|image|img|pic)\b/i.test(intentSource);
  const mediaChangeRequested =
    explicitMediaRemoval ||
    textSuggestsMedia ||
    preferVisual ||
    preferVideo ||
    editCurrent;
  // Allow explicit user intent (e.g., "add an image") to override a client
  // default of prefer=text. This prevents cases where the server drops
  // media_prompt even though the user clearly requested an image.
  const allowNewMedia =
    !explicitMediaRemoval &&
    !chatOnlyFlag &&
    mediaChangeRequested &&
    (!preferText || mediaIntent || preferVisual || preferVideo);
  const keepExisting =
    explicitMediaRemoval
      ? false
      : postResponse.keep_existing_media === true
        ? true
        : postResponse.keep_existing_media === false
          ? false
          : hasExistingMedia;

  let reranForMedia = false;
  if (!modelError && allowNewMedia && mediaChangeRequested && !candidatePrompt && !candidateUrl) {
    reranForMedia = true;
    try {
      const mediaRetryMessages: ChatMessage[] = [
        {
          role: "system",
          content:
            "The user asked for imagery or media changes. Provide a concrete media_prompt (or edit_current_media=true) aligned to the latest instruction. Do not skip media when it is requested.",
        },
        ...messages,
      ];
      const { content } = await callOpenAIChat(mediaRetryMessages, editSchema, { temperature: 0.7 });
      const retryParsed = extractJSON<Record<string, unknown>>(content) || {};
      parsed = retryParsed;
      postResponse = (retryParsed.post as Record<string, unknown>) ?? postResponse;
      candidatePrompt =
        typeof postResponse.media_prompt === "string" ? postResponse.media_prompt.trim() : candidatePrompt;
      candidateUrl =
        typeof postResponse.media_url === "string" ? postResponse.media_url.trim() : candidateUrl;
    } catch (mediaRetryError) {
      modelError = modelError ?? mediaRetryError;
    }
  }

  const mediaRequestedButUnresolved =
    allowNewMedia && mediaChangeRequested && !candidatePrompt && !candidateUrl && !modelError;

  // Best-effort auto-generation when intent is clearly visual and the model returned no media.
  if (mediaRequestedButUnresolved) {
    const fallbackPrompt =
      (userText?.trim().length && IMAGE_INTENT_REGEX.test(userText)
        ? userText.trim()
        : base.mediaPrompt || base.content || userText || "Shoot a compelling social post visual"
      ).trim();
    try {
      const autoImage = await generateImageFromPrompt(
        fallbackPrompt,
        imageOptions,
        buildImageRunContext(fallbackPrompt, context, imageOptions),
      );
      candidateUrl = autoImage.url;
      candidatePrompt = fallbackPrompt;
      postResponse.kind = postResponse.kind || "image";
      reranForMedia = true;
    } catch (autoError) {
      console.error("Auto image generation (intent) failed:", autoError);
      pendingPrompt = fallbackPrompt;
    }
  }

  const promptCaptured = allowNewMedia && !candidateUrl && Boolean(candidatePrompt || pendingPrompt);
  statusMessage =
    typeof parsed.message === "string" && parsed.message.trim()
      ? parsed.message.trim()
      : modelError
        ? "The planning step hiccupped, so I pulled together a draft for you."
        : mediaRequestedButUnresolved && !candidateUrl && !candidatePrompt
          ? "I need one quick detail to generate the image - tell me the style or scene you want."
          : promptCaptured
            ? "I drafted the visual prompt. Want me to render it?"
          : reranForNoChange || reranForMedia
            ? "Applied your latest edits."
            : "Here you go.";

  if (!allowNewMedia) {
    candidatePrompt = "";
    candidateUrl = "";
    pendingPrompt = "";
  }

  if (explicitMediaRemoval) {
    next.mediaPrompt = null;
    next.mediaUrl = null;
    next.kind = "text";
  } else if (candidateUrl) {
    const persistedUrl = /^data:/i.test(candidateUrl)
      ? (await storeImageSrcToSupabase(candidateUrl, "generate"))?.url ?? candidateUrl
      : candidateUrl;
    next.mediaUrl = persistedUrl;

    next.mediaPrompt = candidatePrompt || next.mediaPrompt;
    pendingPrompt = "";

    next.kind = typeof postResponse.kind === "string" ? postResponse.kind : next.kind;
  } else if (candidatePrompt) {
    try {
      const iterationImage = await generateImageFromPrompt(
        candidatePrompt,
        imageOptions,
        buildImageRunContext(candidatePrompt, context, imageOptions),
      );

      next.mediaUrl = iterationImage.url;

      next.mediaPrompt = candidatePrompt;
      pendingPrompt = "";

      next.kind = "image";

      const memoryId = await storeComposerImageMemory({
        ownerId: context.ownerId,
        mediaUrl: next.mediaUrl,
        prompt: next.mediaPrompt,
        previousMemoryId: base.memoryId,
      });
      if (memoryId) {
        next.memoryId = memoryId;
      }
    } catch (error) {
      console.error("Image generation failed for refine:", error);
      pendingPrompt = candidatePrompt;
      if (!statusMessage) {
        statusMessage = "I drafted the visual prompt, but rendering hit a snag. Should I try again?";
      }
    }
  } else if (modelError && allowNewMedia && !keepExisting) {
    const fallbackIntent =
      IMAGE_INTENT_REGEX.test(userText) ||
      (!!context.attachments && context.attachments.length > 0) ||
      /image|photo|visual|pic|graphic/i.test(userText);
    if (fallbackIntent) {
      const fallbackPrompt =
        userText && userText.trim().length ? userText.trim() : base.mediaPrompt || base.content;
      try {
        const nextImage = await generateImageFromPrompt(
          fallbackPrompt,
          imageOptions,
          buildImageRunContext(fallbackPrompt, context, imageOptions),
        );
        next.mediaUrl = nextImage.url;
        next.mediaPrompt = fallbackPrompt;
        next.kind = "image";
        pendingPrompt = "";
      } catch (fallbackError) {
        console.error("Image generation fallback failed:", fallbackError);
        pendingPrompt = fallbackPrompt;
      }
    }
  } else if (!keepExisting) {
    next.mediaPrompt = null;
    pendingPrompt = "";

    if (!editCurrent) {
      next.mediaUrl = null;
    }
  }

  if (editCurrent && allowNewMedia && base.mediaUrl) {
    const combinedPrompt = [base.mediaPrompt || "", candidatePrompt || userText]
      .filter(Boolean)
      .join(" ");

    try {
      const editedResult = await editImageWithInstruction(
        base.mediaUrl,
        combinedPrompt || userText,
        imageOptions,
        buildImageRunContext(combinedPrompt || userText, context, imageOptions, "edit"),
      );

      next.mediaUrl = editedResult.url;

      next.mediaPrompt = combinedPrompt || userText;
      pendingPrompt = "";

      next.kind = "image";

      const memoryId = await storeComposerImageMemory({
        ownerId: context.ownerId,
        mediaUrl: next.mediaUrl,
        prompt: next.mediaPrompt,
        previousMemoryId: base.memoryId,
      });
      if (memoryId) {
        next.memoryId = memoryId;
      }
    } catch (error) {
      console.error("Edit current image failed:", error);
      try {
        const fallbackPrompt = combinedPrompt || userText;
        const fallbackResult = await generateImageFromPrompt(
          fallbackPrompt,
          imageOptions,
          buildImageRunContext(fallbackPrompt, context, imageOptions),
        );
        next.mediaUrl = fallbackResult.url;
        next.mediaPrompt = combinedPrompt || userText;
        next.kind = "image";
        pendingPrompt = "";

        const memoryId = await storeComposerImageMemory({
          ownerId: context.ownerId,
          mediaUrl: next.mediaUrl,
          prompt: next.mediaPrompt,
          previousMemoryId: base.memoryId,
        });
        if (memoryId) {
          next.memoryId = memoryId;
        }
      } catch (fallbackError) {
        console.error("Edit fallback generation failed:", fallbackError);
        pendingPrompt = combinedPrompt || userText;
      }
    }
  }

  if (next.kind === "image" && next.mediaUrl && /^data:/i.test(next.mediaUrl)) {
    // Ensure data URIs are persisted to storage before they land in history.
    try {
      const saved = await storeImageSrcToSupabase(next.mediaUrl, "generate");
      if (saved?.url) {
        next.mediaUrl = saved.url;
      }
    } catch (error) {
      console.warn("Supabase store (refine) failed:", (error as Error)?.message);
    }
  }

  if (!next.mediaUrl) {
    if (pendingPrompt && pendingPrompt.trim().length) {
      next.mediaPrompt = pendingPrompt;
      next.kind = next.kind || "image";
    } else {
      next.mediaPrompt = null;
    }
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
