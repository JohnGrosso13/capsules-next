import { z } from "zod";

import { ensureUserFromRequest } from "@/lib/auth/payload";
import { ChatServiceError } from "@/server/chat/types";
import { addParticipantsToGroupConversation, removeParticipantFromGroupConversation } from "@/server/chat/service";
import { parseJsonBody, returnError, validatedJson } from "@/server/validation/http";

const participantSchema = z.object({
  id: z.string(),
  name: z.string(),
  avatar: z.string().nullable(),
});

const updateResponseSchema = z.object({
  success: z.literal(true),
  participants: z.array(participantSchema),
});

const addRequestSchema = z.object({
  conversationId: z.string().min(1),
  participantIds: z.array(z.string()).min(1),
});

const removeRequestSchema = z.object({
  conversationId: z.string().min(1),
  targetUserId: z.string().min(1),
});

export const runtime = "nodejs";

export async function POST(req: Request) {
  const userId = await ensureUserFromRequest(req, null, { allowGuests: false });
  if (!userId) {
    return returnError(401, "auth_required", "Sign in to modify this group.");
  }

  const parsed = await parseJsonBody(req, addRequestSchema);
  if (!parsed.success) {
    return parsed.response;
  }

  try {
    const participants = await addParticipantsToGroupConversation({
      conversationId: parsed.data.conversationId,
      requesterId: userId,
      participantIds: parsed.data.participantIds,
    });

    return validatedJson(updateResponseSchema, {
      success: true,
      participants: participants.map((participant) => ({
        id: participant.id,
        name: participant.name,
        avatar: participant.avatar,
      })),
    });
  } catch (error) {
    if (error instanceof ChatServiceError) {
      return returnError(error.status, `chat_${error.code}`, error.message);
    }
    console.error("chat.groups participants add error", error);
    return returnError(500, "chat_group_add_failed", "Unable to add those participants right now.");
  }
}

export async function DELETE(req: Request) {
  const userId = await ensureUserFromRequest(req, null, { allowGuests: false });
  if (!userId) {
    return returnError(401, "auth_required", "Sign in to modify this group.");
  }

  const parsed = await parseJsonBody(req, removeRequestSchema);
  if (!parsed.success) {
    return parsed.response;
  }

  try {
    const participants = await removeParticipantFromGroupConversation({
      conversationId: parsed.data.conversationId,
      requesterId: userId,
      targetUserId: parsed.data.targetUserId,
      allowSelf: true,
    });

    return validatedJson(updateResponseSchema, {
      success: true,
      participants: participants.map((participant) => ({
        id: participant.id,
        name: participant.name,
        avatar: participant.avatar,
      })),
    });
  } catch (error) {
    if (error instanceof ChatServiceError) {
      return returnError(error.status, `chat_${error.code}`, error.message);
    }
    console.error("chat.groups participants remove error", error);
    return returnError(500, "chat_group_remove_failed", "Unable to remove that participant right now.");
  }
}
