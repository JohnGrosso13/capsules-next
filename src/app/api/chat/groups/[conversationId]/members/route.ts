"use server";

import { z } from "zod";

import { ensureUserFromRequest } from "@/lib/auth/payload";
import { ChatServiceError, addParticipantsToGroupConversation } from "@/server/chat/service";
import { parseJsonBody, returnError, validatedJson } from "@/server/validation/http";

const addMembersRequestSchema = z.object({
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

const addMembersResponseSchema = z.object({
  success: z.literal(true),
  conversationId: z.string(),
  participants: z.array(participantSchema),
  added: z.array(participantSchema),
  session: sessionSchema,
});

export const runtime = "nodejs";

export async function POST(
  req: Request,
  context: { params: Promise<{ conversationId: string }> },
) {
  const userId = await ensureUserFromRequest(req, null, { allowGuests: false });
  if (!userId) {
    return returnError(401, "auth_required", "Sign in to update this chat.");
  }

  const { conversationId: rawConversationId } = await context.params;
  const conversationId = rawConversationId?.trim();
  if (!conversationId) {
    return returnError(400, "invalid_request", "Conversation id is required.");
  }

  const parsed = await parseJsonBody(req, addMembersRequestSchema);
  if (!parsed.success) {
    return parsed.response;
  }

  try {
    const result = await addParticipantsToGroupConversation({
      conversationId,
      actorId: userId,
      participantIds: parsed.data.participantIds,
    });

    return validatedJson(addMembersResponseSchema, {
      success: true,
      conversationId: result.conversationId,
      participants: result.participants.map((participant) => ({
        id: participant.id,
        name: participant.name,
        avatar: participant.avatar,
      })),
      added: result.added.map((participant) => ({
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
    console.error("chat.groups add members error", error);
    return returnError(
      500,
      "chat_group_add_members_failed",
      "Unable to add those participants right now.",
    );
  }
}
