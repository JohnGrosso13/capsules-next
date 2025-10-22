type Json = string | number | boolean | null | Json[] | { [key: string]: Json };

if (typeof (globalThis as { DOMParser?: unknown }).DOMParser !== "function") {
  class BasicDOMParser {
    parseFromString(markup: string) {
      const textContent = String(markup ?? "");
      const node = { textContent, innerHTML: textContent };
      return {
        textContent,
        documentElement: node,
        body: node,
      } as unknown;
    }
  }
  (globalThis as { DOMParser: unknown }).DOMParser = BasicDOMParser as unknown;
}

import { fetchOpenAI, hasOpenAIApiKey } from "@/adapters/ai/openai/server";
import { serverEnv } from "../env/server";

import { getDatabaseAdminClient } from "@/config/database";

import { storeImageSrcToSupabase } from "../supabase/storage";
import type { ComposerChatAttachment, ComposerChatMessage } from "@/lib/composer/chat-types";

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
type ComposeDraftOptions = {
  history?: ComposerChatMessage[];
  attachments?: ComposerChatAttachment[];
  capsuleId?: string | null;
  rawOptions?: Record<string, unknown>;
};
const nullableStringSchema = {
  anyOf: [{ type: "string" }, { type: "null" }],
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

export async function generateImageFromPrompt(
  prompt: string,
  options: ImageOptions = {},
): Promise<string> {
  requireOpenAIKey();

  const isNonProd = (process.env.NODE_ENV ?? "").toLowerCase() !== "production";

  const candidateModels = Array.from(
    new Set(
      [
        isNonProd ? serverEnv.OPENAI_IMAGE_MODEL_DEV : null,
        serverEnv.OPENAI_IMAGE_MODEL,
        // Prefer the most affordable legacy model while testing.
        isNonProd ? "dall-e-2" : null,
        "gpt-image-1",
        "dall-e-3",
      ].filter((model): model is string => typeof model === "string" && model.length > 0),
    ),
  );

  const attempt = async (modelName: string) => {
    const params = resolveImageParams(options);

    const body = { model: modelName, prompt, n: 1, size: params.size, quality: params.quality };

    const response = await fetchOpenAI("/images/generations", {
      method: "POST",

      headers: {
        "Content-Type": "application/json",
      },

      body: JSON.stringify(body),
    });

    const json = (await response.json().catch(() => ({}))) as Record<string, unknown>;

    if (!response.ok) {
      const error = new Error(`OpenAI image error: ${response.status}`);

      (error as Error & { meta?: Record<string, unknown> }).meta = json;

      throw error;
    }

    const image = Array.isArray(json.data)
      ? (json.data as Array<Record<string, unknown>>)[0]
      : null;

    if (!image) throw new Error("OpenAI image response missing data.");

    const url = typeof image.url === "string" ? image.url : null;

    const b64 = typeof image.b64_json === "string" ? image.b64_json : null;

    if (url) return url;

    if (b64) return `data:image/png;base64,${b64}`;

    throw new Error("OpenAI image response missing url and b64_json.");
  };

  let primaryError: unknown = null;
  for (const model of candidateModels) {
    try {
      return await attempt(model);
    } catch (error) {
      if (!primaryError) primaryError = error;
    }
  }

  throw primaryError instanceof Error ? primaryError : new Error("Failed to generate image.");
}

export async function editImageWithInstruction(
  imageUrl: string,

  instruction: string,

  options: ImageOptions = {},
): Promise<string> {
  requireOpenAIKey();

  const imgResponse = await fetch(imageUrl);

  if (!imgResponse.ok) {
    throw new Error(`Failed to fetch source image (${imgResponse.status})`);
  }

  let buffer: Buffer = Buffer.from(await imgResponse.arrayBuffer());

  try {
    const { default: Jimp } = await import("jimp");

    const image = await Jimp.read(buffer);

    buffer = await image.getBufferAsync(Jimp.MIME_PNG);
  } catch (error) {
    console.warn(
      "PNG conversion failed, attempting edit with original format:",
      (error as Error)?.message,
    );
  }

  const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);

  const blob = new Blob([arrayBuffer as ArrayBuffer], { type: "image/png" });

  const fd = new FormData();

  const allowedEditModels = new Set(["gpt-image-1", "dall-e-2", "gpt-image-0721-mini-alpha"]);

  const isNonProd = (process.env.NODE_ENV ?? "").toLowerCase() !== "production";

  const configured = serverEnv.OPENAI_IMAGE_MODEL.toLowerCase();
  const devConfigured = serverEnv.OPENAI_IMAGE_MODEL_DEV?.toLowerCase() ?? null;

  const preferredEditModel = (
    [
      isNonProd && devConfigured && allowedEditModels.has(devConfigured)
        ? serverEnv.OPENAI_IMAGE_MODEL_DEV
        : null,
      allowedEditModels.has(configured) ? serverEnv.OPENAI_IMAGE_MODEL : null,
    ].find((entry): entry is string => typeof entry === "string" && entry.length > 0) ?? "gpt-image-1"
  );

  const model = preferredEditModel;

  fd.append("model", model);

  fd.append("image", blob, "image.png");

  fd.append("prompt", instruction || "Make subtle improvements.");

  const params = resolveImageParams(options);

  if (params.size) fd.append("size", params.size);

  const response = await fetchOpenAI("/images/edits", {
    method: "POST",

    body: fd,
  });

  const json = (await response.json().catch(() => ({}))) as Record<string, unknown>;

  if (!response.ok) {
    const error = new Error(`OpenAI image edit error: ${response.status}`);

    (error as Error & { meta?: Record<string, unknown> }).meta = json;

    throw error;
  }

  const image = Array.isArray(json.data) ? (json.data as Array<Record<string, unknown>>)[0] : null;

  if (!image) throw new Error("OpenAI image edit missing data");

  const maybeUrl = typeof image.url === "string" ? image.url : null;

  const maybeB64 = typeof image.b64_json === "string" ? image.b64_json : null;

  const dataUri = maybeUrl ?? (maybeB64 ? `data:image/png;base64,${maybeB64}` : null);

  if (!dataUri) throw new Error("OpenAI image edit missing url/b64");

  const saved = await storeImageSrcToSupabase(dataUri, "edit");

  return saved?.url ?? dataUri;
}

function buildBasePost(incoming: Record<string, unknown> = {}): DraftPost {
  return {
    kind: typeof incoming.kind === "string" ? incoming.kind : "text",

    content: typeof incoming.content === "string" ? incoming.content : "",

    mediaUrl: typeof incoming.mediaUrl === "string" ? incoming.mediaUrl : null,

    mediaPrompt: typeof incoming.mediaPrompt === "string" ? incoming.mediaPrompt : null,
  };
}

export async function createPostDraft(
  userText: string,
  context: ComposeDraftOptions = {},
): Promise<Record<string, unknown>> {
  const { history, attachments, capsuleId, rawOptions } = context;
  const historyMessages = mapConversationToMessages(history);
  const imageIntent =
    /(image|logo|banner|thumbnail|picture|photo|icon|cover|poster|graphic|illustration|art|avatar|background)\b/i.test(
      userText,
    );

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

  const userPayload: Record<string, unknown> = { instruction: userText };
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

  const statusMessage =
    typeof parsed.message === "string" && parsed.message.trim().length
      ? parsed.message.trim()
      : "Here's a draft.";

  const result = buildBasePost();

  result.content = typeof postResponse.content === "string" ? postResponse.content.trim() : "";

  const requestedKind = typeof postResponse.kind === "string" ? postResponse.kind : null;

  let imagePrompt =
    typeof postResponse.media_prompt === "string" ? postResponse.media_prompt : null;

  let mediaUrl = typeof postResponse.media_url === "string" ? postResponse.media_url : null;

  if (imagePrompt && !imagePrompt.trim()) imagePrompt = null;

  if (mediaUrl && !mediaUrl.trim()) mediaUrl = null;

  if (mediaUrl) {
    result.mediaUrl = mediaUrl;

    result.mediaPrompt = imagePrompt || result.mediaPrompt;

    result.kind = requestedKind || "image";
  } else if (imagePrompt) {
    try {
      result.mediaUrl = await generateImageFromPrompt(imagePrompt);

      result.kind = "image";

      result.mediaPrompt = imagePrompt;
    } catch (error) {
      console.error("Image generation failed for composer prompt:", error);

      result.kind = requestedKind || "text";

      imagePrompt = null;
    }
  } else if (!imagePrompt && imageIntent) {
    try {
      imagePrompt = await inferImagePromptFromInstruction(userText);
    } catch {
      // ignore inference failure
    }

    if (imagePrompt) {
      try {
        result.mediaUrl = await generateImageFromPrompt(imagePrompt);

        result.kind = "image";

        result.mediaPrompt = imagePrompt;
      } catch (error) {
        console.error("Image generation failed (intent path):", error);
      }
    }
  } else if (requestedKind) {
    result.kind = requestedKind;
  } else {
    result.kind = result.mediaUrl ? "image" : "text";
  }

  if (!result.mediaUrl) {
    result.mediaPrompt = null;
  }

  if (!result.content && result.mediaUrl) {
    result.content = "Here is the new visual. Let me know if you want changes to the copy!";
  }

  try {
    if (result.mediaUrl && /^(?:https?:|data:)/i.test(result.mediaUrl)) {
      const saved = await storeImageSrcToSupabase(result.mediaUrl, "generate");

      if (saved?.url) {
        result.mediaUrl = saved.url;
      }
    }
  } catch (error) {
    console.warn("Supabase store (create) failed:", (error as Error)?.message);
  }

  return { action: "draft_post", message: statusMessage, post: result };
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

  const messages: ChatMessage[] = [
    { role: "system", content: system },

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

  const message =
    typeof parsed.message === "string" && parsed.message.trim()
      ? parsed.message
      : "I drafted a poll. Tweak anything you like.";

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
      next.mediaUrl = await generateImageFromPrompt(candidatePrompt);

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

      const editedUrl = await editImageWithInstruction(
        base.mediaUrl,
        combinedPrompt || userText,
        {},
      );

      next.mediaUrl = editedUrl;

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
          "You are Capsules AI. Summarize a feed of user posts concisely and helpfully. Keep it friendly, specific, and short. Mention image themes briefly. Also provide one relevant post idea for the user to publish next.",
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

  const blob = new Blob([bytes], { type: resolvedMime || "audio/webm" });

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

