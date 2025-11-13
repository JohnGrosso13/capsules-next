import { z } from "zod";

import { fetchOpenAI, hasOpenAIApiKey } from "@/adapters/ai/openai/server";
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
  mode: z.string().trim().max(160).optional().nullable(),
  platform: z.string().trim().max(160).optional().nullable(),
  region: z.string().trim().max(160).optional().nullable(),
  cadence: z.string().trim().max(160).optional().nullable(),
  summary: z.string().trim().max(360).optional().nullable(),
});

const responseSchema = z.object({
  message: z.string(),
});

const SYSTEM_PROMPT =
  "You are Capsule AI, a competition designer who helps community leaders plan ladder formats. Offer clear, welcoming guidance with concrete match structures, roster sizes, and scheduling tips.";

function mapMessages(
  data: z.infer<typeof requestSchema>,
): Array<{ role: "system" | "user" | "assistant"; content: string }> {
  const { messages, capsuleName, gameTitle, mode, platform, region, cadence, summary } = data;
  const contextParts = [
    capsuleName ? `Capsule: ${capsuleName}` : null,
    gameTitle ? `Game: ${gameTitle}` : null,
    mode ? `Preferred format: ${mode}` : null,
    platform ? `Platform: ${platform}` : null,
    region ? `Region: ${region}` : null,
    cadence ? `Cadence: ${cadence}` : null,
    summary ? `Summary: ${summary}` : null,
  ].filter((value): value is string => Boolean(value && value.trim().length));
  const contextBlock = contextParts.length ? `\n\nContext:\n${contextParts.join("\n")}` : "";
  const systemContent = `${SYSTEM_PROMPT}${contextBlock}\n\nProvide 2-3 actionable suggestions. Each line should contain a proposed format followed by a short parenthetical note.`;

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
        temperature: 0.65,
        max_tokens: 420,
        messages: mapMessages(parsed.data),
        user: ownerId,
      }),
    });

    const payload = (await completion.json().catch(() => null)) as {
      choices?: Array<{ message?: { content?: string } | null }>;
    } | null;

    if (!completion.ok) {
      console.error("ladder-format.chat failure", payload);
      return returnError(502, "ai_error", "Capsule AI is unavailable right now.");
    }

    const message = payload?.choices?.[0]?.message?.content?.trim() ?? "";
    if (!message) {
      return returnError(502, "ai_error", "Capsule AI returned an empty response.");
    }

    return validatedJson(responseSchema, { message });
  } catch (error) {
    console.error("ladder-format.chat error", error);
    return returnError(502, "ai_error", "Capsule AI failed to respond.");
  }
}

export const runtime = "nodejs";
