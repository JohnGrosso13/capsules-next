import { z } from "zod";

import { ensureUserFromRequest } from "@/lib/auth/payload";
import {
  sanitizeComposerChatAttachment,
  sanitizeComposerChatHistory,
  type ComposerChatAttachment,
  type ComposerChatMessage,
} from "@/lib/composer/chat-types";
import { safeRandomUUID } from "@/lib/random";
import { promptResponseSchema } from "@/shared/schemas/ai";
import { parseJsonBody, returnError, validatedJson } from "@/server/validation/http";
import { runCustomizerToolSession, type CustomizerComposeContext } from "@/server/customizer/run";
import { deriveRequestOrigin } from "@/lib/url";
import { serverEnv } from "@/lib/env/server";
import {
  buildAttachmentContext,
  formatAttachmentContextForPrompt,
} from "@/server/composer/attachment-context";
import {
  buildContextMetadata,
  formatContextForPrompt,
  getCapsuleHistorySnippets,
  getChatContext,
  type ChatMemorySnippet,
} from "@/server/chat/retrieval";
import { getUserCardCached } from "@/server/chat/user-card";
import { shouldEnableMemoryContext } from "@/server/chat/context-gating";
import {
  storeCustomizerConversationSnapshot,
  type CustomizerConversationSnapshot,
} from "@/server/customizer/conversation-store";
import {
  chargeUsage,
  ensureFeatureAccess,
  resolveWalletContext,
  EntitlementError,
} from "@/server/billing/entitlements";
import { computeTextCreditsFromTokens, estimateTokensFromText } from "@/lib/billing/usage";

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
  capsuleId: z.string().uuid().optional().nullable(),
  useContext: z.boolean().optional(),
  stream: z.boolean().optional(),
  threadId: z.string().optional(),
});

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

function buildComposeContext(options: Record<string, unknown> | undefined): CustomizerComposeContext {
  const raw = options?.customizer;
  if (!raw || typeof raw !== "object") {
    throw new Error("customizer options are required.");
  }
  const mode = (raw as { mode?: unknown }).mode;
  if (mode !== "banner" && mode !== "storeBanner" && mode !== "tile" && mode !== "logo" && mode !== "avatar") {
    throw new Error("customizer mode is required.");
  }
  const value = raw as Record<string, unknown>;
  const readString = (key: string): string | null => {
    const entry = value[key];
    if (typeof entry === "string" && entry.trim().length) {
      return entry;
    }
    return null;
  };
  const readNumber = (key: string): number | null => {
    const entry = value[key];
    if (typeof entry === "number" && Number.isFinite(entry)) {
      return entry;
    }
    return null;
  };
  return {
    mode,
    capsuleName: readString("capsuleName"),
    displayName: readString("displayName"),
    personaId: readString("personaId"),
    stylePreset: readString("stylePreset"),
    seed: readNumber("seed"),
    guidance: readNumber("guidance"),
    variantId: readString("variantId"),
    currentAssetUrl: readString("currentAssetUrl"),
    currentAssetData: readString("currentAssetData"),
    currentMaskData: readString("currentMaskData"),
  };
}

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

const CONTEXT_SNIPPET_LIMIT = 6;
const CONTEXT_CHAR_BUDGET = 4000;
const HISTORY_RETURN_LIMIT = 24;

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

export async function POST(req: Request) {
  const ownerId = await ensureUserFromRequest(req, {}, { allowGuests: false });
  if (!ownerId) {
    return returnError(401, "auth_required", "Sign in to customize your capsule.");
  }

  const parsed = await parseJsonBody(req, requestSchema);
  if (!parsed.success) {
    return parsed.response;
  }

  let walletContext: Awaited<ReturnType<typeof resolveWalletContext>> | null = null;
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
      featureName: "AI customizer",
    });
  } catch (billingError) {
    if (billingError instanceof EntitlementError) {
      return returnError(billingError.status, billingError.code, billingError.message, billingError.details);
    }
    console.error("billing.customize.init_failed", billingError);
    return returnError(500, "billing_error", "Failed to verify allowance for customization.");
  }

  const { message, options, post, history, attachments, capsuleId, stream } = parsed.data;
  const providedThreadId =
    typeof parsed.data.threadId === "string" && parsed.data.threadId.trim().length
      ? parsed.data.threadId.trim()
      : null;
  const threadId = providedThreadId ?? safeRandomUUID();

  const rawReplyMode =
    options && typeof options === "object" && typeof (options as Record<string, unknown>).replyMode === "string"
      ? String((options as Record<string, unknown>).replyMode).toLowerCase()
      : null;
  const replyMode = rawReplyMode === "chat" || rawReplyMode === "draft" ? rawReplyMode : null;

  let composeContext: CustomizerComposeContext;
  try {
    composeContext = buildComposeContext(
      (options && typeof options === "object" ? (options as Record<string, unknown>) : undefined) ??
        {},
    );
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Invalid customizer options.";
    return returnError(400, "invalid_request", detail);
  }

  const requestOrigin = deriveRequestOrigin(req) ?? serverEnv.SITE_URL;
  const historySanitized = history ? sanitizeComposerChatHistory(history) : [];
  const attachmentList = sanitizeAttachments(attachments);
  const contextEnabled = typeof parsed.data.useContext === "boolean" ? parsed.data.useContext : true;
  const memoryContextEnabled =
    contextEnabled &&
    shouldEnableMemoryContext({
      message,
      history: historySanitized,
    });

  const contextPrompts: string[] = [];
  let resolvedContextRecords: ContextRecord[] = [];
  let contextMetadata: Record<string, unknown> | null = null;
  let responseContext: {
    enabled: boolean;
    query?: string | null;
    memoryIds?: string[];
    snippets?: ContextRecord[];
    userCard?: string | null;
    attachments?: ContextRecord[];
  } = { enabled: contextEnabled };

  const shouldBuildAttachmentContext = contextEnabled && attachmentList.length > 0;
  const attachmentContexts = shouldBuildAttachmentContext
    ? await buildAttachmentContext(attachmentList)
    : [];
  const formattedAttachmentContext = shouldBuildAttachmentContext
    ? formatAttachmentContextForPrompt(attachmentContexts)
    : null;
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

  if (attachmentContextPrompt) {
    contextPrompts.push(attachmentContextPrompt);
  }

  const requestContextRecords: ContextRecord[] = [...attachmentContextRecords];

  if (contextEnabled) {
    const capsuleHistoryPromise: Promise<ChatMemorySnippet[]> =
      memoryContextEnabled && capsuleId
        ? getCapsuleHistorySnippets({ capsuleId, viewerId: ownerId, query: message })
        : Promise.resolve<ChatMemorySnippet[]>([]);

    const chatContextPromise = memoryContextEnabled
      ? getChatContext({
          ownerId,
          message,
          history: historySanitized,
          origin: requestOrigin ?? null,
          capsuleId: capsuleId ?? null,
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
          tags: snippet.tags ?? [],
          highlightHtml: snippet.highlightHtml ?? null,
        }))
      : [];

    resolvedContextRecords = memoryContextRecords.length
      ? [...requestContextRecords, ...memoryContextRecords]
      : requestContextRecords;
    if (contextPrompt) {
      contextPrompts.push(contextPrompt);
    }

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
      attachments: attachmentContextRecords,
    };
  } else {
    const userCardResult = await getUserCardCached(ownerId);
    responseContext = {
      enabled: false,
      attachments: attachmentContextRecords,
      userCard: userCardResult?.text ?? null,
    };
  }

  const mergedContextPrompt = contextPrompts.filter(Boolean).join("\n\n");
  const contextOptions =
    mergedContextPrompt.length || resolvedContextRecords.length || contextMetadata
      ? {
          userCard: responseContext.userCard ?? null,
          contextPrompt: mergedContextPrompt.length ? mergedContextPrompt : null,
          contextRecords: resolvedContextRecords,
          contextMetadata,
        }
      : {
          userCard: responseContext.userCard ?? null,
          contextPrompt: null,
          contextRecords: resolvedContextRecords,
          contextMetadata,
        };

  if (stream) {
    const encoder = new TextEncoder();
    const streamBody = new ReadableStream({
      start: async (controller) => {
        const send = (payload: Record<string, unknown>) => {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
        };
        const timestamp = new Date().toISOString();
        const userEntry: ComposerChatMessage = {
          id: safeRandomUUID(),
          role: "user",
          content: message,
          createdAt: timestamp,
          attachments: attachmentList.length ? attachmentList : null,
        };
        try {
          const run = await runCustomizerToolSession({
            ownerId,
            capsuleId: capsuleId ?? null,
            userText: message,
            history: historySanitized,
            attachments: attachmentList,
            incomingDraft: replyMode === "chat" ? null : post ?? null,
            context: composeContext,
            requestOrigin,
            replyMode,
            contextOptions,
            contextEnabled,
            callbacks: {
              onEvent: (event) => {
                send({ event: event.type, ...event });
              },
            },
          });
          const assistantMessage =
            typeof run.response.message === "string" && run.response.message.trim().length
              ? run.response.message.trim()
              : "Updated your capsule visual.";
          const assistantEntry: ComposerChatMessage = {
            id: safeRandomUUID(),
            role: "assistant" as const,
            content: assistantMessage,
            createdAt: new Date().toISOString(),
            attachments: null,
          };
          const historyOut: ComposerChatMessage[] = [
            ...historySanitized,
            userEntry,
            assistantEntry,
          ].slice(-HISTORY_RETURN_LIMIT);
          const responseWithThread = {
            ...run.response,
            threadId: run.response.threadId ?? threadId,
            history: run.response.history ?? historyOut,
          };

          const snapshot: CustomizerConversationSnapshot = {
            threadId: responseWithThread.threadId,
            prompt: message,
            message: assistantMessage,
            history: historyOut,
            updatedAt: assistantEntry.createdAt,
          };
          const snapshotThreadId = responseWithThread.threadId;
          storeCustomizerConversationSnapshot(ownerId, snapshotThreadId, snapshot).catch((error) => {
            console.warn("customizer conversation store failed", error);
          });

          try {
            const estimatedTokens = estimateTokensFromText(
              [message, JSON.stringify(run.response ?? {}), JSON.stringify(historyOut ?? [])].join("\n"),
            );
            const computeCost = computeTextCreditsFromTokens(estimatedTokens, null);
            if (walletContext && computeCost > 0 && !walletContext.bypass) {
              await chargeUsage({
                wallet: walletContext.wallet,
                balance: walletContext.balance,
                metric: "compute",
                amount: computeCost,
                reason: "ai.customize",
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
            console.error("billing.customize.stream_charge_failed", billingError);
            send({
              event: "error",
              error: "Billing failed for this request.",
            });
            controller.close();
            return;
          }

          send({ event: "done", payload: { ...responseWithThread, context: responseContext } });
          controller.close();
        } catch (error) {
          console.error("customizer_stream_failed", error);
          send({
            event: "error",
            error: "Your assistant ran into an error customizing that.",
          });
          controller.close();
        }
      },
    });

    return new Response(streamBody, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  }

  try {
    const run = await runCustomizerToolSession({
      ownerId,
      capsuleId: capsuleId ?? null,
      userText: message,
      history: historySanitized,
      attachments: attachmentList,
      incomingDraft: replyMode === "chat" ? null : post ?? null,
      context: composeContext,
      requestOrigin,
      replyMode,
      contextOptions,
      contextEnabled,
    });
    const assistantMessage =
      typeof run.response.message === "string" && run.response.message.trim().length
        ? run.response.message.trim()
        : "Updated your capsule visual.";
    const now = new Date().toISOString();
    const userEntry: ComposerChatMessage = {
      id: safeRandomUUID(),
      role: "user",
      content: message,
      createdAt: now,
      attachments: attachmentList.length ? attachmentList : null,
    };
    const assistantEntry: ComposerChatMessage = {
      id: safeRandomUUID(),
      role: "assistant",
      content: assistantMessage,
      createdAt: now,
      attachments: null,
    };
    const historyOut: ComposerChatMessage[] = [
      ...historySanitized,
      userEntry,
      assistantEntry,
    ].slice(-HISTORY_RETURN_LIMIT);
    const responseWithThread = {
      ...run.response,
      threadId: run.response.threadId ?? threadId,
      history: run.response.history ?? historyOut,
    };

    const snapshot: CustomizerConversationSnapshot = {
      threadId: responseWithThread.threadId,
      prompt: message,
      message: assistantMessage,
      history: historyOut,
      updatedAt: assistantEntry.createdAt,
    };
    const snapshotThreadId = responseWithThread.threadId;
    storeCustomizerConversationSnapshot(ownerId, snapshotThreadId, snapshot).catch((error) => {
      console.warn("customizer conversation store failed", error);
    });

    try {
      const estimatedTokens = estimateTokensFromText(
        [message, JSON.stringify(run.response ?? {}), JSON.stringify(historyOut ?? [])].join("\n"),
      );
      const computeCost = computeTextCreditsFromTokens(estimatedTokens, null);
      if (walletContext && computeCost > 0 && !walletContext.bypass) {
        await chargeUsage({
          wallet: walletContext.wallet,
          balance: walletContext.balance,
          metric: "compute",
          amount: computeCost,
          reason: "ai.customize",
          bypass: walletContext.bypass,
        });
      }
    } catch (billingError) {
      if (billingError instanceof EntitlementError) {
        return returnError(
          billingError.status,
          billingError.code,
          billingError.message,
          billingError.details,
        );
      }
      console.error("customizer_prompt.billing_failed", billingError);
      return returnError(500, "billing_error", "Failed to record customization usage");
    }

    return validatedJson(promptResponseSchema, { ...responseWithThread, context: responseContext });
  } catch (error) {
    console.error("customizer_prompt_failed", error);
    return returnError(502, "ai_error", "Your assistant ran into an error customizing that.");
  }
}

export const runtime = "nodejs";
