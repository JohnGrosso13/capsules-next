import { randomUUID } from "node:crypto";
import { z } from "zod";

import { hasOpenAIApiKey } from "@/adapters/ai/openai/server";
import { createPollDraft, createPostDraft, refinePostDraft, type PromptClarifierInput } from "@/lib/ai/prompter";
import {
  sanitizeComposerChatAttachment,
  sanitizeComposerChatHistory,
  type ComposerChatAttachment,
  type ComposerChatMessage,
} from "@/lib/composer/chat-types";
import { draftPostResponseSchema, promptResponseSchema } from "@/shared/schemas/ai";
import { ensureUserFromRequest } from "@/lib/auth/payload";
import {
  parseJsonBody,
  returnError,
  validatedJson,
} from "@/server/validation/http";
import { storeConversationSnapshot } from "@/server/ai/conversation-store";
import {
  checkRateLimit,
  retryAfterSeconds as computeRetryAfterSeconds,
  type RateLimitDefinition,
} from "@/server/rate-limit";

const attachmentSchema = z.object({
  id: z.string(),
  name: z.string(),
  mimeType: z.string(),
  size: z.number().min(0).optional(),
  url: z.string(),
  thumbnailUrl: z.string().optional().nullable(),
  storageKey: z.string().optional().nullable(),
  sessionId: z.string().optional().nullable(),
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
});

function generateThreadId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  const random = Math.random().toString(36).slice(2);
  const timestamp = Date.now().toString(36);
  return `thread-${timestamp}-${random}`;
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
      id: randomUUID(),
      name: kind === "video" ? "Generated clip" : "Generated visual",
      mimeType,
      size: 0,
      url: mediaUrl,
      thumbnailUrl: thumbnail && thumbnail.length ? thumbnail : null,
      storageKey: null,
      sessionId: null,
    },
  ];
}

function extractClarifierOption(
  raw: Record<string, unknown> | undefined,
): { clarifier: PromptClarifierInput | null; options: Record<string, unknown> } {
  if (!raw || typeof raw !== "object") {
    return { clarifier: null, options: {} };
  }

  const clone: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(raw)) {
    clone[key] = value;
  }

  let clarifierInput: PromptClarifierInput | null = null;
  const candidate = (clone as Record<string, unknown>).clarifier;
  if (candidate && typeof candidate === "object") {
    const record = candidate as Record<string, unknown>;
    const questionId =
      typeof record.questionId === "string" && record.questionId.trim().length
        ? record.questionId.trim()
        : undefined;
    const answer =
      typeof record.answer === "string" && record.answer.trim().length
        ? record.answer.trim()
        : undefined;
    const skip = record.skip === true;
    if (questionId !== undefined || answer !== undefined || skip) {
      const clarifierPayload: PromptClarifierInput = {};
      if (questionId !== undefined) {
        clarifierPayload.questionId = questionId;
      }
      if (answer !== undefined) {
        clarifierPayload.answer = answer;
      }
      if (skip) {
        clarifierPayload.skip = true;
      }
      clarifierInput = Object.keys(clarifierPayload).length ? clarifierPayload : null;
    }
  }
  delete (clone as Record<string, unknown>).clarifier;
  return { clarifier: clarifierInput, options: clone };
}

const HISTORY_RETURN_LIMIT = 24;

const PROMPT_RATE_LIMIT: RateLimitDefinition = {
  name: "ai.prompt",
  limit: 30,
  window: "5 m",
};

export async function POST(req: Request) {
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
      "You’re asking too quickly. Give me a moment before drafting another idea.",
      retryAfterSeconds === null ? undefined : { retryAfterSeconds },
    );
  }

  const { message } = parsed.data;
  const rawOptions = (parsed.data.options as Record<string, unknown> | undefined) ?? {};
  const incomingPost =
    (parsed.data.post as Record<string, unknown> | null | undefined) ?? null;
  const capsuleId = parsed.data.capsuleId ?? null;

  const attachments = sanitizeAttachments(parsed.data.attachments);
  const previousHistory = sanitizeComposerChatHistory(parsed.data.history ?? []);
  const threadId = coerceThreadId(parsed.data.threadId);

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

  const { clarifier: clarifierOption, options: sanitizedOptions } = extractClarifierOption(
    rawOptions,
  );

  const composeOptions = {
    history: previousHistory,
    attachments,
    capsuleId,
    rawOptions: sanitizedOptions,
    clarifier: clarifierOption,
  };

  try {
    let payload: unknown;

    if (preferPoll) {
      const pollDraft = await createPollDraft(message, pollHint, composeOptions);
      payload = {
        action: "draft_post",
        message: pollDraft.message,
        post: {
          kind: "poll",
          content: "",
          poll: pollDraft.poll,
          source: "ai-prompter",
        },
      } as z.infer<typeof draftPostResponseSchema>;
    } else if (incomingPost) {
      payload = await refinePostDraft(message, incomingPost, composeOptions);
    } else {
      payload = await createPostDraft(message, composeOptions);
    }

    const userEntry: ComposerChatMessage = {
      id: randomUUID(),
      role: "user",
      content: message,
      createdAt: new Date().toISOString(),
      attachments: attachments.length ? attachments : null,
    };

    if (
      payload &&
      typeof payload === "object" &&
      (payload as { action?: string }).action === "clarify_image_prompt"
    ) {
      const clarifierPayload = payload as {
        action: "clarify_image_prompt";
        questionId: string;
        question: string;
        rationale?: string | null;
        suggestions?: unknown;
        styleTraits?: unknown;
      };

      const suggestionList = Array.isArray(clarifierPayload.suggestions)
        ? clarifierPayload.suggestions
            .map((entry) => (typeof entry === "string" ? entry.trim() : ""))
            .filter((entry) => entry.length > 0)
        : [];
      const styleTraitList = Array.isArray(clarifierPayload.styleTraits)
        ? clarifierPayload.styleTraits
            .map((entry) => (typeof entry === "string" ? entry.trim() : ""))
            .filter((entry) => entry.length > 0)
        : [];

      const assistantLines: string[] = [clarifierPayload.question.trim()];
      if (suggestionList.length) {
        assistantLines.push(
          "",
          "Suggested directions:",
          ...suggestionList.map((entry) => `- ${entry}`),
        );
      }
      const assistantMessage = assistantLines.join("\n").trim();

      const assistantEntry: ComposerChatMessage = {
        id: randomUUID(),
        role: "assistant",
        content: assistantMessage,
        createdAt: new Date().toISOString(),
        attachments: null,
      };

      const historyOut = [...previousHistory, userEntry, assistantEntry].slice(
        -HISTORY_RETURN_LIMIT,
      );

      await storeConversationSnapshot(ownerId, threadId, {
        threadId,
        prompt: userEntry.content,
        message: assistantEntry.content,
        history: historyOut,
        draft: null,
        rawPost: null,
        updatedAt: assistantEntry.createdAt,
      }).catch((error) => {
        console.warn("composer conversation store failed", error);
      });

      const clarifierResponse = promptResponseSchema.parse({
        action: "clarify_image_prompt",
        questionId: clarifierPayload.questionId,
        question: clarifierPayload.question,
        rationale:
          typeof clarifierPayload.rationale === "string" &&
          clarifierPayload.rationale.trim().length
            ? clarifierPayload.rationale.trim()
            : undefined,
        suggestions: suggestionList.length ? suggestionList : undefined,
        styleTraits: styleTraitList.length ? styleTraitList : undefined,
        threadId,
        history: historyOut,
      });

      return validatedJson(promptResponseSchema, clarifierResponse);
    }

    const validated = draftPostResponseSchema.parse(payload);

    const assistantMessage =
      typeof validated.message === "string" && validated.message.trim().length
        ? validated.message.trim()
        : "Here's what I drafted.";
    const assistantAttachments = buildAssistantAttachments(
      validated.post ?? null,
    );
    const assistantEntry: ComposerChatMessage = {
      id: randomUUID(),
      role: "assistant",
      content: assistantMessage,
      createdAt: new Date().toISOString(),
      attachments: assistantAttachments && assistantAttachments.length
        ? assistantAttachments
        : null,
    };

    const historyOut = [...previousHistory, userEntry, assistantEntry].slice(
      -HISTORY_RETURN_LIMIT,
    );

    await storeConversationSnapshot(ownerId, threadId, {
      threadId,
      prompt: userEntry.content,
      message: assistantEntry.content,
      history: historyOut,
      draft: validated.post ?? null,
      rawPost: validated.post ?? null,
      updatedAt: assistantEntry.createdAt,
    }).catch((error) => {
      console.warn("composer conversation store failed", error);
    });

    const finalResponse = promptResponseSchema.parse({
      ...validated,
      threadId,
      history: historyOut,
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

export const runtime = "edge";

