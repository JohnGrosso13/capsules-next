import "server-only";

import { z } from "zod";

import { hasOpenAIApiKey, postOpenAIJson } from "@/adapters/ai/openai/server";
import { serverEnv } from "@/lib/env/server";
import type { SummaryLengthHint, SummaryRequestMeta, SummaryResult, SummaryTarget } from "@/types/summary";

const SUMMARY_SCHEMA = z.object({
  summary: z.string(),
  highlights: z.array(z.string()).max(10).optional(),
  insights: z.array(z.string()).max(10).optional(),
  hashtags: z.array(z.string()).max(12).optional(),
  next_actions: z.array(z.string()).max(10).optional(),
  tone: z.string().optional(),
  sentiment: z.string().optional(),
  suggested_title: z.string().optional(),
  suggested_post_prompt: z.string().optional(),
  word_count: z.number().int().min(0).max(2000).optional(),
});

type OpenAISummaryResponse = {
  choices?: Array<{ message?: { content?: string | null } | null }>;
  usage?: { total_tokens?: number };
};

type SummarizeTextInput = {
  target: SummaryTarget;
  segments: string[];
  hint?: SummaryLengthHint;
  meta?: SummaryRequestMeta | null;
};

type SanitizedSummary = SummaryResult & { tokens: number | null };

const MAX_SEGMENT_LENGTH = 4000;
const MAX_JOINED_LENGTH = 12000;

function sanitizeSegment(value: string): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.replace(/\s+/g, " ").trim();
  if (!trimmed.length) return null;
  return trimmed.slice(0, MAX_SEGMENT_LENGTH);
}

function buildTextPayload(segments: string[]): string {
  const collected: string[] = [];
  let totalLength = 0;
  for (const segment of segments) {
    if (!segment) continue;
    const remaining = MAX_JOINED_LENGTH - totalLength;
    if (remaining <= 0) break;
    const snippet = segment.length > remaining ? segment.slice(0, remaining) : segment;
    collected.push(snippet);
    totalLength += snippet.length + 2;
  }
  return collected.join("\n\n");
}

function sanitizeStringArray(values: unknown, maxLength: number, maxItems = 10): string[] {
  if (!Array.isArray(values)) return [];
  const output: string[] = [];
  for (const entry of values) {
    if (typeof entry !== "string") continue;
    const normalized = entry.replace(/\s+/g, " ").trim();
    if (!normalized.length) continue;
    output.push(normalized.slice(0, maxLength));
    if (output.length >= maxItems) break;
  }
  return output;
}

function parseSummaryJson(raw: string | null): z.infer<typeof SUMMARY_SCHEMA> | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed.length) return null;
  try {
    return SUMMARY_SCHEMA.parse(JSON.parse(trimmed));
  } catch {
    try {
      return SUMMARY_SCHEMA.parse(JSON.parse(trimmed.replace(/```json|```/g, "")));
    } catch {
      return null;
    }
  }
}

export async function summarizeText(input: SummarizeTextInput): Promise<SanitizedSummary | null> {
  if (!hasOpenAIApiKey()) return null;

  const segments = input.segments
    .map((segment) => sanitizeSegment(segment))
    .filter((segment): segment is string => Boolean(segment));

  if (!segments.length) {
    return null;
  }

  const textPayload = buildTextPayload(segments);
  if (!textPayload.length) {
    return null;
  }

  const model = serverEnv.OPENAI_MODEL || "gpt-4o-mini";

  const body = {
    model,
    temperature: 0.3,
    max_tokens: 480,
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "capsule_summary",
        schema: {
          type: "object",
          additionalProperties: false,
          required: ["summary"],
          properties: {
            summary: { type: "string" },
            highlights: {
              type: "array",
              items: { type: "string" },
              maxItems: 10,
            },
            insights: {
              type: "array",
              items: { type: "string" },
              maxItems: 10,
            },
            hashtags: {
              type: "array",
              items: { type: "string" },
              maxItems: 12,
            },
            next_actions: {
              type: "array",
              items: { type: "string" },
              maxItems: 10,
            },
            tone: { type: "string" },
            sentiment: { type: "string" },
            suggested_title: { type: "string" },
            suggested_post_prompt: { type: "string" },
            word_count: { type: "integer", minimum: 0, maximum: 2000 },
          },
        },
        strict: true,
      },
    },
    messages: [
      {
        role: "system",
        content:
          "You are Capsule AI, an assistant that writes warm, succinct summaries with actionable highlights. Always respond with JSON that matches the provided schema.",
      },
      {
        role: "user",
        content: JSON.stringify({
          target: input.target,
          tone_hint: input.meta?.audience ?? null,
          length: input.hint ?? "medium",
          meta: input.meta ?? null,
          text: textPayload,
        }),
      },
    ],
  };

  const result = await postOpenAIJson<OpenAISummaryResponse>("/chat/completions", body);
  if (!result.ok || !result.data) {
    console.error("summarizeText OpenAI error", result.status, result.rawBody);
    return null;
  }

  const content = result.data.choices?.[0]?.message?.content ?? null;
  const parsed = parseSummaryJson(content);
  if (!parsed) {
    console.warn("summarizeText parse failure");
    return null;
  }

  const summary = parsed.summary.trim();
  const highlights = sanitizeStringArray(parsed.highlights, 160, 8);
  const insights = sanitizeStringArray(parsed.insights, 160, 6);
  const hashtags = sanitizeStringArray(parsed.hashtags, 64, 12).map((tag) =>
    tag.startsWith("#") ? tag : `#${tag.replace(/^[#]+/, "")}`,
  );
  const nextActions = sanitizeStringArray(parsed.next_actions, 160, 6);
  const tone =
    typeof parsed.tone === "string" && parsed.tone.trim().length ? parsed.tone.trim() : null;
  const sentiment =
    typeof parsed.sentiment === "string" && parsed.sentiment.trim().length
      ? parsed.sentiment.trim()
      : null;
  const postTitle =
    typeof parsed.suggested_title === "string" && parsed.suggested_title.trim().length
      ? parsed.suggested_title.trim()
      : null;
  const postPrompt =
    typeof parsed.suggested_post_prompt === "string" &&
    parsed.suggested_post_prompt.trim().length
      ? parsed.suggested_post_prompt.trim()
      : null;
  const wordCount =
    typeof parsed.word_count === "number" && Number.isFinite(parsed.word_count)
      ? parsed.word_count
      : null;

  const tokens =
    typeof result.data.usage?.total_tokens === "number" && Number.isFinite(result.data.usage.total_tokens)
      ? result.data.usage.total_tokens
      : null;

  const sanitized: SanitizedSummary = {
    summary,
    highlights,
    hashtags,
    nextActions,
    insights,
    tone,
    sentiment,
    postTitle,
    postPrompt,
    wordCount,
    model,
    source: input.target,
    tokens,
  };

  return sanitized;
}
