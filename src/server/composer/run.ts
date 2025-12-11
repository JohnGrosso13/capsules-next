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
import { generateImageFromPrompt, editImageWithInstruction } from "@/lib/ai/prompter/images";
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
import { ensureAccessibleMediaUrl } from "@/server/posts/media";
import { searchGoogleImages, isGoogleImageSearchConfigured } from "@/server/search/google-images";
import { searchWeb, isWebSearchConfigured } from "@/server/search/web-search";
import { PDFDocument, StandardFonts } from "pdf-lib";
import PptxGenJS from "pptxgenjs";
import { uploadBufferToStorage } from "@/lib/supabase/storage";
import { indexMemory } from "@/lib/supabase/memories";

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
    name: "edit_image",
    description:
      "Edit a user-provided image attachment with natural language instructions (recolor, remove objects, adjust background, etc.). Use the provided attachment_id.",
    parameters: {
      type: "object",
      required: ["prompt", "attachment_id"],
      additionalProperties: false,
      properties: {
        prompt: { type: "string", description: "How to edit the referenced image." },
        attachment_id: {
          type: "string",
          description: "ID of the image attachment to edit (from the user's attachments list).",
        },
        size: {
          type: "string",
          description: "Optional square/portrait/landscape resolution (e.g., 1024x1024).",
        },
        quality: {
          type: "string",
          enum: ["low", "standard", "high"],
          description: "Edit quality tier; defaults to workspace preference.",
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
  {
    name: "search_web",
    description:
      "Look up real-world information on the internet using Google web search. Use this when you need fresh facts, local details, or to verify something not in your training data.",
    parameters: {
      type: "object",
      required: ["query"],
      additionalProperties: false,
      properties: {
        query: { type: "string", description: "What to search for on the web." },
        limit: {
          type: "integer",
          description: "How many results to fetch (1-6).",
          minimum: 1,
          maximum: 6,
        },
      },
    },
  },
  {
    name: "generate_pdf",
    description:
      "Render a polished, downloadable PDF for the user using the structured content you provide.",
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {
        title: { type: "string", description: "Document title." },
        summary: { type: "string", description: "Short intro or executive summary." },
        content: {
          type: "string",
          description: "Main body text when sections are not provided.",
        },
        bullets: {
          type: "array",
          items: { type: "string" },
          description: "Bullet points to include in the PDF.",
        },
        sections: {
          type: "array",
          description: "Optional sections with headings and body text.",
          items: {
            type: "object",
            required: ["heading", "body"],
            additionalProperties: false,
            properties: {
              heading: { type: "string" },
              body: { type: "string" },
            },
          },
        },
        footer: { type: "string", description: "Closing notes or sign-off." },
        download_name: { type: "string", description: "Filename for the PDF (will be sanitized)." },
      },
    },
  },
  {
    name: "generate_pptx",
    description:
      "Create a downloadable PowerPoint (.pptx) with slides, bullets, speaker notes, and optional images.",
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {
        title: { type: "string", description: "Deck title shown on the cover slide." },
        subtitle: { type: "string", description: "Optional subtitle for the cover slide." },
        download_name: { type: "string", description: "Filename for the PPTX (will be sanitized)." },
        slides: {
          type: "array",
          minItems: 1,
          items: {
            type: "object",
            additionalProperties: false,
            properties: {
              title: { type: "string", description: "Slide title." },
              subtitle: { type: "string", description: "Optional slide subtitle or lead-in." },
              bullets: {
                type: "array",
                items: { type: "string" },
                description: "Bullet points for this slide.",
              },
              body: { type: "string", description: "Paragraph-style body text." },
              notes: { type: "string", description: "Speaker notes for this slide." },
              image_url: {
                type: "string",
                description: "Optional image URL to embed on the slide.",
              },
              image_prompt: {
                type: "string",
                description: "If no image_url is provided, generate an image from this prompt.",
              },
            },
          },
        },
      },
    },
  },
  {
    name: "search_images",
    description:
      "Find real web images (e.g., locations, products) using Google Custom Search. Use this when the user asks for actual photos, not AI-generated art.",
    parameters: {
      type: "object",
      required: ["query"],
      additionalProperties: false,
      properties: {
        query: { type: "string", description: "What to search for (place, product, subject)." },
        limit: {
          type: "integer",
          description: "How many images to fetch (1-6).",
          minimum: 1,
          maximum: 6,
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
  kind: "image" | "video" | "file";
  url: string;
  prompt: string | null;
  thumbnailUrl: string | null;
  playbackUrl: string | null;
  mimeType?: string | null;
  name?: string | null;
  runId?: string | null;
  runStatus?: "pending" | "running" | "uploading" | "succeeded" | "failed" | null;
  memoryId?: string | null;
  muxAssetId?: string | null;
  muxPlaybackId?: string | null;
  durationSeconds?: number | null;
};

function extractMediaResult(result: Record<string, unknown>): MediaToolResult | null {
  const kindRaw = typeof result.kind === "string" ? result.kind.toLowerCase() : null;
  if (kindRaw !== "image" && kindRaw !== "video" && kindRaw !== "file") return null;
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

  const runId =
    typeof (result as { runId?: unknown }).runId === "string"
      ? ((result as { runId: string }).runId ?? "").trim()
      : typeof (result as { videoRunId?: unknown }).videoRunId === "string"
        ? ((result as { videoRunId: string }).videoRunId ?? "").trim()
        : typeof (result as { video_run_id?: unknown }).video_run_id === "string"
          ? ((result as { video_run_id: string }).video_run_id ?? "").trim()
          : null;
  const runStatusRaw =
    typeof (result as { videoRunStatus?: unknown }).videoRunStatus === "string"
      ? ((result as { videoRunStatus: string }).videoRunStatus ?? "").trim()
      : typeof (result as { video_run_status?: unknown }).video_run_status === "string"
        ? ((result as { video_run_status: string }).video_run_status ?? "").trim()
        : typeof (result as { runStatus?: unknown }).runStatus === "string"
          ? ((result as { runStatus: string }).runStatus ?? "").trim()
          : null;
  const runStatus = (() => {
    if (!runStatusRaw) return null;
    const lowered = runStatusRaw.toLowerCase();
    if (lowered === "pending" || lowered === "running" || lowered === "uploading") return "running";
    if (lowered === "succeeded" || lowered === "failed") return lowered as "succeeded" | "failed";
    return null;
  })();
  const durationSeconds =
    typeof (result as { durationSeconds?: unknown }).durationSeconds === "number"
      ? Number((result as { durationSeconds: number }).durationSeconds)
      : typeof (result as { duration_seconds?: unknown }).duration_seconds === "number"
        ? Number((result as { duration_seconds: number }).duration_seconds)
        : null;
  const muxAssetId =
    typeof (result as { muxAssetId?: unknown }).muxAssetId === "string"
      ? ((result as { muxAssetId: string }).muxAssetId ?? "").trim()
      : typeof (result as { mux_asset_id?: unknown }).mux_asset_id === "string"
        ? ((result as { mux_asset_id: string }).mux_asset_id ?? "").trim()
        : null;
  const muxPlaybackId =
    typeof (result as { muxPlaybackId?: unknown }).muxPlaybackId === "string"
      ? ((result as { muxPlaybackId: string }).muxPlaybackId ?? "").trim()
      : typeof (result as { mux_playback_id?: unknown }).mux_playback_id === "string"
        ? ((result as { mux_playback_id: string }).mux_playback_id ?? "").trim()
        : null;
  const memoryId =
    typeof (result as { memoryId?: unknown }).memoryId === "string"
      ? ((result as { memoryId: string }).memoryId ?? "").trim()
      : typeof (result as { memory_id?: unknown }).memory_id === "string"
        ? ((result as { memory_id: string }).memory_id ?? "").trim()
        : null;

  return {
    kind: kindRaw,
    url: resolvedUrl,
    prompt: prompt || null,
    thumbnailUrl: thumbnailUrl || null,
    playbackUrl: kindRaw === "video" ? resolvedUrl : null,
    mimeType:
      typeof (result as { mimeType?: unknown }).mimeType === "string"
        ? ((result as { mimeType: string }).mimeType ?? "").trim()
        : kindRaw === "file"
          ? "application/octet-stream"
          : null,
    name:
      typeof (result as { name?: unknown }).name === "string"
        ? ((result as { name: string }).name ?? "").trim()
        : null,
    runId: runId || null,
    runStatus,
    durationSeconds,
    muxAssetId,
    muxPlaybackId,
    memoryId,
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
  const isPresentation =
    (media.mimeType && media.mimeType.toLowerCase().includes("presentation")) ||
    (media.name && media.name.toLowerCase().endsWith(".pptx"));
  return {
    id: safeRandomUUID(),
    name:
      media.name && media.name.length
        ? media.name
        : media.kind === "video"
          ? "Generated clip"
          : media.kind === "file"
            ? isPresentation
              ? "Generated PPTX"
              : "Generated PDF"
            : "Generated visual",
    mimeType:
      media.mimeType && media.mimeType.length
        ? media.mimeType
        : media.kind === "video"
          ? "video/*"
          : media.kind === "file"
            ? isPresentation
              ? "application/vnd.openxmlformats-officedocument.presentationml.presentation"
              : "application/pdf"
            : "image/*",
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

  if (media.kind === "file") {
    const existingAttachments: ComposerChatAttachment[] =
      response.action === "chat_reply" && Array.isArray(response.replyAttachments)
        ? (response.replyAttachments as ComposerChatAttachment[])
        : [];
    const replyAttachments: ComposerChatAttachment[] = [...existingAttachments, attachment];
    return {
      response: {
        ...response,
        ...(response.action === "chat_reply" ? { replyAttachments } : {}),
      },
      attachments: replyAttachments,
    };
  }

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
    if (media.muxPlaybackId) {
      const hasMuxPlayback =
        typeof (post as { muxPlaybackId?: unknown }).muxPlaybackId === "string" ||
        typeof (post as { mux_playback_id?: unknown }).mux_playback_id === "string";
      if (!hasMuxPlayback) {
        (post as Record<string, unknown>).muxPlaybackId = media.muxPlaybackId;
        (post as Record<string, unknown>).mux_playback_id = media.muxPlaybackId;
      }
    }
    if (media.muxAssetId) {
      const hasMuxAsset =
        typeof (post as { muxAssetId?: unknown }).muxAssetId === "string" ||
        typeof (post as { mux_asset_id?: unknown }).mux_asset_id === "string";
      if (!hasMuxAsset) {
        (post as Record<string, unknown>).muxAssetId = media.muxAssetId;
        (post as Record<string, unknown>).mux_asset_id = media.muxAssetId;
      }
    }
    if (media.durationSeconds !== null && media.durationSeconds !== undefined) {
      const hasDuration =
        typeof (post as { durationSeconds?: unknown }).durationSeconds === "number" ||
        typeof (post as { duration_seconds?: unknown }).duration_seconds === "number";
      if (!hasDuration) {
        (post as Record<string, unknown>).durationSeconds = media.durationSeconds;
        (post as Record<string, unknown>).duration_seconds = media.durationSeconds;
      }
    }
    if (media.runId) {
      const hasRunId =
        typeof (post as { videoRunId?: unknown }).videoRunId === "string" ||
        typeof (post as { video_run_id?: unknown }).video_run_id === "string";
      if (!hasRunId) {
        (post as Record<string, unknown>).videoRunId = media.runId;
        (post as Record<string, unknown>).video_run_id = media.runId;
      }
    }
    if (media.runStatus) {
      const hasRunStatus =
        typeof (post as { videoRunStatus?: unknown }).videoRunStatus === "string" ||
        typeof (post as { video_run_status?: unknown }).video_run_status === "string";
      if (!hasRunStatus) {
        (post as Record<string, unknown>).videoRunStatus = media.runStatus;
        (post as Record<string, unknown>).video_run_status = media.runStatus;
      }
    }
    if (media.memoryId) {
      const hasMemory =
        typeof (post as { memoryId?: unknown }).memoryId === "string" ||
        typeof (post as { memory_id?: unknown }).memory_id === "string";
      if (!hasMemory) {
        (post as Record<string, unknown>).memoryId = media.memoryId;
        (post as Record<string, unknown>).memory_id = media.memoryId;
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

function pickImageAttachment(
  runtime: RuntimeContext,
  attachmentId?: string | null,
): ComposerChatAttachment | null {
  if (attachmentId) {
    const attachment = runtime.attachments.get(attachmentId);
    if (
      attachment &&
      attachment.url &&
      (attachment.mimeType ?? "").toLowerCase().startsWith("image/")
    ) {
      return attachment;
    }
  }

  for (const attachment of runtime.attachments.values()) {
    const mime = (attachment.mimeType ?? "").toLowerCase();
    if (mime.startsWith("image/") && attachment.url) {
      return attachment;
    }
  }
  return null;
}

async function handleEditImage(
  args: Record<string, unknown>,
  runtime: RuntimeContext,
): Promise<Record<string, unknown>> {
  const prompt = typeof args.prompt === "string" ? args.prompt.trim() : "";
  if (!prompt) {
    throw new Error("edit_image requires a prompt.");
  }
  const attachmentId =
    typeof args.attachment_id === "string" ? args.attachment_id.trim() : null;
  const attachment = pickImageAttachment(runtime, attachmentId);
  if (!attachment) {
    if (attachmentId) {
      throw new Error(`Attachment ${attachmentId} is not an editable image.`);
    }
    throw new Error("No image attachment is available to edit.");
  }

  const baseOptions = extractComposerImageOptions(runtime.composeOptions.rawOptions ?? {});
  const mergedOptions: ImageRequestOptions = {};
  if (baseOptions.quality) {
    mergedOptions.quality = baseOptions.quality;
  }
  const qualityOverride = typeof args.quality === "string" ? args.quality.trim() : null;
  if (qualityOverride && IMAGE_QUALITY_SET.has(qualityOverride as ComposerImageQuality)) {
    mergedOptions.quality = qualityOverride as ComposerImageQuality;
  }
  const sizeOverride = typeof args.size === "string" ? args.size.trim() : null;
  if (sizeOverride) {
    mergedOptions.size = sizeOverride;
  }

  const sourceUrl =
    (await ensureAccessibleMediaUrl(attachment.url).catch(() => null)) ?? attachment.url;
  if (!sourceUrl) {
    throw new Error("Image attachment is missing a usable URL.");
  }

  const runContext = buildImageRunContext(prompt, runtime.composeOptions, mergedOptions, "edit");
  runContext.options = {
    ...(runContext.options ?? {}),
    referenceAttachmentId: attachment.id,
  };

  const result = await editImageWithInstruction(sourceUrl, prompt, mergedOptions, runContext);
  return {
    status: "succeeded",
    kind: "image",
    prompt,
    url: result.url,
    provider: result.provider,
    runId: result.runId,
    metadata: result.metadata ?? null,
    referenceAttachmentId: attachment.id,
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
    videoRunStatus: result.runStatus ?? "succeeded",
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
  const rawUrl = attachment.url ?? null;
  if (!rawUrl) {
    return { status: "empty", attachmentId };
  }
  const rawThumb = attachment.thumbnailUrl ?? null;
  const accessibleUrl = await ensureAccessibleMediaUrl(rawUrl);
  const accessibleThumb = await ensureAccessibleMediaUrl(rawThumb);
  const summary = await captionVideo(accessibleUrl ?? rawUrl, accessibleThumb ?? rawThumb);
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

function sanitizePdfFilename(value: string | null | undefined): string {
  const fallback = "capsule.pdf";
  if (!value) return fallback;
  const safe = value.replace(/[^\w.-]+/g, "_").replace(/_{2,}/g, "_").replace(/^_+|_+$/g, "");
  const resolved = safe.length ? safe : "capsule";
  return resolved.toLowerCase().endsWith(".pdf") ? resolved : `${resolved}.pdf`;
}

function sanitizePptxFilename(value: string | null | undefined): string {
  const fallback = "capsule.pptx";
  if (!value) return fallback;
  const safe = value.replace(/[^\w.-]+/g, "_").replace(/_{2,}/g, "_").replace(/^_+|_+$/g, "");
  const resolved = safe.length ? safe : "capsule";
  return resolved.toLowerCase().endsWith(".pptx") ? resolved : `${resolved}.pptx`;
}

async function handleGeneratePdf(
  args: Record<string, unknown>,
  runtime: RuntimeContext,
): Promise<Record<string, unknown>> {
  const ownerId = runtime.ownerId;
  if (!ownerId) {
    throw new Error("generate_pdf requires an authenticated owner.");
  }

  const title = typeof args.title === "string" ? args.title.trim() : null;
  const summary = typeof args.summary === "string" ? args.summary.trim() : null;
  const body = typeof args.content === "string" ? args.content.trim() : null;
  const footer = typeof args.footer === "string" ? args.footer.trim() : null;
  const downloadName = typeof args.download_name === "string" ? args.download_name.trim() : null;

  const bullets = Array.isArray(args.bullets)
    ? (args.bullets as unknown[])
        .map((entry) => (typeof entry === "string" ? entry.trim() : ""))
        .filter((entry) => entry.length > 0)
    : [];

  const sections = Array.isArray(args.sections)
    ? (args.sections as unknown[])
        .map((entry) => {
          if (!entry || typeof entry !== "object") return null;
          const heading =
            typeof (entry as { heading?: unknown }).heading === "string"
              ? ((entry as { heading: string }).heading ?? "").trim()
              : "";
          const content =
            typeof (entry as { body?: unknown }).body === "string"
              ? ((entry as { body: string }).body ?? "").trim()
              : "";
          if (!heading.length || !content.length) return null;
          return { heading, body: content };
        })
        .filter((entry): entry is { heading: string; body: string } => Boolean(entry))
    : [];

  if (!summary && !body && !bullets.length && !sections.length) {
    throw new Error("generate_pdf needs summary, content, bullets, or sections to render.");
  }

  const pdfDoc = await PDFDocument.create();
  const normalFont = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  let page = pdfDoc.addPage();
  const { width, height } = page.getSize();
  let cursorY = height - 60;
  const marginX = 50;

  const lineHeight = 16;
  const paragraphSpacing = 10;
  const maxWidth = width - marginX * 2;

  const drawBlock = (
    text: string,
    options: { font?: typeof normalFont; fontSize?: number; gapAbove?: number; gapBelow?: number } = {},
  ) => {
    const font = options.font ?? normalFont;
    const fontSize = options.fontSize ?? 12;
    const gapAbove = options.gapAbove ?? 0;
    const gapBelow = options.gapBelow ?? paragraphSpacing;

    if (!text.trim().length) return;
    cursorY -= gapAbove;

    const words = text.split(/\s+/);
    let line = "";
    const lines: string[] = [];
    words.forEach((word) => {
      const tentative = line.length ? `${line} ${word}` : word;
      const w = font.widthOfTextAtSize(tentative, fontSize);
      if (w <= maxWidth) {
        line = tentative;
      } else {
        if (line.length) lines.push(line);
        line = word;
      }
    });
    if (line.length) lines.push(line);

    lines.forEach((l) => {
      if (cursorY < 80) {
        page = pdfDoc.addPage();
        cursorY = page.getSize().height - 60;
      }
      page.drawText(l, { x: marginX, y: cursorY, size: fontSize, font });
      cursorY -= lineHeight;
    });
    cursorY -= gapBelow;
  };

  if (title) {
    drawBlock(title, { font: boldFont, fontSize: 20, gapBelow: 14 });
  }
  if (summary) {
    drawBlock(summary, { font: normalFont, fontSize: 13 });
  }
  if (bullets.length) {
    bullets.forEach((entry) => {
      drawBlock(`• ${entry}`, { font: normalFont, fontSize: 12, gapBelow: 6, gapAbove: 2 });
    });
  }
  if (sections.length) {
    sections.forEach((section) => {
      drawBlock(section.heading, { font: boldFont, fontSize: 14, gapAbove: 8, gapBelow: 4 });
      drawBlock(section.body, { font: normalFont, fontSize: 12 });
    });
  }
  if (body && !sections.length) {
    drawBlock(body, { font: normalFont, fontSize: 12 });
  }
  if (footer) {
    drawBlock(footer, { font: normalFont, fontSize: 11, gapAbove: 12 });
  }

  const pdfBytes = await pdfDoc.save();
  const pdfBuffer = Buffer.from(pdfBytes);

  const filename = sanitizePdfFilename(downloadName ?? title ?? "capsule");
  const uploadName = filename.toLowerCase().endsWith(".pdf") ? filename.slice(0, -4) : filename;
  const { url, key } = await uploadBufferToStorage(pdfBuffer, "application/pdf", uploadName, {
    ownerId,
    kind: "ai-pdf",
  });

  let memoryId: string | null = null;
  try {
    const bulletText = bullets.join("\n");
    const sectionText = sections.map((section) => `${section.heading}\n${section.body}`).join("\n\n");
    const rawText = [title, summary, body, bulletText, sectionText, footer]
      .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
      .join("\n\n");
    const memoryDescription =
      summary ||
      body ||
      (sections.length ? sections[0]?.body ?? null : null) ||
      (bullets.length ? bullets.join(" • ") : null) ||
      "AI generated PDF";
    const metadata: Record<string, unknown> = {
      source: "ai-pdf",
      file_extension: "pdf",
      mime_type: "application/pdf",
      download_name: filename,
    };
    if (key) {
      metadata.storage_key = key;
      metadata.upload_key = key;
    }
    if (bullets.length) {
      metadata.bullet_count = bullets.length;
    }
    if (sections.length) {
      metadata.section_count = sections.length;
      metadata.section_headings = sections.map((section) => section.heading);
    }
    if (runtime.capsuleId) {
      metadata.capsule_id = runtime.capsuleId;
    }

    memoryId = await indexMemory({
      ownerId,
      kind: "upload",
      mediaUrl: url,
      mediaType: "application/pdf",
      title: title || downloadName || "AI PDF",
      description: memoryDescription,
      postId: null,
      metadata,
      rawText: rawText || null,
      source: "ai-pdf",
      tags: ["ai", "pdf", "document"],
    });
  } catch (error) {
    console.warn("ai_pdf_memory_index_failed", error);
  }

  return {
    status: "succeeded",
    kind: "file",
    mimeType: "application/pdf",
    url,
    name: filename,
    storageKey: key ?? null,
    memoryId,
  };
}

type NormalizedSlide = {
  title: string;
  subtitle: string | null;
  bullets: string[];
  body: string | null;
  notes: string | null;
  imageUrl: string | null;
  imagePrompt: string | null;
};

function normalizeSlides(args: Record<string, unknown>): NormalizedSlide[] {
  const slidesRaw = Array.isArray(args.slides) ? (args.slides as unknown[]) : [];
  const normalized: NormalizedSlide[] = [];

  slidesRaw.forEach((entry, index) => {
    if (!entry || typeof entry !== "object") return;
    const record = entry as Record<string, unknown>;
    const title =
      typeof record.title === "string" && record.title.trim().length
        ? record.title.trim()
        : `Slide ${index + 1}`;
    const subtitle =
      typeof record.subtitle === "string" && record.subtitle.trim().length
        ? record.subtitle.trim()
        : null;
    const body =
      typeof record.body === "string" && record.body.trim().length ? record.body.trim() : null;
    const notes =
      typeof record.notes === "string" && record.notes.trim().length ? record.notes.trim() : null;
    const imageUrl =
      typeof record.image_url === "string" && record.image_url.trim().length
        ? record.image_url.trim()
        : null;
    const imagePrompt =
      typeof record.image_prompt === "string" && record.image_prompt.trim().length
        ? record.image_prompt.trim()
        : null;
    const bullets = Array.isArray(record.bullets)
      ? (record.bullets as unknown[])
          .map((bullet) => (typeof bullet === "string" ? bullet.trim() : ""))
          .filter((bullet) => bullet.length > 0)
      : [];

    if (!body && !bullets.length && !title && !subtitle) return;

    normalized.push({ title, subtitle, body, bullets, notes, imageUrl, imagePrompt });
  });

  return normalized;
}

async function fetchImageDataUri(url: string | null): Promise<string | null> {
  if (!url) return null;
  const accessible = await ensureAccessibleMediaUrl(url);
  const target = accessible ?? url;
  try {
    const response = await fetch(target);
    if (!response.ok) return null;
    const contentType = response.headers.get("content-type") || "image/png";
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const base64 = buffer.toString("base64");
    return `data:${contentType};base64,${base64}`;
  } catch (error) {
    console.warn("pptx image fetch failed", error);
    return null;
  }
}

async function resolveSlideImage(
  slide: NormalizedSlide,
  runtime: RuntimeContext,
): Promise<{ dataUri: string; sourceUrl: string | null } | null> {
  if (slide.imageUrl) {
    const dataUri = await fetchImageDataUri(slide.imageUrl);
    if (dataUri) {
      return { dataUri, sourceUrl: slide.imageUrl };
    }
  }

  if (slide.imagePrompt && runtime.ownerId) {
    try {
      const image = await generateImageFromPrompt(
        slide.imagePrompt,
        {},
        {
          ownerId: runtime.ownerId,
          assetKind: "pptx-slide",
          mode: "generate",
          userPrompt: slide.imagePrompt,
          resolvedPrompt: slide.imagePrompt,
          stylePreset: null,
          options: { size: "1024x1024", quality: "standard" },
        },
      );
      const dataUri = await fetchImageDataUri(image.url);
      if (dataUri) {
        return { dataUri, sourceUrl: image.url };
      }
    } catch (error) {
      console.warn("pptx image generation failed", error);
    }
  }
  return null;
}

async function handleGeneratePptx(
  args: Record<string, unknown>,
  runtime: RuntimeContext,
): Promise<Record<string, unknown>> {
  const ownerId = runtime.ownerId;
  if (!ownerId) {
    throw new Error("generate_pptx requires an authenticated owner.");
  }

  const deckTitle = typeof args.title === "string" ? args.title.trim() : "";
  const deckSubtitle = typeof args.subtitle === "string" ? args.subtitle.trim() : "";
  const downloadName = typeof args.download_name === "string" ? args.download_name.trim() : null;
  const slides = normalizeSlides(args);

  if (!slides.length) {
    throw new Error("generate_pptx needs at least one slide with content.");
  }

  const pptx = new PptxGenJS();
  pptx.author = "Capsules AI";
  pptx.company = "Capsules";
  pptx.subject = deckTitle || "AI Presentation";

  const hasCover = deckTitle.length > 0 || deckSubtitle.length > 0;
  if (hasCover) {
    const cover = pptx.addSlide();
    cover.addText(deckTitle || "Presentation", {
      x: 0.5,
      y: 1,
      w: 9,
      h: 1,
      fontSize: 36,
      bold: true,
    });
    if (deckSubtitle.length) {
      cover.addText(deckSubtitle, {
        x: 0.5,
        y: 2,
        w: 9,
        h: 0.7,
        fontSize: 22,
        color: "666666",
      });
    }
  }

  let embeddedImages = 0;
  const slideSummaries: string[] = [];

  for (const slideData of slides) {
    const slide = pptx.addSlide();
    const title = slideData.title || "Slide";
    slide.addText(title, { x: 0.5, y: 0.5, w: 9, h: 0.6, fontSize: 28, bold: true });
    if (slideData.subtitle) {
      slide.addText(slideData.subtitle, {
        x: 0.5,
        y: 1.2,
        w: 9,
        h: 0.5,
        fontSize: 18,
        color: "555555",
      });
    }

    const image = await resolveSlideImage(slideData, runtime);
    let textX = 0.6;
    const textY = slideData.subtitle ? 1.9 : 1.5;
    let textW = 9;
    const textH = 4.5;

    if (image) {
      embeddedImages += 1;
      slide.addImage({
        data: image.dataUri,
        x: 0.6,
        y: textY,
        w: 4.5,
        h: 3.2,
        sizing: { type: "contain", w: 4.5, h: 3.2 },
      });
      textX = 5.3;
      textW = 4.0;
    }

    const bullets = slideData.bullets;
    const bodyText = slideData.body;

    if (bullets.length) {
      slide.addText(bullets.map((b) => `• ${b}`).join("\n"), {
        x: textX,
        y: textY,
        w: textW,
        h: textH,
        fontSize: 18,
        bullet: true,
        lineSpacing: 24,
      });
    } else if (bodyText) {
      slide.addText(bodyText, {
        x: textX,
        y: textY,
        w: textW,
        h: textH,
        fontSize: 18,
        lineSpacing: 22,
      });
    }

    if (slideData.notes) {
      slide.addNotes(slideData.notes);
    }

    const summaryParts = [
      title,
      slideData.subtitle ?? null,
      bullets.join("; "),
      bodyText,
      slideData.notes ? `Notes: ${slideData.notes}` : null,
    ].filter(Boolean) as string[];
    slideSummaries.push(summaryParts.join(" | "));
  }

  const arrayBuffer = (await pptx.write({ outputType: "arraybuffer" })) as
    | ArrayBuffer
    | Buffer
    | string;
  const pptxBuffer =
    typeof arrayBuffer === "string"
      ? Buffer.from(arrayBuffer, "binary")
      : Buffer.isBuffer(arrayBuffer)
        ? arrayBuffer
        : Buffer.from(arrayBuffer as ArrayBuffer);

  const PPTX_MIME =
    "application/vnd.openxmlformats-officedocument.presentationml.presentation";
  const filename = sanitizePptxFilename((downloadName ?? deckTitle) || "presentation");
  const uploadName = filename.toLowerCase().endsWith(".pptx")
    ? filename.slice(0, -5)
    : filename;

  const { url, key } = await uploadBufferToStorage(pptxBuffer, PPTX_MIME, uploadName, {
    ownerId,
    kind: "ai-pptx",
    metadata: { slide_count: slides.length, image_count: embeddedImages },
  });

  let memoryId: string | null = null;
  try {
    const rawText = slideSummaries.join("\n\n");
    const metadata: Record<string, unknown> = {
      source: "ai-pptx",
      file_extension: "pptx",
      mime_type: PPTX_MIME,
      download_name: filename,
      slide_count: slides.length,
      image_count: embeddedImages,
    };
    if (key) {
      metadata.storage_key = key;
      metadata.upload_key = key;
    }
    if (runtime.capsuleId) {
      metadata.capsule_id = runtime.capsuleId;
    }
    memoryId = await indexMemory({
      ownerId,
      kind: "upload",
      mediaUrl: url,
      mediaType: PPTX_MIME,
      title: deckTitle || filename,
      description: deckSubtitle || slides[0]?.subtitle || slides[0]?.title || "AI presentation",
      postId: null,
      metadata,
      rawText,
      source: "ai-pptx",
      tags: ["ai", "pptx", "presentation"],
    });
  } catch (error) {
    console.warn("ai_pptx_memory_index_failed", error);
  }

  return {
    status: "succeeded",
    kind: "file",
    mimeType: PPTX_MIME,
    url,
    name: filename,
    storageKey: key ?? null,
    memoryId,
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

async function handleSearchWeb(
  args: Record<string, unknown>,
  runtime: RuntimeContext,
): Promise<Record<string, unknown>> {
  const rawQuery = typeof args.query === "string" ? args.query.trim() : "";
  const query = rawQuery.length ? rawQuery : runtime.latestUserText;
  const limitRaw = typeof args.limit === "number" ? args.limit : undefined;
  const limit = limitRaw && Number.isFinite(limitRaw) ? Math.max(1, Math.min(limitRaw, 6)) : 4;

  if (!query.trim().length) {
    throw new Error("search_web requires a query.");
  }
  if (!isWebSearchConfigured()) {
    return { status: "error", message: "Web search is not configured." };
  }

  const results = await searchWeb(query, { limit });
  if (!results.length) {
    return { status: "empty", query };
  }

  const [primary] = results;
  return {
    status: "succeeded",
    kind: "web",
    query,
    title: primary?.title ?? null,
    snippet: primary?.snippet ?? null,
    url: primary?.url ?? null,
    results,
  };
}

async function handleSearchImages(
  args: Record<string, unknown>,
  runtime: RuntimeContext,
): Promise<Record<string, unknown>> {
  const rawQuery = typeof args.query === "string" ? args.query.trim() : "";
  const query = rawQuery.length ? rawQuery : runtime.latestUserText;
  const limitRaw = typeof args.limit === "number" ? args.limit : undefined;
  const limit = limitRaw && Number.isFinite(limitRaw) ? Math.max(1, Math.min(limitRaw, 6)) : 4;

  if (!query.trim().length) {
    throw new Error("search_images requires a query.");
  }
  if (!isGoogleImageSearchConfigured()) {
    return { status: "error", message: "Image search is not configured." };
  }

  const results = await searchGoogleImages(query, { limit });
  if (!results.length) {
    return { status: "empty", query };
  }

  const [primary] = results;
  if (!primary) {
    return { status: "empty", query };
  }
  return {
    status: "succeeded",
    kind: "image",
    url: primary.link,
    thumbnailUrl: primary.thumbnail ?? null,
    prompt: query,
    name: primary.title,
    results,
  };
}

const TOOL_HANDLERS: Record<
  string,
  (args: Record<string, unknown>, runtime: RuntimeContext) => Promise<Record<string, unknown>>
> = {
  render_image: handleRenderImage,
  edit_image: handleEditImage,
  render_video: handleRenderVideo,
  analyze_document: handleAnalyzeDocument,
  summarize_video: handleSummarizeVideo,
  embed_text: handleEmbedText,
  fetch_context: handleFetchContext,
  search_web: handleSearchWeb,
  search_images: handleSearchImages,
  generate_pdf: handleGeneratePdf,
  generate_pptx: handleGeneratePptx,
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
    "If the user wants changes to an attached image, call edit_image with the relevant attachment_id (pick the best matching image attachment) instead of inventing a new render.",
    "When the user refers to their feed, capsules, memories, or past work, call fetch_context to retrieve grounded context instead of guessing.",
    "Use search_web (and fetch_context when relevant) for real-world facts-game/map names, events, releases, stats-before listing specifics. Do not invent names; cite the latest results.",
    "Do NOT paste raw media URLs (images, videos, downloads) into your `message`; attachments are already shared with the user.",
    "Use analyze_document / summarize_video / fetch_context / search_web / search_images / embed_text / generate_pdf / generate_pptx tools whenever needed.",
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

// Internal hooks for tests
export const __test__ = {
  handleGeneratePptx,
};
