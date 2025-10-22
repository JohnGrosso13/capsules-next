import { z } from "zod";

import { ensureUserFromRequest } from "@/lib/auth/payload";
import {
  sanitizeComposerChatHistory,
  type ComposerChatMessage,
} from "@/lib/composer/chat-types";
import { composerChatMessageSchema } from "@/shared/schemas/ai";
import { returnError, validatedJson } from "@/server/validation/http";
import { loadConversationSnapshot } from "@/server/ai/conversation-store";

const paramsSchema = z.object({
  threadId: z.string().min(1),
});

const responseSchema = z.object({
  threadId: z.string(),
  prompt: z.string(),
  message: z.string().nullable(),
  updatedAt: z.string(),
  draft: z.record(z.string(), z.unknown()).nullable(),
  rawPost: z.record(z.string(), z.unknown()).nullable(),
  history: z.array(composerChatMessageSchema),
});

export async function GET(
  req: Request,
  context: { params: Promise<{ threadId: string }> },
) {
  const ownerId = await ensureUserFromRequest(req, {}, { allowGuests: false });
  if (!ownerId) {
    return returnError(401, "auth_required", "Sign in to view conversations.");
  }

  const paramsResult = paramsSchema.safeParse(await context.params);
  if (!paramsResult.success) {
    return returnError(400, "invalid_request", "threadId is required.");
  }

  const { threadId } = paramsResult.data;
  const snapshot = await loadConversationSnapshot(ownerId, threadId);
  if (!snapshot) {
    return returnError(404, "not_found", "Conversation not found.");
  }

  const normalizedHistory = sanitizeComposerChatHistory(snapshot.history);

  return validatedJson(responseSchema, {
    threadId: snapshot.threadId,
    prompt: snapshot.prompt,
    message: snapshot.message,
    updatedAt: snapshot.updatedAt,
    draft: snapshot.draft,
    rawPost: snapshot.rawPost,
    history: normalizedHistory,
  });
}

export const runtime = "edge";
