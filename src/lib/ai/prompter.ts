import "@/lib/polyfills/dom-parser";

import { getDatabaseAdminClient } from "@/config/database";
import type { ComposerChatAttachment, ComposerChatMessage } from "@/lib/composer/chat-types";
import {
  callOpenAIChat,
  extractJSON,
  type ChatMessage,
  type JsonSchema,
} from "./prompter/core";
import type { ImageRunExecutionContext } from "./prompter/images";

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

export function selectHistoryLimit(userText: string | undefined): number {
  const length = typeof userText === "string" ? userText.trim().length : 0;
  if (length === 0) return HISTORY_MESSAGE_LIMIT;
  // Short "tweak" edits generally do not need deep history.
  return length <= 160 ? Math.min(4, HISTORY_MESSAGE_LIMIT) : HISTORY_MESSAGE_LIMIT;
}

export function mapConversationToMessages(
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

export function buildContextMessages(context: ComposeDraftOptions): ChatMessage[] {
  const messages: ChatMessage[] = [];
  const userCard = typeof context.userCard === "string" ? context.userCard.trim() : "";
  if (userCard.length) {
    messages.push({
      role: "system",
      content: `User profile for grounding only (do not mention this explicitly):\n${userCard}`,
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
      content: `${prompt}\n\nUse the memories silently to ground your response. Do not mention memory numbers, "context", "memory", or that you used extra information.`,
    });
  }

  return messages;
}

type DraftPostPlan = {
  action: "draft_post";
  message?: string;
  post: Record<string, unknown>;
  choices?: Array<{ key: string; label: string }>;
};

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

// eslint-disable-next-line unused-imports/no-unused-vars
type ComposeDraftResult = DraftPostPlan;

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
  stylePreset?: string | null;
  ownerId?: string | null;
  userCard?: string | null;
  contextPrompt?: string | null;
  contextRecords?: ComposeContextRecord[];
  contextMetadata?: Record<string, unknown> | null;
  onStatus?: ((message: string) => void) | null;
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

export function buildImageRunContext(
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

// eslint-disable-next-line unused-imports/no-unused-vars
const USER_VISUAL_INTENT_REGEX =
  /(image|photo|picture|visual|graphic|logo|banner|avatar|thumbnail|art|render|illustration|design)\b/i;

// eslint-disable-next-line unused-imports/no-unused-vars
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

// eslint-disable-next-line unused-imports/no-unused-vars
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

// eslint-disable-next-line unused-imports/no-unused-vars
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

// eslint-disable-next-line unused-imports/no-unused-vars
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

          options: { type: "array", minItems: 2, maxItems: 4, items: { type: "string" } },
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

// eslint-disable-next-line unused-imports/no-unused-vars
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

export async function createPollDraft(
  userText: string,
  hint: Record<string, unknown> = {},
  context: ComposeDraftOptions = {},
): Promise<PollDraft> {
  const { history, attachments, capsuleId, rawOptions } = context;
  const historyMessages = mapConversationToMessages(history, selectHistoryLimit(userText));
  const system = [
    "You are Capsules AI. Create a concise poll from the user instruction.",

    "Return JSON with a friendly message and a poll containing a question and 2-4 short, distinct options.",

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
        { role: "system", content: `${system} Do not return empty polls. Include a clear question and 2-4 concrete options.` },
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

  options = deduped.length >= 2 ? deduped.slice(0, 4) : options.slice(0, 4);

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
