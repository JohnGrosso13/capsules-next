import { NextRequest } from "next/server";
import { z } from "zod";

import { ensureUserFromRequest } from "@/lib/auth/payload";
import {
  updateMessageAttachments,
  deleteMessage as deleteChatMessage,
} from "@/server/chat/service";
import { parseJsonBody, returnError, validatedJson } from "@/server/validation/http";

const participantSchema = z.object({
  id: z.string(),
  name: z.string(),
  avatar: z.string().nullable(),
});

const messageAttachmentSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  mimeType: z.string().min(1),
  size: z.number().int().min(0).optional(),
  url: z.string().min(1),
  thumbnailUrl: z.string().nullable().optional(),
  storageKey: z.string().nullable().optional(),
  sessionId: z.string().nullable().optional(),
});

const messageSchema = z.object({
  id: z.string(),
  conversationId: z.string(),
  senderId: z.string(),
  body: z.string(),
  sentAt: z.string(),
  attachments: z.array(messageAttachmentSchema).optional(),
});

const updateRequestSchema = z.object({
  conversationId: z.string().min(1),
  removeAttachmentIds: z.array(z.string().min(1)).nonempty(),
});

const updateResponseSchema = z.object({
  success: z.literal(true),
  message: messageSchema,
  participants: z.array(participantSchema),
});

const deleteResponseSchema = z.object({
  success: z.literal(true),
  conversationId: z.string(),
  messageId: z.string(),
  participants: z.array(participantSchema).optional(),
});

export const runtime = "nodejs";

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ messageId: string }> },
) {
  const userId = await ensureUserFromRequest(req, null, { allowGuests: false });
  if (!userId) {
    return returnError(401, "auth_required", "Sign in to update message attachments.");
  }

  const payload = await parseJsonBody(req, updateRequestSchema);
  if (!payload.success) {
    return payload.response;
  }

  const resolvedParams = await context.params;
  const messageId = resolvedParams?.messageId?.trim();
  if (!messageId) {
    return returnError(400, "invalid_request", "A message id is required.");
  }

  try {
    const result = await updateMessageAttachments({
      conversationId: payload.data.conversationId,
      messageId,
      requesterId: userId,
      removeAttachmentIds: payload.data.removeAttachmentIds,
    });

    return validatedJson(updateResponseSchema, {
      success: true,
      message: {
        id: result.message.id,
        conversationId: result.message.conversationId,
        senderId: result.message.senderId,
        body: result.message.body,
        sentAt: result.message.sentAt,
        attachments: result.message.attachments,
      },
      participants: result.participants.map((participant) => ({
        id: participant.id,
        name: participant.name,
        avatar: participant.avatar ?? null,
      })),
    });
  } catch (error) {
    if (error instanceof Error && "code" in error && "status" in error) {
      const serviceError = error as { code: string; status: number; message: string };
      return returnError(serviceError.status, `chat_${serviceError.code}`, serviceError.message);
    }
    console.error("chat.messages attachment update error", error);
    return returnError(
      500,
      "chat_update_failed",
      "Unable to update attachments for that message right now.",
    );
  }
}

export async function DELETE(
  req: NextRequest,
  context: { params: Promise<{ messageId: string }> },
) {
  const userId = await ensureUserFromRequest(req, null, { allowGuests: false });
  if (!userId) {
    return returnError(401, "auth_required", "Sign in to delete a message.");
  }

  const url = new URL(req.url);
  const conversationId = url.searchParams.get("conversationId")?.trim();
  if (!conversationId) {
    return returnError(400, "invalid_request", "A conversation id is required.");
  }

  const resolvedParams = await context.params;
  const messageId = resolvedParams?.messageId?.trim();
  if (!messageId) {
    return returnError(400, "invalid_request", "A message id is required.");
  }

  try {
    const result = await deleteChatMessage({
      conversationId,
      messageId,
      requesterId: userId,
    });

    return validatedJson(deleteResponseSchema, {
      success: true,
      conversationId: result.conversationId,
      messageId: result.messageId,
      participants: result.participants.map((participant) => ({
        id: participant.id,
        name: participant.name,
        avatar: participant.avatar ?? null,
      })),
    });
  } catch (error) {
    if (error instanceof Error && "code" in error && "status" in error) {
      const serviceError = error as { code: string; status: number; message: string };
      return returnError(serviceError.status, `chat_${serviceError.code}`, serviceError.message);
    }
    console.error("chat.messages delete error", error);
    return returnError(500, "chat_delete_failed", "Unable to delete that message right now.");
  }
}
