import { z } from "zod";

import { ensureUserFromRequest } from "@/lib/auth/payload";
import {
  ChatServiceError,
  getDirectConversationHistory,
  sendDirectMessage,
} from "@/server/chat/service";
import { parseJsonBody, returnError, validatedJson } from "@/server/validation/http";

const participantSchema = z.object({
  id: z.string(),
  name: z.string(),
  avatar: z.string().nullable(),
});

const reactionSchema = z.object({
  emoji: z.string(),
  count: z.number().int().min(0),
  users: z.array(participantSchema),
});

const flexibleUrlSchema = z
  .string()
  .min(1)
  .refine(
    (value) => {
      try {
        if (value.startsWith("/")) return true;
        const parsed = new URL(value);
        return Boolean(parsed);
      } catch {
        return false;
      }
    },
    { message: "Invalid URL" },
  );

const messageAttachmentSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  mimeType: z.string().min(1),
  size: z.number().int().min(0).optional(),
  url: flexibleUrlSchema,
  thumbnailUrl: flexibleUrlSchema.optional().nullable(),
  storageKey: z.string().min(1).optional().nullable(),
  sessionId: z.string().min(1).optional().nullable(),
});

const messageSchema = z.object({
  id: z.string(),
  conversationId: z.string(),
  senderId: z.string(),
  body: z.string(),
  sentAt: z.string(),
  reactions: z.array(reactionSchema),
  attachments: z.array(messageAttachmentSchema).optional(),
});

const sendRequestSchema = z
  .object({
    conversationId: z.string().min(1),
    messageId: z.string().min(3),
    body: z.string().max(4000).optional(),
    attachments: z.array(messageAttachmentSchema).optional(),
    sentAt: z.string().datetime().optional(),
  })
  .superRefine((value, ctx) => {
    const body = typeof value.body === "string" ? value.body.replace(/\s+/g, " ").trim() : "";
    const attachmentsCount = Array.isArray(value.attachments) ? value.attachments.length : 0;
    if (!body && attachmentsCount === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "A message must include text or at least one attachment.",
        path: ["body"],
      });
    }
  });

const sendResponseSchema = z.object({
  success: z.literal(true),
  message: messageSchema,
  participants: z.array(participantSchema),
});

const historyQuerySchema = z.object({
  conversationId: z.string().min(1),
  before: z.string().datetime().optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
});

const historyResponseSchema = z.object({
  success: z.literal(true),
  conversationId: z.string(),
  participants: z.array(participantSchema),
  messages: z.array(messageSchema),
});

export const runtime = "nodejs";

export async function POST(req: Request) {
  const userId = await ensureUserFromRequest(req, null, { allowGuests: false });
  if (!userId) {
    return returnError(401, "auth_required", "Sign in to send messages.");
  }

  const parsed = await parseJsonBody(req, sendRequestSchema);
  if (!parsed.success) {
    return parsed.response;
  }

  try {
    const normalizedAttachments =
      parsed.data.attachments?.map((attachment) => ({
        id: attachment.id,
        name: attachment.name,
        mimeType: attachment.mimeType,
        url: attachment.url,
        size:
          typeof attachment.size === "number" && Number.isFinite(attachment.size) && attachment.size >= 0
            ? Math.floor(attachment.size)
            : 0,
        thumbnailUrl:
          typeof attachment.thumbnailUrl === "string" && attachment.thumbnailUrl.trim().length
            ? attachment.thumbnailUrl.trim()
            : null,
        storageKey:
          typeof attachment.storageKey === "string" && attachment.storageKey.trim().length
            ? attachment.storageKey.trim()
            : null,
        sessionId:
          typeof attachment.sessionId === "string" && attachment.sessionId.trim().length
            ? attachment.sessionId.trim()
            : null,
      })) ?? [];

    const result = await sendDirectMessage({
      conversationId: parsed.data.conversationId,
      messageId: parsed.data.messageId,
      body: parsed.data.body ?? "",
      attachments: normalizedAttachments,
      clientSentAt: parsed.data.sentAt ?? null,
      senderId: userId,
    });

    return validatedJson(sendResponseSchema, {
      success: true,
      message: result.message,
      participants: result.participants,
    });
  } catch (error) {
    if (error instanceof ChatServiceError) {
      return returnError(error.status, `chat_${error.code}`, error.message);
    }
    console.error("chat.messages send error", error);
    return returnError(500, "chat_send_failed", "Unable to send that message right now.");
  }
}

export async function GET(req: Request) {
  const userId = await ensureUserFromRequest(req, null, { allowGuests: false });
  if (!userId) {
    return returnError(401, "auth_required", "Sign in to view messages.");
  }

  const url = new URL(req.url);
  const queryParse = historyQuerySchema.safeParse({
    conversationId: url.searchParams.get("conversationId") ?? undefined,
    before: url.searchParams.get("before") ?? undefined,
    limit: url.searchParams.get("limit") ?? undefined,
  });
  if (!queryParse.success) {
    return returnError(
      400,
      "invalid_request",
      "Conversation query parameters failed validation.",
      queryParse.error.flatten(),
    );
  }

  try {
    const history = await getDirectConversationHistory({
      conversationId: queryParse.data.conversationId,
      requesterId: userId,
      ...(queryParse.data.before ? { before: queryParse.data.before } : {}),
      ...(queryParse.data.limit !== undefined ? { limit: queryParse.data.limit } : {}),
    });

    return validatedJson(historyResponseSchema, {
      success: true,
      conversationId: history.conversationId,
      participants: history.participants,
      messages: history.messages,
    });
  } catch (error) {
    if (error instanceof ChatServiceError) {
      return returnError(error.status, `chat_${error.code}`, error.message);
    }
    console.error("chat.messages history error", error);
    return returnError(500, "chat_history_failed", "Unable to load this conversation.");
  }
}
