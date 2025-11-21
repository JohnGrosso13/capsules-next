import { z } from "zod";

import { fetchOpenAI, hasOpenAIApiKey } from "@/adapters/ai/openai/server";
import { buildCompletionTokenLimit } from "@/lib/ai/openai";
import { ensureUserFromRequest } from "@/lib/auth/payload";
import { serverEnv } from "@/lib/env/server";
import { parseJsonBody, returnError, validatedJson } from "@/server/validation/http";

const messageSchema = z.object({
  role: z.union([z.literal("user"), z.literal("assistant")]),
  content: z.string().trim().min(1, "message content is required").max(2000, "message is too long"),
});

const requestSchema = z.object({
  messages: z.array(messageSchema).min(1).max(10),
  capsuleName: z.string().trim().max(120).optional().nullable(),
  gameTitle: z.string().trim().max(160).optional().nullable(),
  cadence: z.string().trim().max(160).optional().nullable(),
  rewards: z.string().trim().max(240).optional().nullable(),
  currentSummary: z.string().trim().max(360).optional().nullable(),
});

const responseSchema = z.object({
  message: z.string(),
});

const SYSTEM_PROMPT =
  "You are Capsule AI, an editorial assistant that helps creators write vivid one-line ladder summaries. Keep lines under 200 characters, highlight the hook, cadence, or rewards, and write with energy.";

function mapMessages(
  data: z.infer<typeof requestSchema>,
): Array<{ role: "system" | "user" | "assistant"; content: string }> {
  const { messages, capsuleName, gameTitle, cadence, rewards, currentSummary } = data;
  const contextParts = [
    capsuleName ? `Capsule: ${capsuleName}` : null,
    gameTitle ? `Game focus: ${gameTitle}` : null,
    cadence ? `Cadence: ${cadence}` : null,
    rewards ? `Rewards: ${rewards}` : null,
    currentSummary ? `Current draft summary: ${currentSummary}` : null,
  ].filter((value): value is string => Boolean(value && value.trim().length));
  const contextBlock = contextParts.length
    ? `\n\nContext:\n${contextParts.join("\n")}\n\nProvide 2-3 summary options (each on its own line) with short parenthetical notes when helpful.`
    : "\n\nProvide 2-3 summary options (each on its own line) with short parenthetical notes when helpful.";

  const systemContent = `${SYSTEM_PROMPT}${contextBlock}`;

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
    const model = serverEnv.OPENAI_MODEL || "gpt-4o-mini";
    const tokenLimit = buildCompletionTokenLimit(model, 400);
    const completion = await fetchOpenAI("/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        temperature: 0.65,
        ...tokenLimit,
        messages: mapMessages(parsed.data),
        user: ownerId,
      }),
    });

    const payload = (await completion.json().catch(() => null)) as {
      choices?: Array<{ message?: { content?: string } | null }>;
    } | null;

    if (!completion.ok) {
      console.error("ladder-summary.chat failure", payload);
      return returnError(502, "ai_error", "Capsule AI is unavailable right now.");
    }

    const message = payload?.choices?.[0]?.message?.content?.trim() ?? "";
    if (!message) {
      return returnError(502, "ai_error", "Capsule AI returned an empty response.");
    }

    return validatedJson(responseSchema, { message });
  } catch (error) {
    console.error("ladder-summary.chat error", error);
    return returnError(502, "ai_error", "Capsule AI failed to respond.");
  }
}

export const runtime = "nodejs";
