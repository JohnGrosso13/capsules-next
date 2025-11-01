import { z } from "zod";

import { ensureUserFromRequest } from "@/lib/auth/payload";
import { ChatServiceError } from "@/server/chat/types";
import { createGroupConversationSession, renameGroupConversation, deleteGroupConversationSession } from "@/server/chat/service";
import { parseJsonBody, returnError, validatedJson } from "@/server/validation/http";

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

const createRequestSchema = z.object({
  conversationId: z.string().min(1),
  participantIds: z.array(z.string()).min(1),
  title: z.string().optional(),
  avatarUrl: z.string().optional(),
});

const createResponseSchema = z.object({
  success: z.literal(true),
  conversation: z.object({
    conversationId: z.string(),
    participants: z.array(participantSchema),
    session: sessionSchema,
  }),
});

const renameRequestSchema = z.object({
  conversationId: z.string().min(1),
  title: z.string().min(1),
});

const renameResponseSchema = z.object({
  success: z.literal(true),
  conversationId: z.string(),
  title: z.string(),
});

const deleteResponseSchema = z.object({
  success: z.literal(true),
  conversationId: z.string(),
});

export const runtime = "nodejs";

export async function POST(req: Request) {
  const userId = await ensureUserFromRequest(req, null, { allowGuests: false });
  if (!userId) {
    return returnError(401, "auth_required", "Sign in to create a group chat.");
  }

  const parsed = await parseJsonBody(req, createRequestSchema);
  if (!parsed.success) {
    return parsed.response;
  }

  try {
    const result = await createGroupConversationSession({
      conversationId: parsed.data.conversationId,
      creatorId: userId,
      participantIds: parsed.data.participantIds,
      title: parsed.data.title ?? null,
      avatarUrl: parsed.data.avatarUrl ?? null,
    });

    return validatedJson(createResponseSchema, {
      success: true,
      conversation: {
        conversationId: result.conversationId,
        participants: result.participants.map((participant) => ({
          id: participant.id,
          name: participant.name,
          avatar: participant.avatar,
        })),
        session: result.session,
      },
    });
  } catch (error) {
    if (error instanceof ChatServiceError) {
      return returnError(error.status, `chat_${error.code}`, error.message);
    }
    console.error("chat.groups create error", error);
    return returnError(500, "chat_group_create_failed", "Unable to create that group chat.");
  }
}

export async function PATCH(req: Request) {
  const userId = await ensureUserFromRequest(req, null, { allowGuests: false });
  if (!userId) {
    return returnError(401, "auth_required", "Sign in to rename this group.");
  }

  const parsed = await parseJsonBody(req, renameRequestSchema);
  if (!parsed.success) {
    return parsed.response;
  }

  try {
    const result = await renameGroupConversation({
      conversationId: parsed.data.conversationId,
      requesterId: userId,
      title: parsed.data.title,
    });

    return validatedJson(renameResponseSchema, {
      success: true,
      conversationId: result.conversationId,
      title: result.title,
    });
  } catch (error) {
    if (error instanceof ChatServiceError) {
      return returnError(error.status, `chat_${error.code}`, error.message);
    }
    console.error("chat.groups rename error", error);
    return returnError(500, "chat_group_rename_failed", "Unable to rename that group chat.");
  }
}

export async function DELETE(req: Request) {
  const userId = await ensureUserFromRequest(req, null, { allowGuests: false });
  if (!userId) {
    return returnError(401, "auth_required", "Sign in to delete this group.");
  }

  const url = new URL(req.url);
  const conversationId = url.searchParams.get("conversationId") ?? undefined;
  if (!conversationId) {
    return returnError(400, "invalid_request", "Provide a conversationId to delete.");
  }

  try {
    await deleteGroupConversationSession({ conversationId, requesterId: userId });
    return validatedJson(deleteResponseSchema, {
      success: true,
      conversationId,
    });
  } catch (error) {
    if (error instanceof ChatServiceError) {
      return returnError(error.status, `chat_${error.code}`, error.message);
    }
    console.error("chat.groups delete error", error);
    return returnError(500, "chat_group_delete_failed", "Unable to delete that group chat.");
  }
}
