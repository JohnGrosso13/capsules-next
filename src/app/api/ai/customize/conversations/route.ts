import { z } from "zod";

import { ensureUserFromRequest } from "@/lib/auth/payload";
import { sanitizeComposerChatHistory } from "@/lib/composer/chat-types";
import { composerChatMessageSchema } from "@/shared/schemas/ai";
import {
  listCustomizerConversationSummaries,
  type CustomizerConversationSummary,
} from "@/server/customizer/conversation-store";
import { returnError, validatedJson } from "@/server/validation/http";

const conversationSchema = z.object({
  threadId: z.string(),
  prompt: z.string(),
  message: z.string().nullable(),
  updatedAt: z.string(),
  history: z.array(composerChatMessageSchema),
});

const responseSchema = z.object({
  conversations: z.array(conversationSchema),
});

function normalizeSummary(summary: CustomizerConversationSummary) {
  return {
    threadId: summary.threadId,
    prompt: summary.prompt,
    message: summary.message,
    updatedAt: summary.updatedAt,
    history: sanitizeComposerChatHistory(summary.history ?? []),
  };
}

export async function GET(req: Request) {
  const ownerId = await ensureUserFromRequest(req, {}, { allowGuests: false });
  if (!ownerId) {
    return returnError(401, "auth_required", "Sign in to view conversations.");
  }

  const summaries = await listCustomizerConversationSummaries(ownerId);
  const conversations = summaries.map((summary) => normalizeSummary(summary));

  return validatedJson(responseSchema, { conversations });
}

export const runtime = "edge";
