"use server";

import { z } from "zod";

import { ensureUserFromRequest } from "@/lib/auth/payload";
import { ChatServiceError, createGroupConversation } from "@/server/chat/service";
import { parseJsonBody, returnError, validatedJson } from "@/server/validation/http";

const createRequestSchema = z.object({
  name: z.string().trim().max(120).optional(),
  participantIds: z.array(z.string().min(1)).min(1),
});

const participantSchema = z.object({
  id: z.string(),
  name: z.string(),
  avatar: z.string().nullable(),
});

const sessionSchema = z.object({
  type: z.literal("group"),
  title: z.string(),
  avatar: z.string().nullable(),
  createdBy: z.string().nullable(),
});

const createResponseSchema = z.object({
  success: z.literal(true),
  conversationId: z.string(),
  participants: z.array(participantSchema),
  session: sessionSchema,
});

export const runtime = "nodejs";

export async function POST(req: Request) {
  const userId = await ensureUserFromRequest(req, null, { allowGuests: false });
  if (!userId) {
    return returnError(401, "auth_required", "Sign in to start a group chat.");
  }

  const parsed = await parseJsonBody(req, createRequestSchema);
  if (!parsed.success) {
    return parsed.response;
  }

  try {
    const result = await createGroupConversation({
      creatorId: userId,
      participantIds: parsed.data.participantIds,
      title: parsed.data.name ?? null,
    });

    return validatedJson(createResponseSchema, {
      success: true,
      conversationId: result.conversationId,
      participants: result.participants.map((participant) => ({
        id: participant.id,
        name: participant.name,
        avatar: participant.avatar,
      })),
      session: {
        type: "group",
        title: result.session.title,
        avatar: result.session.avatar,
        createdBy: result.session.createdBy,
      },
    });
  } catch (error) {
    if (error instanceof ChatServiceError) {
      return returnError(error.status, `chat_${error.code}`, error.message);
    }
    console.error("chat.groups create error", error);
    return returnError(500, "chat_group_create_failed", "Unable to create that group chat right now.");
  }
}
