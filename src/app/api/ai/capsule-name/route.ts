import { z } from "zod";

import { fetchOpenAI, hasOpenAIApiKey } from "@/adapters/ai/openai/server";
import { ensureUserFromRequest } from "@/lib/auth/payload";
import { serverEnv } from "@/lib/env/server";
import { parseJsonBody, returnError, validatedJson } from "@/server/validation/http";

const messageSchema = z.object({
  role: z.union([z.literal("user"), z.literal("assistant")]),
  content: z
    .string()
    .trim()
    .min(1, "message content is required")
    .max(2000, "message is too long"),
});

const requestSchema = z.object({
  messages: z.array(messageSchema).min(1).max(10),
  capsuleName: z.string().trim().max(120).optional(),
});

const responseSchema = z.object({
  message: z.string(),
});

const SYSTEM_PROMPT =
  "You are Capsule AI, a creative assistant that helps creators name their Capsules - online hubs where they host communities, share content, and run events. Keep replies concise and upbeat. Offer 2-3 name options per answer, each on its own line, and include a short reason in parentheses.";

function mapMessages(
  data: z.infer<typeof requestSchema>,
): Array<{ role: "system" | "user" | "assistant"; content: string }> {
  const { messages, capsuleName } = data;
  const systemContent = capsuleName
    ? `${SYSTEM_PROMPT}\n\nThe user is currently considering the name "${capsuleName}". Feel free to suggest improvements or alternatives.`
    : SYSTEM_PROMPT;

  return [
    { role: "system" as const, content: systemContent },
    ...messages.map((message) => ({
      role: message.role,
      content: message.content,
    })),
  ];
}

export async function POST(req: Request) {
  const ownerId = await ensureUserFromRequest(req, {}, { allowGuests: false });
  if (!ownerId) {
    return returnError(401, "auth_required", "Sign in to chat with Capsule AI.");
  }

  if (!hasOpenAIApiKey()) {
    return returnError(503, "ai_unavailable", "Capsule AI is not configured.");
  }

  const parsed = await parseJsonBody(req, requestSchema);
  if (!parsed.success) {
    return parsed.response;
  }

  try {
    const completion = await fetchOpenAI("/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: serverEnv.OPENAI_MODEL || "gpt-4o-mini",
        temperature: 0.7,
        max_tokens: 400,
        messages: mapMessages(parsed.data),
        user: ownerId,
      }),
    });

    const payload = (await completion.json().catch(() => null)) as {
      choices?: Array<{ message?: { content?: string } | null }>;
    } | null;

    if (!completion.ok) {
      console.error("capsule-name.chat failure", payload);
      return returnError(502, "ai_error", "Capsule AI is unavailable right now.");
    }

    const message = payload?.choices?.[0]?.message?.content?.trim() ?? "";
    if (!message) {
      return returnError(502, "ai_error", "Capsule AI returned an empty response.");
    }

    return validatedJson(responseSchema, { message });
  } catch (error) {
    console.error("capsule-name.chat error", error);
    return returnError(502, "ai_error", "Capsule AI failed to respond.");
  }
}

export const runtime = "nodejs";
