import { z } from "zod";

import { ensureUserFromRequest } from "@/lib/auth/payload";
import { isGroupConversationId } from "@/lib/chat/channels";
import {
  ChatServiceError,
  getDirectConversationHistory,
  getGroupConversationHistory,
  sendDirectMessage,
  sendGroupMessage,
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

const messageSchema = z.object({
  id: z.string(),
  conversationId: z.string(),
  senderId: z.string(),
  body: z.string(),
  sentAt: z.string(),
  reactions: z.array(reactionSchema),
});

const sessionSchema = z.object({
  type: z.enum(["direct", "group"]),
  title: z.string(),
  avatar: z.string().nullable(),
  createdBy: z.string().nullable(),
});

const sendRequestSchema = z.object({
  conversationId: z.string().min(1),
  messageId: z.string().min(3),
  body: z.string().min(1).max(4000),
  sentAt: z.string().datetime().optional(),
});

const sendResponseSchema = z.object({
  success: z.literal(true),
  message: messageSchema,
  participants: z.array(participantSchema),
  session: sessionSchema,
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
  session: sessionSchema,
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
    const isGroup = isGroupConversationId(parsed.data.conversationId);
    const result = isGroup
      ? await sendGroupMessage({
          conversationId: parsed.data.conversationId,
          messageId: parsed.data.messageId,
          body: parsed.data.body,
          clientSentAt: parsed.data.sentAt ?? null,
          senderId: userId,
        })
      : await sendDirectMessage({
          conversationId: parsed.data.conversationId,
          messageId: parsed.data.messageId,
          body: parsed.data.body,
          clientSentAt: parsed.data.sentAt ?? null,
          senderId: userId,
        });

    return validatedJson(sendResponseSchema, {
      success: true,
      message: result.message,
      participants: result.participants,
      session: result.session,
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
    const isGroup = isGroupConversationId(queryParse.data.conversationId);
    const history = isGroup
      ? await getGroupConversationHistory({
          conversationId: queryParse.data.conversationId,
          requesterId: userId,
          ...(queryParse.data.before ? { before: queryParse.data.before } : {}),
          ...(queryParse.data.limit !== undefined ? { limit: queryParse.data.limit } : {}),
        })
      : await getDirectConversationHistory({
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
      session: history.session,
    });
  } catch (error) {
    if (error instanceof ChatServiceError) {
      return returnError(error.status, `chat_${error.code}`, error.message);
    }
    console.error("chat.messages history error", error);
    return returnError(500, "chat_history_failed", "Unable to load this conversation.");
  }
}
