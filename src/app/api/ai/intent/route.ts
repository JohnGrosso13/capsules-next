import { NextResponse } from "next/server";

import { detectIntentHeuristically, intentLabel, normalizeIntent } from "@/lib/ai/intent";
import { serverEnv } from "@/lib/env/server";

const FALLBACK_THRESHOLD = 0.6;

type IntentPayload = {
  intent: string;
  confidence: number;
  reason?: string;
  source: "heuristic" | "ai" | "none";
};

function asPayload(result: ReturnType<typeof detectIntentHeuristically>): IntentPayload {
  return {
    intent: result.intent,
    confidence: result.confidence,
    reason: result.reason,
    source: result.source,
  };
}

async function classifyWithLLM(message: string): Promise<IntentPayload | null> {
  if (!serverEnv.OPENAI_API_KEY) {
    return null;
  }
  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${serverEnv.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: serverEnv.OPENAI_MODEL,
        temperature: 0,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content:
              "You are an intent classifier for the Capsules app. Respond with JSON {\"intent\": \"post|navigate|generate\", \"confidence\": number between 0 and 1, \"reason\": string}. Use \"post\" for requests to share, publish, post, or draft content. Use \"navigate\" for requests to go to a page, open a section, or switch context. Use \"generate\" for everything else.",
          },
          {
            role: "user",
            content: message,
          },
        ],
      }),
    });
    const data = (await response.json().catch(() => null)) as
      | { choices?: Array<{ message?: { content?: string } }>; error?: unknown }
      | null;

    if (!response.ok || !data?.choices?.[0]?.message?.content) {
      console.error("Intent classifier OpenAI error", data?.error || data);
      return null;
    }

    const text = data.choices[0].message!.content!.trim();
    let parsed: { intent?: string; confidence?: number; reason?: string } | null = null;
    try {
      parsed = JSON.parse(text);
    } catch (error) {
      console.error("Intent classifier parse error", text, error);
      return null;
    }
    const intent = normalizeIntent(parsed?.intent);
    const confidence = typeof parsed?.confidence === "number" ? parsed!.confidence : 0.5;
    return {
      intent,
      confidence: Math.max(0, Math.min(1, confidence)),
      reason: parsed?.reason || `Classified as ${intentLabel(intent)}`,
      source: "ai",
    };
  } catch (error) {
    console.error("Intent classifier request error", error);
    return null;
  }
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as { message?: unknown } | null;
  const text = typeof body?.message === "string" ? body.message.trim() : "";
  if (!text) {
    return NextResponse.json({ error: "Message is required" }, { status: 400 });
  }
  if (text.length > 2000) {
    return NextResponse.json({ error: "Message too long" }, { status: 400 });
  }

  const heuristic = detectIntentHeuristically(text);
  if (heuristic.intent !== "generate" && heuristic.confidence >= FALLBACK_THRESHOLD) {
    return NextResponse.json(asPayload(heuristic));
  }

  const ai = await classifyWithLLM(text);
  if (ai) {
    return NextResponse.json(ai);
  }

  return NextResponse.json(asPayload(heuristic));
}
