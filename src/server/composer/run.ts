import type { ComposerChatAttachment, ComposerChatMessage } from "@/lib/composer/chat-types";
import { extractComposerImageOptions, type ComposerImageQuality } from "@/lib/composer/image-settings";
import { promptResponseSchema, type PromptResponse } from "@/shared/schemas/ai";
import { embedText, captionVideo } from "@/lib/ai/openai";
import {
  buildContextMessages,
  buildImageRunContext,
  mapConversationToMessages,
  sanitizePostForModel,
  selectHistoryLimit,
  type ComposeDraftOptions,
} from "@/lib/ai/prompter";
import {
  callOpenAIToolChat,
  extractJSON,
  type ChatMessage,
  type ToolCallDefinition,
} from "@/lib/ai/prompter/core";
import { generateImageFromPrompt } from "@/lib/ai/prompter/images";
import { generateVideoFromPrompt, editVideoWithInstruction } from "@/lib/ai/video";
import { safeRandomUUID } from "@/lib/random";
import {
  getChatContext,
  formatContextForPrompt,
  buildContextMetadata,
  getCapsuleHistorySnippets,
} from "@/server/chat/retrieval";
import type { ChatMemorySnippet } from "@/server/chat/retrieval";
import { buildAttachmentContext } from "@/server/composer/attachment-context";

export type ComposerToolEvent =
  | { type: "status"; message: string }
  | { type: "tool_call"; name: string; args: Record<string, unknown> }
  | { type: "tool_result"; name: string; result: Record<string, unknown> };

type ComposerToolCallbacks = {
  onEvent?: (event: ComposerToolEvent) => void;
};

const DEFAULT_MAX_ITERATIONS = 8;

const TOOL_DEFINITIONS: ToolCallDefinition[] = [
  {
    name: "render_image",
    description:
      "Generate a new marketing asset or remix an existing reference into a fresh variation. Always pass a detailed prompt describing the scene, composition, lighting, palette, and mood.",
    parameters: {
      type: "object",
      required: ["prompt"],
      additionalProperties: false,
      properties: {
        prompt: { type: "string", description: "Detailed visual description to render." },
        size: {
          type: "string",
          description: "Optional square/portrait/landscape resolution (e.g., 1024x1024).",
        },
        quality: {
          type: "string",
          enum: ["low", "standard", "high"],
          description: "Generation quality tier; defaults to workspace preference.",
        },
        style: {
          type: "string",
          description: "High-level art direction such as 'noir spotlight', 'vector', etc.",
        },
      },
    },
  },
  {
    name: "render_video",
    description:
      "Produce a short clip or edit a provided reference clip. Use when the user explicitly wants moving footage or cinematic storytelling.",
    parameters: {
      type: "object",
      required: ["prompt"],
      additionalProperties: false,
      properties: {
        prompt: { type: "string", description: "Narrate the shots, camera moves, and beats." },
        reference_attachment_id: {
          type: "string",
          description: "Attachment id for an existing clip to edit in-place.",
        },
      },
    },
  },
  {
    name: "analyze_document",
    description:
      "Read one of the user's uploaded attachments (PDF, text, CSV, etc.) and return a concise snippet alongside metadata so you can quote it accurately.",
    parameters: {
      type: "object",
      required: ["attachment_id"],
      additionalProperties: false,
      properties: {
        attachment_id: { type: "string", description: "ID of the attachment to inspect." },
      },
    },
  },
  {
    name: "summarize_video",
    description:
      "Summarize a referenced video attachment or previously generated clip to describe its content for copywriting.",
    parameters: {
      type: "object",
      required: ["attachment_id"],
      additionalProperties: false,
      properties: {
        attachment_id: { type: "string", description: "ID of the video attachment to summarize." },
      },
    },
  },
  {
    name: "embed_text",
    description:
      "Turn arbitrary text into an embedding vector for downstream semantic memory searches. Use when you need to store new knowledge.",
    parameters: {
      type: "object",
      required: ["text"],
      additionalProperties: false,
      properties: {
        text: { type: "string", description: "Raw text to embed (short paragraphs preferred)." },
      },
    },
  },
  {
    name: "fetch_context",
    description:
      "Search Capsules memories, capsule history, and recent attachments for supporting facts. Call this when you need more background or the user references prior work.",
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {
        query: {
          type: "string",
          description: "Search terms or recap of what you need (defaults to the latest user ask).",
        },
        include_capsule_history: {
          type: "boolean",
          description: "Set true to force capsule history snippets even without a search query.",
        },
      },
    },
  },
];

type AttachmentIndex = Map<string, ComposerChatAttachment>;

function buildAttachmentIndex(attachments: ComposerChatAttachment[] | undefined | null): AttachmentIndex {
  const index = new Map<string, ComposerChatAttachment>();
  if (!attachments) return index;
  attachments.forEach((attachment) => {
    if (!attachment?.id) return;
    index.set(attachment.id, attachment);
  });
  return index;
}

type RuntimeContext = {
  ownerId: string | null;
  capsuleId: string | null;
  attachments: AttachmentIndex;
  composeOptions: ComposeDraftOptions;
  history: ComposerChatMessage[];
  latestUserText: string;
};

type ImageRequestOptions = {
  quality?: ComposerImageQuality;
  size?: string;
};

const IMAGE_QUALITY_SET = new Set<ComposerImageQuality>(["low", "standard", "high"]);

type ToolRunResult = { name: string; result: Record<string, unknown> };

type MediaToolResult = {
  kind: "image" | "video";
  url: string;
  prompt: string | null;
  thumbnailUrl: string | null;
  playbackUrl: string | null;
};

function extractMediaResult(result: Record<string, unknown>): MediaToolResult | null {
  const kindRaw = typeof result.kind === "string" ? result.kind.toLowerCase() : null;
  if (kindRaw !== "image" && kindRaw !== "video") return null;
  const status = typeof result.status === "string" ? result.status.toLowerCase() : "succeeded";
  if (status === "failed" || status === "error" || status === "empty") return null;

  const url = typeof result.url === "string" ? result.url.trim() : "";
  const downloadUrl =
    typeof (result as { downloadUrl?: unknown }).downloadUrl === "string"
      ? ((result as { downloadUrl: string }).downloadUrl ?? "").trim()
      : "";
  const playbackUrl =
    typeof (result as { playbackUrl?: unknown }).playbackUrl === "string"
      ? ((result as { playbackUrl: string }).playbackUrl ?? "").trim()
      : "";
  const thumbnailUrl =
    typeof (result as { thumbnailUrl?: unknown }).thumbnailUrl === "string"
      ? ((result as { thumbnailUrl: string }).thumbnailUrl ?? "").trim()
      : typeof (result as { posterUrl?: unknown }).posterUrl === "string"
        ? ((result as { posterUrl: string }).posterUrl ?? "").trim()
        : "";
  const prompt = typeof result.prompt === "string" ? result.prompt.trim() : null;
  const resolvedUrl = kindRaw === "video" ? playbackUrl || downloadUrl || url : url;
  if (!resolvedUrl) return null;

  return {
    kind: kindRaw,
    url: resolvedUrl,
    prompt: prompt || null,
    thumbnailUrl: thumbnailUrl || null,
    playbackUrl: kindRaw === "video" ? resolvedUrl : null,
  };
}

function findLatestMediaResult(toolRuns: ToolRunResult[]): MediaToolResult | null {
  for (let i = toolRuns.length - 1; i >= 0; i -= 1) {
    const media = extractMediaResult(toolRuns[i]?.result ?? {});
    if (media) return media;
  }
  return null;
}

function buildOutputAttachment(media: MediaToolResult): ComposerChatAttachment {
  return {
    id: safeRandomUUID(),
    name: media.kind === "video" ? "Generated clip" : "Generated visual",
    mimeType: media.kind === "video" ? "video/*" : "image/*",
    size: 0,
    url: media.url,
    thumbnailUrl: media.thumbnailUrl,
    storageKey: null,
    sessionId: null,
    role: "output",
    source: "ai",
    excerpt: null,
  };
}

function applyToolMediaToResponse(
  response: PromptResponse,
  toolRuns: ToolRunResult[],
): { response: PromptResponse; attachments: ComposerChatAttachment[] | null } {
  const media = findLatestMediaResult(toolRuns);
  if (!media) return { response, attachments: null };

  const attachment = buildOutputAttachment(media);

  if (response.action === "draft_post") {
    const post = { ...(response.post ?? {}) };
    const hasMediaUrl =
      typeof (post as { mediaUrl?: unknown }).mediaUrl === "string"
        ? Boolean(((post as { mediaUrl: string }).mediaUrl ?? "").trim())
        : typeof (post as { media_url?: unknown }).media_url === "string"
          ? Boolean(((post as { media_url: string }).media_url ?? "").trim())
          : false;
    if (!hasMediaUrl) {
      (post as Record<string, unknown>).mediaUrl = media.url;
      (post as Record<string, unknown>).media_url = media.url;
    }
    if (media.kind === "video") {
      const playbackUrl = media.playbackUrl ?? media.url;
      const hasPlayback =
        typeof (post as { playbackUrl?: unknown }).playbackUrl === "string" ||
        typeof (post as { playback_url?: unknown }).playback_url === "string";
      if (!hasPlayback) {
        (post as Record<string, unknown>).playbackUrl = playbackUrl;
        (post as Record<string, unknown>).playback_url = playbackUrl;
      }
    }
    if (media.thumbnailUrl) {
      const hasThumb =
        typeof (post as { thumbnailUrl?: unknown }).thumbnailUrl === "string" ||
        typeof (post as { thumbnail_url?: unknown }).thumbnail_url === "string";
      if (!hasThumb) {
        (post as Record<string, unknown>).thumbnailUrl = media.thumbnailUrl;
        (post as Record<string, unknown>).thumbnail_url = media.thumbnailUrl;
      }
    }
    if (media.prompt) {
      const hasPrompt =
        typeof (post as { mediaPrompt?: unknown }).mediaPrompt === "string" ||
        typeof (post as { media_prompt?: unknown }).media_prompt === "string";
      if (!hasPrompt) {
        (post as Record<string, unknown>).mediaPrompt = media.prompt;
        (post as Record<string, unknown>).media_prompt = media.prompt;
      }
    }
    if (!(post as { kind?: unknown }).kind) {
      (post as Record<string, unknown>).kind = media.kind;
    }
    return { response: { ...response, post }, attachments: [attachment] };
  }

  const existingAttachments: ComposerChatAttachment[] =
    response.action === "chat_reply" && Array.isArray(response.replyAttachments)
      ? (response.replyAttachments as ComposerChatAttachment[])
      : [];
  const replyAttachments: ComposerChatAttachment[] = [...existingAttachments, attachment];
  return {
    response: { ...response, ...(response.action === "chat_reply" ? { replyAttachments } : {}) },
    attachments: replyAttachments,
  };
}

async function handleRenderImage(
  args: Record<string, unknown>,
  runtime: RuntimeContext,
): Promise<Record<string, unknown>> {
  const rawPrompt = typeof args.prompt === "string" ? args.prompt.trim() : "";
  if (!rawPrompt) {
    throw new Error("render_image requires a prompt.");
  }
  const sizeOverride = typeof args.size === "string" ? args.size.trim() : null;
  const qualityOverride = typeof args.quality === "string" ? args.quality.trim() : null;
  const stylePreset = typeof args.style === "string" ? args.style.trim() : null;

  const baseOptions = extractComposerImageOptions(runtime.composeOptions.rawOptions ?? {});
  const mergedOptions: ImageRequestOptions = {};
  if (baseOptions.quality) {
    mergedOptions.quality = baseOptions.quality;
  }
  if (qualityOverride && IMAGE_QUALITY_SET.has(qualityOverride as ComposerImageQuality)) {
    mergedOptions.quality = qualityOverride as ComposerImageQuality;
  }
  if (sizeOverride) {
    mergedOptions.size = sizeOverride;
  }

  const runContext = buildImageRunContext(rawPrompt, runtime.composeOptions, mergedOptions);
  if (stylePreset) {
    runContext.stylePreset = stylePreset;
  }
  const result = await generateImageFromPrompt(rawPrompt, mergedOptions, runContext);
  return {
    status: "succeeded",
    kind: "image",
    prompt: rawPrompt,
    url: result.url,
    provider: result.provider,
    runId: result.runId,
    metadata: result.metadata ?? null,
  };
}

function pickVideoAttachment(
  runtime: RuntimeContext,
  attachmentId?: string | null,
): ComposerChatAttachment | null {
  if (!attachmentId) return null;
  const attachment = runtime.attachments.get(attachmentId);
  if (!attachment) return null;
  const mime = (attachment.mimeType ?? "").toLowerCase();
  if (!mime.startsWith("video/")) return null;
  return attachment;
}

async function handleRenderVideo(
  args: Record<string, unknown>,
  runtime: RuntimeContext,
): Promise<Record<string, unknown>> {
  const prompt = typeof args.prompt === "string" ? args.prompt.trim() : "";
  if (!prompt) {
    throw new Error("render_video requires a prompt.");
  }
  const attachmentId =
    typeof args.reference_attachment_id === "string" ? args.reference_attachment_id.trim() : null;
  const reference = pickVideoAttachment(runtime, attachmentId);
  const videoContext = {
    capsuleId: runtime.capsuleId,
    ownerUserId: runtime.ownerId,
  };

  const result = reference
    ? await editVideoWithInstruction(reference.url, prompt, { ...videoContext, mode: "edit" })
    : await generateVideoFromPrompt(prompt, { ...videoContext, mode: "generate" });

  return {
    status: "succeeded",
    kind: "video",
    prompt,
    playbackUrl: result.playbackUrl,
    downloadUrl: result.url,
    thumbnailUrl: result.thumbnailUrl ?? result.posterUrl ?? null,
    muxAssetId: result.muxAssetId,
    muxPlaybackId: result.muxPlaybackId,
    durationSeconds: result.durationSeconds,
    memoryId: result.memoryId,
    runId: result.runId,
    provider: result.provider,
  };
}

async function handleAnalyzeDocument(
  args: Record<string, unknown>,
  runtime: RuntimeContext,
): Promise<Record<string, unknown>> {
  const attachmentId = typeof args.attachment_id === "string" ? args.attachment_id.trim() : "";
  if (!attachmentId) {
    throw new Error("analyze_document requires attachment_id.");
  }
  const attachment = runtime.attachments.get(attachmentId);
  if (!attachment) {
    throw new Error(`Attachment ${attachmentId} is not available.`);
  }
  const context = await buildAttachmentContext([attachment]);
  if (!context.length) {
    return {
      status: "empty",
      attachmentId,
      name: attachment.name,
      mimeType: attachment.mimeType,
    };
  }
  return {
    status: "succeeded",
    attachmentId,
    name: attachment.name,
    mimeType: attachment.mimeType,
    snippet: context[0]?.snippet ?? "",
    source: context[0]?.source ?? attachment.source ?? null,
  };
}

async function handleSummarizeVideo(
  args: Record<string, unknown>,
  runtime: RuntimeContext,
): Promise<Record<string, unknown>> {
  const attachmentId = typeof args.attachment_id === "string" ? args.attachment_id.trim() : "";
  if (!attachmentId) throw new Error("summarize_video requires attachment_id.");
  const attachment = runtime.attachments.get(attachmentId);
  if (!attachment) {
    throw new Error(`Attachment ${attachmentId} is not available.`);
  }
  const summary = await captionVideo(attachment.url, attachment.thumbnailUrl ?? null);
  if (!summary) {
    return { status: "empty", attachmentId };
  }
  return {
    status: "succeeded",
    attachmentId,
    summary,
  };
}

async function handleEmbedText(args: Record<string, unknown>): Promise<Record<string, unknown>> {
  const text = typeof args.text === "string" ? args.text.trim() : "";
  if (!text) throw new Error("embed_text requires text.");
  const embedding = await embedText(text);
  if (!embedding) {
    return { status: "empty" };
  }
  return {
    status: "succeeded",
    dimensions: embedding.length,
    vector: embedding,
  };
}

async function handleFetchContext(
  args: Record<string, unknown>,
  runtime: RuntimeContext,
): Promise<Record<string, unknown>> {
  const ownerId = runtime.ownerId;
  if (!ownerId) {
    throw new Error("fetch_context requires an authenticated owner.");
  }
  const rawQuery = typeof args.query === "string" ? args.query.trim() : "";
  const query = rawQuery.length ? rawQuery : runtime.latestUserText;
  const includeCapsuleHistory =
    args.include_capsule_history === true || args.include_capsule_history === "true";

  const contextResult = await getChatContext({
    ownerId,
    message: query,
    history: runtime.history,
    capsuleId: runtime.capsuleId ?? null,
  });
  const formatted = formatContextForPrompt(contextResult);
  const metadata = buildContextMetadata(contextResult);
  let capsuleSnippets: ChatMemorySnippet[] = [];
  if (includeCapsuleHistory && runtime.capsuleId) {
    capsuleSnippets = await getCapsuleHistorySnippets({
      capsuleId: runtime.capsuleId,
      limit: 4,
      query,
    });
  }
  return {
    status: "succeeded",
    query,
    metadata,
    prompt: formatted,
    snippets: contextResult?.snippets ?? [],
    capsuleSnippets,
  };
}

const TOOL_HANDLERS: Record<
  string,
  (args: Record<string, unknown>, runtime: RuntimeContext) => Promise<Record<string, unknown>>
> = {
  render_image: handleRenderImage,
  render_video: handleRenderVideo,
  analyze_document: handleAnalyzeDocument,
  summarize_video: handleSummarizeVideo,
  embed_text: handleEmbedText,
  fetch_context: handleFetchContext,
};

type ReplyMode = "chat" | "draft";

function buildSystemPrompt(replyMode: ReplyMode | null = null): string {
  const base = [
    "You are Capsules AI, the creative brain inside Composer.",
    "Decide whether the user wants free-form help or a publishable post.",
    "When it is just a conversation, respond with STRICT JSON { action: 'chat_reply', message: string }.",
    "When they need a draft, respond with STRICT JSON { action: 'draft_post', message?: string, post: {...} }.",
    "Never wrap JSON in markdown fences. Keep `message` warm and concise regardless of action.",
    "For drafts, the `post` block is used verbatim-respect tone, hashtags, CTA, and assets.",
    "Call render_image or render_video before referencing visual assets, and describe returned media accurately.",
    "Use analyze_document / summarize_video / fetch_context / embed_text tools whenever needed.",
    "If the user supplies an existing post, treat it as the current draft and adjust only requested sections.",
  ];

  if (replyMode === "chat") {
    base.push("User replyMode is chat-only: you MUST return action:'chat_reply' (never draft_post) for this turn.");
  } else if (replyMode === "draft") {
    base.push("User replyMode prefers drafting: return draft_post when you have publishable content; use chat_reply only for brief confirmations.");
  }

  return base.join(" ");
}

type ComposerRunInput = {
  userText: string;
  incomingPost?: Record<string, unknown> | null;
  context?: ComposeDraftOptions;
  maxIterations?: number;
};

function isExplanatoryCaption(text: string | null | undefined): boolean {
  if (!text) return false;
  const trimmed = text.trim();
  if (!trimmed.length) return false;
  const lc = trimmed.toLowerCase();
  return (
    /^here('?s)?\s+(how|what)\b/.test(lc) ||
    /^i\s+(changed|made|updated|adjusted|edited|tweaked)\b/.test(lc) ||
    lc.includes("here's what changed") ||
    lc.includes("i updated the image") ||
    lc.includes("i changed the image")
  );
}

function coerceDraftToChatResponse(
  validated: PromptResponse,
  replyMode: ReplyMode | null,
  assistantAttachments: ComposerChatAttachment[] | null,
): PromptResponse {
  if (validated.action !== "draft_post") return validated;
  if (replyMode === "draft") return validated;
  const kind =
    typeof (validated.post as { kind?: unknown })?.kind === "string"
      ? ((validated.post as { kind: string }).kind ?? "").toLowerCase()
      : "";
  const mediaUrl =
    typeof (validated.post as { mediaUrl?: unknown })?.mediaUrl === "string"
      ? ((validated.post as { mediaUrl: string }).mediaUrl ?? "").trim()
      : typeof (validated.post as { media_url?: unknown })?.media_url === "string"
        ? ((validated.post as { media_url: string }).media_url ?? "").trim()
        : "";
  const hasMedia = Boolean(mediaUrl) || kind === "image" || kind === "video";
  if (hasMedia) return validated;
  const postContent =
    typeof (validated.post as { content?: unknown })?.content === "string"
      ? ((validated.post as { content: string }).content ?? "").trim()
      : "";
  const shouldChat = replyMode === "chat" || isExplanatoryCaption(postContent);
  if (!shouldChat) return validated;
  const baseMessage =
    postContent.length > 0
      ? postContent
      : typeof validated.message === "string" && validated.message.trim().length
        ? validated.message.trim()
        : "Here’s what I’m seeing.";
  return {
    action: "chat_reply",
    message: baseMessage,
    ...(assistantAttachments && assistantAttachments.length
      ? { replyAttachments: assistantAttachments }
      : {}),
    threadId: validated.threadId,
    history: validated.history,
    context: validated.context,
  };
}

export async function runComposerToolSession(
  { userText, incomingPost = null, context = {}, maxIterations = DEFAULT_MAX_ITERATIONS }: ComposerRunInput,
  callbacks: ComposerToolCallbacks = {},
): Promise<{ response: PromptResponse; messages: ChatMessage[]; raw: unknown }> {
  const history = context.history ?? [];
  const attachments = context.attachments ?? [];
  const capsuleId = context.capsuleId ?? null;
  const ownerId = context.ownerId ?? null;
  const historyMessages = mapConversationToMessages(history, selectHistoryLimit(userText));
  const contextMessages = buildContextMessages(context);
  const userPayload: Record<string, unknown> = { instruction: userText };
  const safePost = sanitizePostForModel(incomingPost);
  if (safePost) {
    userPayload.post = safePost;
  }
  if (attachments.length) {
    userPayload.attachments = attachments.map((attachment) => ({
      id: attachment.id,
      name: attachment.name,
      mimeType: attachment.mimeType,
      url: attachment.url,
      thumbnailUrl: attachment.thumbnailUrl ?? null,
      role: attachment.role ?? "reference",
      source: attachment.source ?? null,
    }));
  }
  if (capsuleId) {
    userPayload.capsuleId = capsuleId;
  }
  if (context.rawOptions && Object.keys(context.rawOptions).length) {
    userPayload.options = context.rawOptions;
  }
  if (context.contextMetadata && Object.keys(context.contextMetadata).length) {
    userPayload.contextMetadata = context.contextMetadata;
  }

  const rawReplyMode =
    typeof (context.rawOptions as { replyMode?: unknown } | undefined)?.replyMode === "string"
      ? String((context.rawOptions as { replyMode: string }).replyMode).toLowerCase()
      : null;
  const replyMode: ReplyMode | null = rawReplyMode === "chat" || rawReplyMode === "draft" ? rawReplyMode : null;

  const messages: ChatMessage[] = [
    { role: "system", content: buildSystemPrompt(replyMode) },
    ...contextMessages,
    ...historyMessages,
    { role: "user", content: JSON.stringify(userPayload) },
  ];

  const runtime: RuntimeContext = {
    ownerId,
    capsuleId,
    attachments: buildAttachmentIndex(attachments),
    composeOptions: context,
    history,
    latestUserText: userText,
  };
  const toolRuns: ToolRunResult[] = [];

  const emit = callbacks.onEvent ?? (() => {});
  for (let iteration = 0; iteration < maxIterations; iteration += 1) {
    const { message, raw } = await callOpenAIToolChat(messages, TOOL_DEFINITIONS, {
      temperature: 0.6,
    });

    if (Array.isArray(message.tool_calls) && message.tool_calls.length) {
      messages.push({
        role: "assistant",
        content: message.content ?? "",
        tool_calls: message.tool_calls,
      });
      for (const call of message.tool_calls) {
        const handler = TOOL_HANDLERS[call.function.name];
        if (!handler) {
          emit({
            type: "tool_result",
            name: call.function.name,
            result: { status: "error", message: "Unknown tool" },
          });
          messages.push({
            role: "tool",
            tool_call_id: call.id,
            content: JSON.stringify({ status: "error", message: "Unknown tool" }),
          });
          continue;
        }
        let parsedArgs: Record<string, unknown> = {};
        try {
          parsedArgs = JSON.parse(call.function.arguments ?? "{}");
        } catch {
          parsedArgs = {};
        }
        emit({ type: "tool_call", name: call.function.name, args: parsedArgs });
        try {
          const result = await handler(parsedArgs, runtime);
          emit({ type: "tool_result", name: call.function.name, result });
          toolRuns.push({ name: call.function.name, result });
          messages.push({
            role: "tool",
            tool_call_id: call.id,
            content: JSON.stringify(result ?? {}),
          });
        } catch (error) {
          const messageText =
            error instanceof Error ? error.message : "Tool execution failed unexpectedly.";
          const failure = { status: "error", message: messageText };
          emit({ type: "tool_result", name: call.function.name, result: failure });
          messages.push({
            role: "tool",
            tool_call_id: call.id,
            content: JSON.stringify(failure),
          });
        }
      }
      continue;
    }

    const rawContent = typeof message.content === "string" ? message.content.trim() : "";
    const parsed = extractJSON<Record<string, unknown>>(rawContent);
    if (!parsed) {
      messages.push({
        role: "system",
        content: "Your previous reply was not valid JSON. Respond again with the required schema.",
      });
      continue;
    }

    try {
      const validated = promptResponseSchema.parse(parsed);
      const { response: hydrated, attachments: toolAttachments } = applyToolMediaToResponse(
        validated,
        toolRuns,
      );
      if (hydrated.action === "chat_reply") {
        const replyText = typeof hydrated.message === "string" ? hydrated.message.trim() : "";
        if (!replyText.length) {
          messages.push({
            role: "system",
            content:
              "Your previous reply did not include a `message`. Respond again with JSON containing `action: \"chat_reply\"` and a helpful `message` string.",
          });
          continue;
        }
        return {
          response: coerceDraftToChatResponse(hydrated, replyMode, toolAttachments),
          messages,
          raw,
        };
      }
      const draftContent =
        typeof (hydrated.post as { content?: unknown })?.content === "string"
          ? ((hydrated.post as { content: string }).content ?? "").trim()
          : "";
      if (!draftContent.length) {
        messages.push({
          role: "system",
          content:
            "Your previous reply was missing post.content. Respond again with JSON that includes a non-empty post.content caption reflecting the latest user instruction.",
        });
        continue;
      }
      return {
        response: coerceDraftToChatResponse(hydrated, replyMode, toolAttachments),
        messages,
        raw,
      };
    } catch (error) {
      messages.push({
        role: "system",
        content:
          "The JSON you returned was invalid. Respond again with only the JSON object that matches the expected schema.",
      });
      emit({
        type: "status",
        message: error instanceof Error ? error.message : "Schema validation failed.",
      });
    }
  }

  throw new Error("Composer tool session exceeded iteration limit.");
}
