import { z } from "zod";

import { hasOpenAIApiKey } from "@/adapters/ai/openai/server";
import { safeRandomUUID } from "@/lib/random";
import { type ComposeDraftOptions } from "@/lib/ai/prompter";
import {
  sanitizeComposerChatAttachment,
  sanitizeComposerChatHistory,
  type ComposerChatAttachment,
  type ComposerChatMessage,
} from "@/lib/composer/chat-types";
import { promptResponseSchema, type PromptResponse, type ComposerAttachment } from "@/shared/schemas/ai";
import { ensureUserFromRequest } from "@/lib/auth/payload";
import { computeComposerCredits } from "@/lib/billing/usage";
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
  checkRateLimits,
  retryAfterSeconds as computeRetryAfterSeconds,
  type RateLimitDefinition,
} from "@/server/rate-limit";
import { resolveClientIp } from "@/server/http/ip";
import { deriveRequestOrigin } from "@/lib/url";
import {
  getChatContext,
  formatContextForPrompt,
  buildContextMetadata,
  getCapsuleHistorySnippets,
} from "@/server/chat/retrieval";
import type { ChatMemorySnippet } from "@/server/chat/retrieval";
import { getUserCapsules } from "@/server/capsules/service";
import { getUserCardCached } from "@/server/chat/user-card";
import {
  chargeUsage,
  ensureFeatureAccess,
  resolveWalletContext,
  EntitlementError,
} from "@/server/billing/entitlements";
import { shouldEnableMemoryContext } from "@/server/chat/context-gating";

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

function normalizeSearchText(value: string | null | undefined): string | null {
  if (!value || typeof value !== "string") return null;
  const normalized = value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  return normalized.length ? normalized : null;
}

async function inferCapsuleIdFromMessage(params: {
  ownerId: string;
  capsuleId: string | null;
  message: string;
  history: ComposerChatMessage[] | undefined;
}): Promise<string | null> {
  if (params.capsuleId) return params.capsuleId.trim();
  const haystack = normalizeSearchText(
    [params.message, collectRecentUserText(params.history)].filter(Boolean).join(" "),
  );
  if (!haystack) return null;
  try {
    const capsules = await getUserCapsules(params.ownerId);
    const match = capsules.find((capsule) => {
      const name = normalizeSearchText(capsule.name);
      const slug = normalizeSearchText(capsule.slug);
      return (name && haystack.includes(name)) || (slug && haystack.includes(slug));
    });
    return match?.id ?? null;
  } catch (error) {
    console.warn("capsule inference failed", { ownerId: params.ownerId, error });
    return null;
  }
}

function buildAssistantAttachments(
  post: Record<string, unknown> | null | undefined,
): ComposerChatAttachment[] | null {
  if (!post) return null;
  if (typeof (post as { poll?: unknown }).poll === "object" && (post as { poll?: unknown }).poll !== null) {
    return null;
  }
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

const PROMPT_IP_RATE_LIMIT: RateLimitDefinition = {
  name: "ai.prompt.ip",
  limit: 120,
  window: "5 m",
};

const PROMPT_GLOBAL_RATE_LIMIT: RateLimitDefinition = {
  name: "ai.prompt.global",
  limit: 400,
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
  const hasPoll =
    typeof (response.post as { poll?: unknown })?.poll === "object" &&
    (response.post as { poll?: unknown }).poll !== null;
  if (hasPoll) return response;
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
    return returnError(401, "auth_required", "Sign in to use your assistant.");
  }

  if (!hasOpenAIApiKey()) {
    return returnError(503, "ai_unavailable", "The assistant is not configured right now.");
  }

  const parsed = await parseJsonBody(req, requestSchema);
  if (!parsed.success) {
    return parsed.response;
  }

  const clientIp = resolveClientIp(req);
  const rateLimitResult = await checkRateLimits([
    { definition: PROMPT_RATE_LIMIT, identifier: ownerId },
    { definition: PROMPT_IP_RATE_LIMIT, identifier: clientIp ? `ip:${clientIp}` : null },
    { definition: PROMPT_GLOBAL_RATE_LIMIT, identifier: "global:ai.prompt" },
  ]);
  if (rateLimitResult && !rateLimitResult.success) {
    const retryAfterSeconds = computeRetryAfterSeconds(rateLimitResult.reset);
    return returnError(
      429,
      "rate_limited",
      "You're asking too quickly. Give me a moment before drafting another idea.",
      retryAfterSeconds === null ? undefined : { retryAfterSeconds },
    );
  }

  let walletContext = null;
  try {
    walletContext = await resolveWalletContext({
      ownerType: "user",
      ownerId,
      supabaseUserId: ownerId,
      req,
      ensureDevCredits: true,
    });
    ensureFeatureAccess({
      balance: walletContext.balance,
      bypass: walletContext.bypass,
      requiredTier: "starter",
      featureName: "AI prompt drafting",
    });
  } catch (error) {
    if (error instanceof EntitlementError) {
      return returnError(error.status, error.code, error.message, error.details);
    }
    console.error("billing.ai_prompt.failed", error);
    return returnError(500, "billing_error", "Failed to verify allowance");
  }

  const { message } = parsed.data;
  const rawOptions = (parsed.data.options as Record<string, unknown> | undefined) ?? {};
  const incomingPost =
    (parsed.data.post as Record<string, unknown> | null | undefined) ?? null;
  let capsuleId = parsed.data.capsuleId ?? null;

  const streamOption =
    typeof rawOptions["stream"] === "boolean"
      ? (rawOptions["stream"] as boolean)
      : undefined;
  if ("stream" in rawOptions) {
    delete (rawOptions as Record<string, unknown>).stream;
  }

  const attachments = sanitizeAttachments(parsed.data.attachments);
  const previousHistory = sanitizeComposerChatHistory(parsed.data.history ?? []);

  // Make prior image attachments available to tools like edit_image so users can reference
  // “that photo from earlier” without reattaching.
  const historyImageAttachments = previousHistory
    .flatMap((entry) => entry.attachments ?? [])
    .filter((attachment): attachment is ComposerChatAttachment => {
      if (!attachment?.id || !attachment.url) return false;
      const mime = (attachment.mimeType ?? "").toLowerCase();
      return mime.startsWith("image/");
    });
  const mergedAttachmentsMap = new Map<string, ComposerChatAttachment>();
  [...attachments, ...historyImageAttachments].forEach((attachment) => {
    if (!attachment?.id) return;
    if (!mergedAttachmentsMap.has(attachment.id)) {
      mergedAttachmentsMap.set(attachment.id, attachment);
    }
  });
  const mergedAttachments = Array.from(mergedAttachmentsMap.values());
  const threadId = coerceThreadId(parsed.data.threadId);
  const contextStart = Date.now();
  const streaming = parsed.data.stream === true || streamOption === true;
  if (!capsuleId) {
    capsuleId = await inferCapsuleIdFromMessage({
      ownerId,
      capsuleId,
      message,
      history: previousHistory,
    });
  }

  const contextEnabled =
    typeof parsed.data.useContext === "boolean" ? parsed.data.useContext : true;
  const memoryContextEnabled =
    contextEnabled &&
    shouldEnableMemoryContext({
      message,
      history: previousHistory,
    });

  const shouldBuildAttachmentContext = contextEnabled && mergedAttachments.length > 0;
  const attachmentContexts = shouldBuildAttachmentContext
    ? await buildAttachmentContext(mergedAttachments)
    : [];
  const formattedAttachmentContext = shouldBuildAttachmentContext
    ? formatAttachmentContextForPrompt(attachmentContexts)
    : null;

  const sanitizedOptions =
    rawOptions && typeof rawOptions === "object" ? { ...rawOptions } : {};
  const rawReplyMode =
    typeof sanitizedOptions.replyMode === "string"
      ? sanitizedOptions.replyMode.toLowerCase()
      : null;
  const replyMode = rawReplyMode === "chat" || rawReplyMode === "draft" ? rawReplyMode : null;

  let composeOptions: ComposeDraftOptions = {
    history: previousHistory,
    attachments: mergedAttachments,
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
      memoryContextEnabled && capsuleId
        ? getCapsuleHistorySnippets({ capsuleId, viewerId: ownerId, query: message })
        : Promise.resolve<ChatMemorySnippet[]>([]);

    const chatContextPromise = memoryContextEnabled
      ? getChatContext({
          ownerId,
          message,
          history: previousHistory,
          origin: requestOrigin ?? null,
          capsuleId,
        })
      : Promise.resolve(null);

    const [contextResult, userCardResult, capsuleHistorySnippets] = await Promise.all([
      chatContextPromise,
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
            const resultStatus =
              typeof (event.result as { status?: unknown })?.status === "string"
                ? String((event.result as { status: string }).status).toLowerCase()
                : null;
            if (resultStatus === "error") {
              const resultMessage =
                typeof (event.result as { message?: unknown })?.message === "string"
                  ? String((event.result as { message: string }).message).trim()
                  : null;
              sendStatus(resultMessage?.length ? resultMessage : `${event.name} failed.`);
              return;
            }
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
            attachments: mergedAttachments.length ? mergedAttachments : null,
          };

          const toolRun = await runComposerToolSession(
            { userText: message, incomingPost, context: composeOptions },
            { onEvent: handleToolEvent },
          );
          const payload = toolRun.response;

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

          try {
            const computeCost = computeComposerCredits(toolRun.usage);
            if (walletContext && computeCost > 0 && !walletContext.bypass) {
              await chargeUsage({
                wallet: walletContext.wallet,
                balance: walletContext.balance,
                metric: "compute",
                amount: computeCost,
                reason: "ai.prompt",
                bypass: walletContext.bypass,
              });
            }
          } catch (billingError) {
            if (billingError instanceof EntitlementError) {
              send({
                event: "error",
                error: billingError.message,
                details: billingError.details,
              });
              controller.close();
              return;
            }
            console.error("composer_prompt.billing_failed", billingError);
            send({
              event: "error",
              error: "Billing failed for this request.",
            });
            controller.close();
            return;
          }

          console.info("composer_prompt_latency", {
            ownerId,
            contextMs: contextStart ? Date.now() - contextStart : null,
            modelMs: Date.now() - modelStart,
            totalMs: Date.now() - startedAt,
            attachments: mergedAttachments.length,
            stream: true,
          });

          send({ event: "done", payload: finalResponse });
          controller.close();
        } catch (error) {
          console.error("composer prompt failed (stream)", error);
          send({
            event: "error",
            error: "Your assistant ran into an error drafting that.",
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
    const toolRun = await runComposerToolSession({
      userText: message,
      incomingPost,
      context: composeOptions,
    });
    const payload: PromptResponse = toolRun.response;

    const userEntry: ComposerChatMessage = {
      id: safeRandomUUID(),
      role: "user",
      content: message,
      createdAt: new Date().toISOString(),
      attachments: mergedAttachments.length ? mergedAttachments : null,
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

    try {
      const computeCost = computeComposerCredits(toolRun.usage);
      if (walletContext && computeCost > 0 && !walletContext.bypass) {
        await chargeUsage({
          wallet: walletContext.wallet,
          balance: walletContext.balance,
          metric: "compute",
          amount: computeCost,
          reason: "ai.prompt",
          bypass: walletContext.bypass,
        });
      }
    } catch (error) {
      if (error instanceof EntitlementError) {
        return returnError(error.status, error.code, error.message, error.details);
      }
      console.error("composer_prompt.billing_failed", error);
      return returnError(500, "billing_error", "Failed to record AI usage");
    }

          console.info("composer_prompt_latency", {
            ownerId,
            contextMs: contextStart ? Date.now() - contextStart : null,
            modelMs: Date.now() - modelStart,
            totalMs: Date.now() - startedAt,
            attachments: mergedAttachments.length,
          });

    return validatedJson(promptResponseSchema, finalResponse);
  } catch (error) {
    console.error("composer prompt failed", error);
    return returnError(502, "ai_error", "Your assistant ran into an error drafting that.");
  }
}

export const runtime = "nodejs";
