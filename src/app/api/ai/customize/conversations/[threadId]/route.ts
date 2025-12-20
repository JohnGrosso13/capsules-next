import { z } from "zod";

import { ensureUserFromRequest } from "@/lib/auth/payload";
import { sanitizeComposerChatHistory } from "@/lib/composer/chat-types";
import { composerChatMessageSchema } from "@/shared/schemas/ai";
import {
  loadCustomizerConversationSnapshot,
  type CustomizerConversationSnapshot,
} from "@/server/customizer/conversation-store";
import { returnError, validatedJson } from "@/server/validation/http";

const paramsSchema = z.object({
  threadId: z.string().min(1),
});

const responseSchema = z.object({
  threadId: z.string(),
  prompt: z.string(),
  message: z.string().nullable(),
  updatedAt: z.string(),
  history: z.array(composerChatMessageSchema),
});

function normalizeSnapshot(snapshot: CustomizerConversationSnapshot) {
  return {
    threadId: snapshot.threadId,
    prompt: snapshot.prompt,
    message: snapshot.message,
    updatedAt: snapshot.updatedAt,
    history: sanitizeComposerChatHistory(snapshot.history ?? []),
  };
}

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
  const snapshot = await loadCustomizerConversationSnapshot(ownerId, threadId);
  if (!snapshot) {
    return returnError(404, "not_found", "Conversation not found.");
  }

  return validatedJson(responseSchema, normalizeSnapshot(snapshot));
}

export const runtime = "edge";
