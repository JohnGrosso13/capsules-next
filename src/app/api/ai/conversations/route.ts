import { z } from "zod";

import { ensureUserFromRequest } from "@/lib/auth/payload";
import { sanitizeComposerChatHistory } from "@/lib/composer/chat-types";
import { composerChatMessageSchema } from "@/shared/schemas/ai";
import {
  returnError,
  validatedJson,
} from "@/server/validation/http";
import { listConversationSummaries } from "@/server/ai/conversation-store";

const conversationSchema = z.object({
  threadId: z.string(),
  prompt: z.string(),
  message: z.string().nullable(),
  updatedAt: z.string(),
  draft: z.record(z.string(), z.unknown()).nullable(),
  rawPost: z.record(z.string(), z.unknown()).nullable(),
  history: z.array(composerChatMessageSchema),
});

const responseSchema = z.object({
  conversations: z.array(conversationSchema),
});

export async function GET(req: Request) {
  const ownerId = await ensureUserFromRequest(req, {}, { allowGuests: false });
  if (!ownerId) {
    return returnError(401, "auth_required", "Sign in to view conversations.");
  }

  const summaries = await listConversationSummaries(ownerId);
  const conversations = summaries.map((summary) => ({
    threadId: summary.threadId,
    prompt: summary.prompt,
    message: summary.message,
    updatedAt: summary.updatedAt,
    draft: summary.draft,
    rawPost: summary.rawPost,
    history: sanitizeComposerChatHistory(summary.history ?? []),
  }));

  return validatedJson(responseSchema, { conversations });
}

export const runtime = "edge";
