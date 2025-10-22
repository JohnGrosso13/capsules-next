import { z } from "zod";

import { ensureUserFromRequest } from "@/lib/auth/payload";
import {
  ChatServiceError,
  listRecentDirectConversations,
  listRecentGroupConversations,
} from "@/server/chat/service";
import { returnError, validatedJson } from "@/server/validation/http";

const participantSchema = z.object({
  id: z.string(),
  name: z.string(),
  avatar: z.string().nullable(),
});

const messageSchema = z.object({
  id: z.string(),
  conversationId: z.string(),
  senderId: z.string(),
  body: z.string(),
  sentAt: z.string(),
});

const sessionSchema = z.object({
  type: z.enum(["direct", "group"]),
  title: z.string(),
  avatar: z.string().nullable(),
  createdBy: z.string().nullable(),
});

const responseSchema = z.object({
  success: z.literal(true),
  conversations: z.array(
    z.object({
      conversationId: z.string(),
      participants: z.array(participantSchema),
      session: sessionSchema,
      lastMessage: messageSchema.nullable(),
    }),
  ),
});

const querySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

export const runtime = "nodejs";

export async function GET(req: Request) {
  const userId = await ensureUserFromRequest(req, null, { allowGuests: false });
  if (!userId) {
    return returnError(401, "auth_required", "Sign in to view messages.");
  }

  const url = new URL(req.url);
  const parseResult = querySchema.safeParse({
    limit: url.searchParams.get("limit") ?? undefined,
  });
  if (!parseResult.success) {
    return returnError(
      400,
      "invalid_request",
      "Inbox query parameters failed validation.",
      parseResult.error.flatten(),
    );
  }

  try {
    const limit = parseResult.data.limit ?? undefined;
    const [directSummaries, groupSummaries] = await Promise.all([
      listRecentDirectConversations({
        userId,
        ...(limit !== undefined ? { limit } : {}),
      }),
      listRecentGroupConversations({
        userId,
        ...(limit !== undefined ? { limit } : {}),
      }),
    ]);

    const combined = [...directSummaries, ...groupSummaries].sort((a, b) => {
      const leftTime = a.lastMessage ? Date.parse(a.lastMessage.sentAt) : 0;
      const rightTime = b.lastMessage ? Date.parse(b.lastMessage.sentAt) : 0;
      return rightTime - leftTime;
    });

    const limited = limit !== undefined ? combined.slice(0, limit) : combined;

    return validatedJson(responseSchema, {
      success: true,
      conversations: limited.map((summary) => ({
        conversationId: summary.conversationId,
        participants: summary.participants.map((participant) => ({
          id: participant.id,
          name: participant.name,
          avatar: participant.avatar,
        })),
        session: {
          type: summary.session.type,
          title: summary.session.title,
          avatar: summary.session.avatar,
          createdBy: summary.session.createdBy,
        },
        lastMessage: summary.lastMessage
          ? {
              id: summary.lastMessage.id,
              conversationId: summary.lastMessage.conversationId,
              senderId: summary.lastMessage.senderId,
              body: summary.lastMessage.body,
              sentAt: summary.lastMessage.sentAt,
            }
          : null,
      })),
    });
  } catch (error) {
    if (error instanceof ChatServiceError) {
      return returnError(error.status, `chat_${error.code}`, error.message);
    }
    console.error("chat inbox error", error);
    return returnError(500, "chat_inbox_failed", "Unable to load your inbox right now.");
  }
}
