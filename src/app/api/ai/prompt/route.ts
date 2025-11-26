import { z } from "zod";

import { hasOpenAIApiKey } from "@/adapters/ai/openai/server";
import { safeRandomUUID } from "@/lib/random";
import { createPollDraft, type ComposeDraftOptions } from "@/lib/ai/prompter";
import {
  sanitizeComposerChatAttachment,
  sanitizeComposerChatHistory,
  type ComposerChatAttachment,
  type ComposerChatMessage,
} from "@/lib/composer/chat-types";
import { promptResponseSchema, type PromptResponse, type ComposerAttachment } from "@/shared/schemas/ai";
import { ensureUserFromRequest } from "@/lib/auth/payload";
import {
  parseJsonBody,
  returnError,
  validatedJson,
} from "@/server/validation/http";
import {
  buildAttachmentContext,
  formatAttachmentContextForPrompt,
} from "@/server/composer/attachment-context";
import {
  runComposerToolSession,
  type ComposerToolEvent,
} from "@/server/composer/run";
import { storeConversationSnapshot } from "@/server/ai/conversation-store";
import {
  checkRateLimit,
  retryAfterSeconds as computeRetryAfterSeconds,
  type RateLimitDefinition,
} from "@/server/rate-limit";
import { deriveRequestOrigin } from "@/lib/url";
import {
  getChatContext,
  formatContextForPrompt,
  buildContextMetadata,
  getCapsuleHistorySnippets,
} from "@/server/chat/retrieval";
import type { ChatMemorySnippet } from "@/server/chat/retrieval";
import { getUserCardCached } from "@/server/chat/user-card";

const attachmentSchema = z.object({
  id: z.string(),
  name: z.string(),
  mimeType: z.string(),
  size: z.number().min(0).optional(),
  url: z.string(),
  thumbnailUrl: z.string().optional().nullable(),
  storageKey: z.string().optional().nullable(),
  sessionId: z.string().optional().nullable(),
  role: z.enum(["reference", "output"]).optional(),
  source: z.string().optional().nullable(),
  excerpt: z.string().optional().nullable(),
});

const historyMessageSchema = z.object({
  id: z.string().optional(),
  role: z.enum(["user", "assistant", "system"]),
  content: z.string(),
  createdAt: z.string().optional(),
  attachments: z.array(attachmentSchema).optional(),
});

const requestSchema = z.object({
  message: z.string().min(1),
  options: z.record(z.string(), z.unknown()).optional(),
  post: z.record(z.string(), z.unknown()).optional().nullable(),
  attachments: z.array(attachmentSchema).optional(),
  history: z.array(historyMessageSchema).optional(),
  threadId: z.string().optional(),
  capsuleId: z.string().optional().nullable(),
  useContext: z.boolean().optional(),
  stream: z.boolean().optional(),
});

type ContextRecord = {
  id: string;
  title: string | null;
  snippet: string;
  source: string | null;
  url: string | null;
  kind: string | null;
  tags: string[];
  highlightHtml: string | null;
};

function generateThreadId(): string {
  return safeRandomUUID();
}

function coerceThreadId(value: unknown): string {
  if (typeof value === "string" && value.trim().length > 0) {
    return value.trim();
  }
  return generateThreadId();
}

function sanitizeAttachments(
  input: z.infer<typeof attachmentSchema>[] | undefined,
): ComposerChatAttachment[] {
  if (!input || !Array.isArray(input)) return [];
  return input
    .map((entry) =>
      sanitizeComposerChatAttachment({
        ...entry,
        size:
          typeof entry.size === "number" && Number.isFinite(entry.size)
            ? entry.size
            : 0,
      }),
    )
    .filter(
      (attachment): attachment is ComposerChatAttachment =>
        Boolean(attachment),
    );
}

function collectRecentUserText(history: ComposerChatMessage[] | undefined, limit = 3): string {
  if (!history || !history.length) return "";
  const recentUsers = history
    .slice()
    .reverse()
    .filter((entry) => entry.role === "user")
    .slice(0, limit)
    .map((entry) => (typeof entry.content === "string" ? entry.content : ""))
    .filter(Boolean);
  return recentUsers.join(" ");
}

function detectRecallIntent(params: {
  message: string;
  history: ComposerChatMessage[] | undefined;
  rawOptions: Record<string, unknown> | null | undefined;
  attachments: ComposerChatAttachment[];
  capsuleId?: string | null;
}): boolean {
  const { message, history, rawOptions, attachments, capsuleId } = params;
  if (rawOptions && typeof (rawOptions as { recall?: unknown }).recall === "boolean") {
    return Boolean((rawOptions as { recall?: boolean }).recall);
  }
  if (capsuleId && capsuleId.trim().length) {
    return true;
  }
  const text = [message, collectRecentUserText(history)].join(" ").toLowerCase();
  const recallKeywords = [
    "memory",
    "memories",
    "remember",
    "recall",
    "last time",
    "previous chat",
    "previous conversation",
    "last post",
    "previous post",
    "pull up",
    "show me my",
    "what did we",
    "capsule history",
    "search the capsule",
    "look up",
    "find my",
    "search web",
    // Capsule history / membership phrasing
    "first member",
    "who joined",
    "members joined",
    "member count",
    "headcount",
    "growth",
    "since we started",
    "since launch",
    "since created",
    "when did this capsule start",
    "how long has this capsule",
    "how long has it existed",
    "started",
    "created",
    "founded",
    "year ago",
    "years ago",
    "months ago",
    "history",
    "most liked",
    "liked post",
    "likes",
    "views",
    "uploads",
    "media",
    "library",
    "headcount",
    "membership",
    "member history",
    "post history",
    "show my posts",
    "what did i",
    "what have i",
    "old posts",
  ];
  const mentionsRecall = recallKeywords.some((keyword) => text.includes(keyword));
  const mentionsAttachment =
    attachments.length > 0 && /attachment|file|upload|photo|image|picture|doc|pdf|screenshot/.test(text);
  return mentionsRecall || mentionsAttachment;
}

function buildAssistantAttachments(
  post: Record<string, unknown> | null | undefined,
): ComposerChatAttachment[] | null {
  if (!post) return null;
  const mediaUrl =
    typeof (post as { mediaUrl?: unknown }).mediaUrl === "string"
      ? ((post as { mediaUrl: string }).mediaUrl ?? "").trim()
      : typeof (post as { media_url?: unknown }).media_url === "string"
        ? ((post as { media_url: string }).media_url ?? "").trim()
        : "";
  if (!mediaUrl) return null;
  const kind =
    typeof (post as { kind?: unknown }).kind === "string"
      ? ((post as { kind: string }).kind ?? "").toLowerCase()
      : "image";
  const mimeType =
    kind === "video"
      ? "video/*"
      : kind === "image"
        ? "image/*"
        : "application/octet-stream";
  const thumbnail =
    typeof (post as { thumbnailUrl?: unknown }).thumbnailUrl === "string"
      ? ((post as { thumbnailUrl: string }).thumbnailUrl ?? "").trim()
      : typeof (post as { thumbnail_url?: unknown }).thumbnail_url ===
          "string"
        ? ((post as { thumbnail_url: string }).thumbnail_url ?? "").trim()
        : null;
  return [
    {
      id: safeRandomUUID(),
      name: kind === "video" ? "Generated clip" : "Generated visual",
      mimeType,
      size: 0,
      url: mediaUrl,
      thumbnailUrl: thumbnail && thumbnail.length ? thumbnail : null,
      storageKey: null,
      sessionId: null,
      role: "output",
      source: "ai",
      excerpt: null,
    },
  ];
}

function normalizeChatReplyAttachments(
  attachments: ComposerAttachment[] | undefined,
): ComposerChatAttachment[] | null {
  if (!attachments || !attachments.length) return null;
  const sanitized = attachments
    .map((attachment) => sanitizeComposerChatAttachment(attachment))
    .filter((attachment): attachment is ComposerChatAttachment => Boolean(attachment));
  return sanitized.length ? sanitized : null;
}

const HISTORY_RETURN_LIMIT = 24;

const PROMPT_RATE_LIMIT: RateLimitDefinition = {
  name: "ai.prompt",
  limit: 30,
  window: "5 m",
};

const CONTEXT_SNIPPET_LIMIT = 6;
const CONTEXT_CHAR_BUDGET = 4000;

function trimContextSnippets(
  snippets: ChatMemorySnippet[],
  limit: number = CONTEXT_SNIPPET_LIMIT,
  charBudget: number = CONTEXT_CHAR_BUDGET,
): ChatMemorySnippet[] {
  const trimmed: ChatMemorySnippet[] = [];
  let used = 0;
  for (const snippet of snippets) {
    if (trimmed.length >= limit) break;
    const cost = snippet.snippet.length + (snippet.title?.length ?? 0);
    if (used + cost > charBudget && trimmed.length > 0) break;
    trimmed.push(snippet);
    used += cost;
  }
  return trimmed;
}

function sseChunk(data: Record<string, unknown>): Uint8Array {
  const encoder = new TextEncoder();
  return encoder.encode(`data: ${JSON.stringify(data)}\n\n`);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function chunkText(text: string): string[] {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized.length) return [];
  const parts = normalized.split(/(?<=[.!?])\s+/).filter(Boolean);
  return parts.length ? parts : [normalized];
}

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

function coerceDraftToChatReply(
  response: PromptResponse,
  replyMode: "chat" | "draft" | null,
): PromptResponse {
  if (response.action !== "draft_post") return response;
  if (replyMode === "draft") return response;
  const kind =
    typeof (response.post as { kind?: unknown })?.kind === "string"
      ? ((response.post as { kind: string }).kind ?? "").toLowerCase()
      : "";
  const mediaUrl =
    typeof (response.post as { mediaUrl?: unknown })?.mediaUrl === "string"
      ? ((response.post as { mediaUrl: string }).mediaUrl ?? "").trim()
      : typeof (response.post as { media_url?: unknown })?.media_url === "string"
        ? ((response.post as { media_url: string }).media_url ?? "").trim()
        : "";
  if (kind === "image" || kind === "video" || mediaUrl) {
    return response;
  }
  const postContent =
    typeof (response.post as { content?: unknown })?.content === "string"
      ? ((response.post as { content: string }).content ?? "").trim()
      : "";
  const shouldChat = replyMode === "chat" || isExplanatoryCaption(postContent);
  if (!shouldChat) return response;
  const assistantAttachments = buildAssistantAttachments(response.post ?? null);
  const message =
    postContent.length > 0
      ? postContent
      : typeof response.message === "string" && response.message.trim().length
        ? response.message.trim()
        : "Here is what I found.";
  return {
    action: "chat_reply",
    message,
    ...(assistantAttachments && assistantAttachments.length
      ? { replyAttachments: assistantAttachments }
      : {}),
    threadId: response.threadId,
    history: response.history,
    context: response.context,
  };
}

export async function POST(req: Request) {
  const startedAt = Date.now();
  const ownerId = await ensureUserFromRequest(req, {}, { allowGuests: false });
  if (!ownerId) {
    return returnError(401, "auth_required", "Sign in to use Capsule AI.");
  }

  if (!hasOpenAIApiKey()) {
    return returnError(
      503,
      "ai_unavailable",
      "Capsule AI is not configured right now.",
    );
  }

  const parsed = await parseJsonBody(req, requestSchema);
  if (!parsed.success) {
    return parsed.response;
  }

  const rateLimitResult = await checkRateLimit(PROMPT_RATE_LIMIT, ownerId);
  if (rateLimitResult && !rateLimitResult.success) {
    const retryAfterSeconds = computeRetryAfterSeconds(rateLimitResult.reset);
    return returnError(
      429,
      "rate_limited",
      "You're asking too quickly. Give me a moment before drafting another idea.",
      retryAfterSeconds === null ? undefined : { retryAfterSeconds },
    );
  }

  const { message } = parsed.data;
  const rawOptions = (parsed.data.options as Record<string, unknown> | undefined) ?? {};
  const incomingPost =
    (parsed.data.post as Record<string, unknown> | null | undefined) ?? null;
  const capsuleId = parsed.data.capsuleId ?? null;

  const streamOption =
    typeof rawOptions["stream"] === "boolean"
      ? (rawOptions["stream"] as boolean)
      : undefined;
  if ("stream" in rawOptions) {
    delete (rawOptions as Record<string, unknown>).stream;
  }

  const attachments = sanitizeAttachments(parsed.data.attachments);
  const previousHistory = sanitizeComposerChatHistory(parsed.data.history ?? []);
  const threadId = coerceThreadId(parsed.data.threadId);
  const contextStart = Date.now();
  const streaming = parsed.data.stream === true || streamOption === true;

  const recallIntent = detectRecallIntent({
    message,
    history: previousHistory,
    rawOptions,
    attachments,
    capsuleId,
  });
  const contextEnabled =
    (typeof parsed.data.useContext === "boolean" ? parsed.data.useContext : true) && recallIntent;

  const shouldBuildAttachmentContext = contextEnabled && attachments.length > 0;
  const attachmentContexts = shouldBuildAttachmentContext
    ? await buildAttachmentContext(attachments)
    : [];
  const formattedAttachmentContext = shouldBuildAttachmentContext
    ? formatAttachmentContextForPrompt(attachmentContexts)
    : null;

  const lowerMessage = message.toLowerCase();
  const preferRaw =
    typeof rawOptions?.["prefer"] === "string"
      ? String(rawOptions["prefer"]).toLowerCase()
      : null;
  const preferPoll =
    preferRaw === "poll" ||
    /\b(poll|survey|vote|choices?)\b/.test(lowerMessage);

  const pollHint =
    typeof rawOptions?.["seed"] === "object" && rawOptions?.["seed"] !== null
      ? (rawOptions["seed"] as Record<string, unknown>)
      : {};

  const sanitizedOptions =
    rawOptions && typeof rawOptions === "object" ? { ...rawOptions } : {};
  const rawReplyMode =
    typeof sanitizedOptions.replyMode === "string"
      ? sanitizedOptions.replyMode.toLowerCase()
      : null;
  const replyMode = rawReplyMode === "chat" || rawReplyMode === "draft" ? rawReplyMode : null;

  let composeOptions: ComposeDraftOptions = {
    history: previousHistory,
    attachments,
    capsuleId,
    rawOptions: sanitizedOptions,
    ownerId,
  };

  const requestOrigin = deriveRequestOrigin(req);

  let responseContext: {
    enabled: boolean;
    query?: string | null;
    memoryIds?: string[];
    snippets?: Array<Record<string, unknown>>;
    userCard?: string | null;
    attachments?: Array<Record<string, unknown>>;
  } = { enabled: contextEnabled };

  const attachmentContextPrompt = formattedAttachmentContext?.prompt ?? null;
  const attachmentContextRecords: ContextRecord[] =
    formattedAttachmentContext?.records.map((entry) => ({
      id: `attachment:${entry.id}`,
      title: entry.name ?? null,
      snippet: entry.snippet,
      source: entry.source ?? "attachment",
      url: null,
      kind: entry.mimeType || "attachment",
      tags: ["attachment"],
      highlightHtml: null,
    })) ?? [];

  const contextPrompts: string[] = [];
  let resolvedContextRecords: ContextRecord[] = [...attachmentContextRecords];
  let contextMetadata: Record<string, unknown> | null =
    attachmentContexts.length > 0
      ? { attachmentIds: attachmentContexts.map((entry) => entry.id) }
      : null;

  if (attachmentContextPrompt) {
    contextPrompts.push(attachmentContextPrompt);
  }

  if (contextEnabled) {
    const capsuleHistoryPromise: Promise<ChatMemorySnippet[]> =
      contextEnabled && capsuleId
        ? getCapsuleHistorySnippets({ capsuleId, viewerId: ownerId, query: message })
        : Promise.resolve<ChatMemorySnippet[]>([]);

    const [contextResult, userCardResult, capsuleHistorySnippets] = await Promise.all([
      getChatContext({
        ownerId,
        message,
        history: previousHistory,
        origin: requestOrigin ?? null,
        capsuleId,
      }),
      getUserCardCached(ownerId),
      capsuleHistoryPromise,
    ]);

    const memorySnippets = contextResult?.snippets ?? [];
    const combinedSnippets = trimContextSnippets(
      [...memorySnippets, ...capsuleHistorySnippets],
      CONTEXT_SNIPPET_LIMIT,
      CONTEXT_CHAR_BUDGET,
    );
    const combinedContext =
      combinedSnippets.length > 0
        ? {
            query: contextResult?.query ?? message,
            snippets: combinedSnippets,
            usedIds: combinedSnippets.map((snippet) => snippet.id),
          }
        : contextResult;

    const contextPrompt = formatContextForPrompt(combinedContext);
    const contextForMetadata =
      combinedSnippets.length > 0
        ? {
            query: contextResult?.query ?? message,
            snippets: combinedSnippets,
            usedIds: combinedSnippets.map((snippet) => snippet.id),
          }
        : contextResult;
    contextMetadata = {
      ...(contextMetadata ?? {}),
      ...(buildContextMetadata(contextForMetadata) ?? {}),
    };
    if (capsuleHistorySnippets.length) {
      contextMetadata = {
        ...(contextMetadata ?? {}),
        capsuleHistorySections: capsuleHistorySnippets.map((snippet) => snippet.id),
      };
    }

    const memoryContextRecords: ContextRecord[] = combinedSnippets.length
      ? combinedSnippets.map((snippet) => ({
          id: snippet.id,
          title: snippet.title ?? null,
          snippet: snippet.snippet,
          source: snippet.source ?? null,
          url: snippet.url ?? null,
          kind: snippet.kind ?? null,
          tags: snippet.tags,
          highlightHtml: snippet.highlightHtml ?? null,
        }))
      : [];

    resolvedContextRecords = memoryContextRecords.length
      ? [...resolvedContextRecords, ...memoryContextRecords]
      : resolvedContextRecords;
    if (contextPrompt) {
      contextPrompts.push(contextPrompt);
    }
    composeOptions = {
      ...composeOptions,
      ...(userCardResult?.text ? { userCard: userCardResult.text } : {}),
    };

    responseContext = {
      enabled: true,
      query: contextResult?.query ?? null,
      memoryIds: combinedSnippets.map((snippet) => snippet.id),
      snippets: resolvedContextRecords.map((snippet) => ({
        id: snippet.id,
        title: snippet.title,
        snippet: snippet.snippet,
        source: snippet.source ?? null,
        kind: snippet.kind ?? null,
        url: snippet.url ?? null,
        highlightHtml: snippet.highlightHtml ?? null,
        tags: snippet.tags,
      })),
      userCard: userCardResult?.text ?? null,
      attachments: attachmentContextRecords.map((record) => ({
        id: record.id,
        title: record.title,
        snippet: record.snippet,
        source: record.source ?? null,
        kind: record.kind ?? null,
        url: record.url ?? null,
        highlightHtml: record.highlightHtml ?? null,
        tags: record.tags,
      })),
    };

    console.info("composer_context_ready", {
      ownerId,
      queryLength: contextResult?.query?.length ?? 0,
      memoryCount: resolvedContextRecords.length,
      contextMs: Date.now() - contextStart,
    });
  } else {
    const userCardResult = await getUserCardCached(ownerId);
    responseContext = {
      enabled: false,
      attachments: [],
      userCard: userCardResult?.text ?? null,
    };
    composeOptions = {
      ...composeOptions,
      ...(userCardResult?.text ? { userCard: userCardResult.text } : {}),
    };
  }

  const mergedContextPrompt = contextPrompts.filter(Boolean).join("\n\n");
  if (mergedContextPrompt.length || resolvedContextRecords.length || contextMetadata) {
    composeOptions = {
      ...composeOptions,
      ...(mergedContextPrompt.length ? { contextPrompt: mergedContextPrompt } : {}),
      ...(resolvedContextRecords.length ? { contextRecords: resolvedContextRecords } : {}),
      ...(contextMetadata ? { contextMetadata } : {}),
    };
  }

  if (streaming) {
    const stream = new ReadableStream({
      start: async (controller) => {
        const send = (data: Record<string, unknown>) => controller.enqueue(sseChunk(data));
        const sendStatus = (message: string) => send({ event: "status", message });
        sendStatus("Working on your request...");
        sendStatus("Resolving context...");

        const handleToolEvent = (event: ComposerToolEvent) => {
          if (event.type === "status" && event.message) {
            sendStatus(event.message);
            return;
          }
          if (event.type === "tool_call") {
            sendStatus(`Running ${event.name}...`);
            return;
          }
          if (event.type === "tool_result") {
            sendStatus(`${event.name} ready.`);
          }
        };

        try {
          const modelStart = Date.now();
          const userEntry: ComposerChatMessage = {
            id: safeRandomUUID(),
            role: "user",
            content: message,
            createdAt: new Date().toISOString(),
            attachments: attachments.length ? attachments : null,
          };

          let payload: PromptResponse;

          if (preferPoll) {
            const pollDraft = await createPollDraft(message, pollHint, composeOptions);
            payload = promptResponseSchema.parse({
              action: "draft_post",
              message: pollDraft.message,
              post: {
                kind: "poll",
                content: "",
                poll: pollDraft.poll,
                source: "ai-prompter",
              },
            });
          } else {
            const toolRun = await runComposerToolSession(
              { userText: message, incomingPost, context: composeOptions },
              { onEvent: handleToolEvent },
            );
            payload = toolRun.response;
          }

          const validated: PromptResponse = promptResponseSchema.parse(payload);
          const adjusted = coerceDraftToChatReply(validated, replyMode);
          let assistantEntry: ComposerChatMessage;
          let artifactEntry: ComposerChatMessage | null = null;
          let streamingAssistantMessage: string;
          let historyBase = [...previousHistory, userEntry];

          if (adjusted.action === "chat_reply") {
            const chatMessage = adjusted.message.trim();
            const replyAttachments = normalizeChatReplyAttachments(adjusted.replyAttachments);
            assistantEntry = {
              id: safeRandomUUID(),
              role: "assistant",
              content: chatMessage,
              createdAt: new Date().toISOString(),
              attachments: replyAttachments,
            };
            streamingAssistantMessage = chatMessage;
            historyBase = [...historyBase, assistantEntry];
          } else {
            const postContent =
              typeof (adjusted.post as { content?: unknown })?.content === "string"
                ? ((adjusted.post as { content: string }).content ?? "").trim()
                : "";
            const baseAssistantMessage =
              typeof adjusted.message === "string" && adjusted.message.trim().length
                ? adjusted.message.trim()
                : "I've drafted a first pass.";
            const assistantAttachments = buildAssistantAttachments(adjusted.post ?? null);
            artifactEntry =
              postContent || (assistantAttachments && assistantAttachments.length)
                ? {
                    id: safeRandomUUID(),
                    role: "assistant",
                    content: postContent,
                    createdAt: new Date().toISOString(),
                    attachments:
                      assistantAttachments && assistantAttachments.length ? assistantAttachments : null,
                  }
                : null;
            assistantEntry = {
              id: safeRandomUUID(),
              role: "assistant",
              content: baseAssistantMessage,
              createdAt: new Date().toISOString(),
              attachments: null,
            };
            streamingAssistantMessage = postContent
              ? `${postContent}\n\n${baseAssistantMessage}`
              : baseAssistantMessage;
            if (artifactEntry) {
              historyBase = [...historyBase, artifactEntry];
            }
            historyBase = [...historyBase, assistantEntry];
          }

          const historyOut = historyBase.slice(-HISTORY_RETURN_LIMIT);

          storeConversationSnapshot(ownerId, threadId, {
            threadId,
            prompt: userEntry.content,
            message: assistantEntry.content,
            history: historyOut,
            draft: validated.action === "draft_post" ? validated.post ?? null : null,
            rawPost: validated.action === "draft_post" ? validated.post ?? null : null,
            updatedAt: assistantEntry.createdAt,
          }).catch((error) => {
            console.warn("composer conversation store failed", error);
          });

          const sentChunks = chunkText(streamingAssistantMessage);
          let assembled = "";
          for (const part of sentChunks) {
            assembled = assembled ? `${assembled} ${part}` : part;
            send({ event: "partial", content: assembled });
            await sleep(150);
          }

          const finalResponse = promptResponseSchema.parse({
            ...adjusted,
            threadId,
            history: historyOut,
            context: responseContext,
          });

          console.info("composer_prompt_latency", {
            ownerId,
            contextMs: contextStart ? Date.now() - contextStart : null,
            modelMs: Date.now() - modelStart,
            totalMs: Date.now() - startedAt,
            attachments: attachments.length,
            stream: true,
          });

          send({ event: "done", payload: finalResponse });
          controller.close();
        } catch (error) {
          console.error("composer prompt failed (stream)", error);
          send({
            event: "error",
            error: "Capsule AI ran into an error drafting that.",
          });
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  }

  try {
    const modelStart = Date.now();
    let payload: PromptResponse;

    if (preferPoll) {
      const pollDraft = await createPollDraft(message, pollHint, composeOptions);
      payload = promptResponseSchema.parse({
        action: "draft_post",
        message: pollDraft.message,
        post: {
          kind: "poll",
          content: "",
          poll: pollDraft.poll,
          source: "ai-prompter",
        },
      });
    } else {
      const toolRun = await runComposerToolSession({
        userText: message,
        incomingPost,
        context: composeOptions,
      });
      payload = toolRun.response;
    }

    const userEntry: ComposerChatMessage = {
      id: safeRandomUUID(),
      role: "user",
      content: message,
      createdAt: new Date().toISOString(),
      attachments: attachments.length ? attachments : null,
    };

    const validated: PromptResponse = promptResponseSchema.parse(payload);
    const adjusted = coerceDraftToChatReply(validated, replyMode);
    let assistantEntry: ComposerChatMessage;
    let artifactEntry: ComposerChatMessage | null = null;
    let nextHistory = [...previousHistory, userEntry];

    if (adjusted.action === "chat_reply") {
      const replyAttachments = normalizeChatReplyAttachments(adjusted.replyAttachments);
      assistantEntry = {
        id: safeRandomUUID(),
        role: "assistant",
        content: adjusted.message.trim(),
        createdAt: new Date().toISOString(),
        attachments: replyAttachments,
      };
      nextHistory = [...nextHistory, assistantEntry];
    } else {
      const postContent =
        typeof (adjusted.post as { content?: unknown })?.content === "string"
          ? ((adjusted.post as { content: string }).content ?? "").trim()
          : "";
      const baseAssistantMessage =
        typeof adjusted.message === "string" && adjusted.message.trim().length
          ? adjusted.message.trim()
          : "I've drafted a first pass.";
      const assistantAttachments = buildAssistantAttachments(adjusted.post ?? null);
      if (postContent || (assistantAttachments && assistantAttachments.length)) {
        artifactEntry = {
          id: safeRandomUUID(),
          role: "assistant",
          content: postContent,
          createdAt: new Date().toISOString(),
          attachments:
            assistantAttachments && assistantAttachments.length ? assistantAttachments : null,
        };
        nextHistory = [...nextHistory, artifactEntry];
      }
      assistantEntry = {
        id: safeRandomUUID(),
        role: "assistant",
        content: baseAssistantMessage,
        createdAt: new Date().toISOString(),
        attachments: null,
      };
      nextHistory = [...nextHistory, assistantEntry];
    }

    const historyOut = nextHistory.slice(-HISTORY_RETURN_LIMIT);

    storeConversationSnapshot(ownerId, threadId, {
      threadId,
      prompt: userEntry.content,
      message: assistantEntry.content,
      history: historyOut,
      draft: validated.action === "draft_post" ? validated.post ?? null : null,
      rawPost: validated.action === "draft_post" ? validated.post ?? null : null,
      updatedAt: assistantEntry.createdAt,
    }).catch((error) => {
      console.warn("composer conversation store failed", error);
    });

    const finalResponse = promptResponseSchema.parse({
      ...adjusted,
      threadId,
      history: historyOut,
      context: responseContext,
    });

    console.info("composer_prompt_latency", {
      ownerId,
      contextMs: contextStart ? Date.now() - contextStart : null,
      modelMs: Date.now() - modelStart,
      totalMs: Date.now() - startedAt,
      attachments: attachments.length,
    });

    return validatedJson(promptResponseSchema, finalResponse);
  } catch (error) {
    console.error("composer prompt failed", error);
    return returnError(
      502,
      "ai_error",
      "Capsule AI ran into an error drafting that.",
    );
  }
}

export const runtime = "nodejs";
