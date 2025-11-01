import { z } from "zod";

import { ensureUserFromRequest } from "@/lib/auth/payload";
import { ChatServiceError } from "@/server/chat/types";
import { addMessageReaction, removeMessageReaction } from "@/server/chat/service";
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

const reactionMutationSchema = z.object({
  conversationId: z.string().min(1),
  messageId: z.string().min(3),
  emoji: z.string().min(1).max(32),
  action: z.enum(["add", "remove"]).default("add"),
});

const reactionResponseSchema = z.object({
  success: z.literal(true),
  conversationId: z.string(),
  messageId: z.string(),
  emoji: z.string(),
  action: z.enum(["added", "removed"]),
  reactions: z.array(reactionSchema),
});

export const runtime = "nodejs";

export async function POST(req: Request) {
  const userId = await ensureUserFromRequest(req, null, { allowGuests: false });
  if (!userId) {
    return returnError(401, "auth_required", "Sign in to react to messages.");
  }

  const parsed = await parseJsonBody(req, reactionMutationSchema);
  if (!parsed.success) {
    return parsed.response;
  }

  const { conversationId, messageId, emoji, action } = parsed.data;

  try {
    const result =
      action === "remove"
        ? await removeMessageReaction({ conversationId, messageId, emoji, userId })
        : await addMessageReaction({ conversationId, messageId, emoji, userId });

    return validatedJson(reactionResponseSchema, {
      success: true,
      conversationId: result.conversationId,
      messageId: result.messageId,
      emoji: result.emoji,
      action: result.action,
      reactions: result.reactions.map((reaction) => ({
        emoji: reaction.emoji,
        count: reaction.count,
        users: reaction.users,
      })),
    });
  } catch (error) {
    if (error instanceof ChatServiceError) {
      return returnError(error.status, `chat_${error.code}`, error.message);
    }
    console.error("chat.reactions mutation error", error);
    return returnError(500, "chat_reaction_failed", "Unable to update that reaction right now.");
  }
}
