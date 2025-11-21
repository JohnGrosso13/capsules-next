import "server-only";

import { z } from "zod";

import { hasOpenAIApiKey, postOpenAIJson } from "@/adapters/ai/openai/server";
import { buildCompletionTokenLimit } from "@/lib/ai/openai";
import { serverEnv } from "@/lib/env/server";
import type { SummaryLengthHint, SummaryRequestMeta, SummaryResult, SummaryTarget } from "@/types/summary";

const SUMMARY_SCHEMA_NAME = "capsule_summary";

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

type OpenAIChatContentPart =
  | string
  | {
      type?: string;
      text?: string;
      arguments?: string;
      json_schema?: { arguments?: string | null } | null;
      parsed?: Record<string, unknown>;
    };

type OpenAIChatMessage = {
  content?: string | OpenAIChatContentPart[] | null;
  tool_calls?: Array<{ function?: { arguments?: string | null } | null }> | null;
  parsed?: Record<string, unknown> | null;
};

type OpenAISummaryResponse = {
  choices?: Array<{ message?: OpenAIChatMessage | null }>;
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

function resolveSummaryPayload(candidate: unknown): z.infer<typeof SUMMARY_SCHEMA> | null {
  if (!candidate || typeof candidate !== "object") return null;
  try {
    return SUMMARY_SCHEMA.parse(candidate);
  } catch {
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
      return null;
    }
    const nested = (candidate as Record<string, unknown>)[SUMMARY_SCHEMA_NAME];
    if (!nested || typeof nested !== "object") {
      return null;
    }
    try {
      return SUMMARY_SCHEMA.parse(nested);
    } catch {
      return null;
    }
  }
}

function parseSummaryJson(raw: string | null): z.infer<typeof SUMMARY_SCHEMA> | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (!trimmed.length) return null;

  const attempts = new Set<string>();
  attempts.add(trimmed);

  if (trimmed.includes("```")) {
    const stripped = trimmed.replace(/```json|```/gi, "").trim();
    if (stripped.length) attempts.add(stripped);
  }

  const firstBrace = trimmed.indexOf("{");
  const lastBrace = trimmed.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    attempts.add(trimmed.slice(firstBrace, lastBrace + 1));
  }

  const nestedKeyIndex = trimmed.indexOf(`"${SUMMARY_SCHEMA_NAME}"`);
  if (nestedKeyIndex !== -1) {
    const nestedSlice = trimmed.slice(nestedKeyIndex);
    const nestedFirst = nestedSlice.indexOf("{");
    const nestedLast = nestedSlice.lastIndexOf("}");
    if (nestedFirst !== -1 && nestedLast > nestedFirst) {
      attempts.add(nestedSlice.slice(nestedFirst, nestedLast + 1));
    }
  }

  for (const attempt of attempts) {
    if (!attempt.length) continue;
    try {
      const parsed = JSON.parse(attempt);
      const resolved = resolveSummaryPayload(parsed);
      if (resolved) return resolved;
    } catch {
      continue;
    }
  }

  return null;
}

function collectMessageContent(message: OpenAIChatMessage | null | undefined): string[] {
  if (!message) return [];
  const collected: string[] = [];

  const push = (value: string | null | undefined) => {
    if (typeof value === "string") {
      const trimmed = value.trim();
      if (trimmed.length) collected.push(trimmed);
    }
  };

  const { content, tool_calls: toolCalls } = message ?? {};
  if (typeof content === "string" && content.trim().length) {
    collected.push(content);
  } else if (Array.isArray(content)) {
    for (const part of content) {
      if (!part) continue;
      if (typeof part === "string") {
        push(part);
        continue;
      }
      if (typeof part.text === "string") push(part.text);
      if (typeof part.arguments === "string") push(part.arguments);
      const schemaArgs = part.json_schema?.arguments;
      if (typeof schemaArgs === "string") push(schemaArgs);
      if (part.parsed && typeof part.parsed === "object") {
        push(JSON.stringify(part.parsed));
      }
    }
  }

  if (message?.parsed && typeof message.parsed === "object") {
    push(JSON.stringify(message.parsed));
  }

  if (Array.isArray(toolCalls)) {
    for (const call of toolCalls) {
      const args = call?.function?.arguments;
      if (typeof args === "string") push(args);
    }
  }

  return collected;
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

  const tokenLimit = buildCompletionTokenLimit(model, 480);

  const body = {
    model,
    temperature: 0.3,
    ...tokenLimit,
    response_format: {
      type: "json_schema",
      json_schema: {
        name: SUMMARY_SCHEMA_NAME,
        strict: true,
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

  const message = result.data.choices?.[0]?.message ?? null;
  let candidates = collectMessageContent(message);

  if (!candidates.length && result.parsedBody) {
    try {
      const bodyData = result.parsedBody as Record<string, unknown>;
      const extra: string[] = [];

      const choiceMessage = (bodyData?.choices as Array<{ message?: OpenAIChatMessage }>)?.[0]?.message;
      if (choiceMessage?.parsed && typeof choiceMessage.parsed === "object") {
        extra.push(JSON.stringify(choiceMessage.parsed));
      }

      const outputParsed = bodyData?.output_parsed;
      if (outputParsed && typeof outputParsed === "object") {
        extra.push(JSON.stringify(outputParsed));
      }

      const outputText = bodyData?.output_text;
      if (typeof outputText === "string" && outputText.trim().length) {
        extra.push(outputText.trim());
      }

      const outputEntries: Array<{ content?: OpenAIChatContentPart[] | null }> = Array.isArray(
        bodyData?.output,
      )
        ? (bodyData.output as Array<{ content?: OpenAIChatContentPart[] | null }>)
        : [];
      for (const entry of outputEntries) {
        const contentParts = Array.isArray(entry?.content) ? entry.content : [];
        for (const part of contentParts) {
          if (!part) continue;
          if (typeof part === "string") {
            const trimmed = part.trim();
            if (trimmed.length) {
              extra.push(trimmed);
            }
            continue;
          }
          if (typeof part.text === "string" && part.text.trim().length) {
            extra.push(part.text.trim());
          }
          if (part.parsed && typeof part.parsed === "object") {
            extra.push(JSON.stringify(part.parsed));
          }
          if (typeof part.arguments === "string" && part.arguments.trim().length) {
            extra.push(part.arguments.trim());
          }
        }
      }

      if (extra.length) {
        candidates = extra;
      }
    } catch {
      // ignore parsedBody issues
    }
  }

  let parsed: z.infer<typeof SUMMARY_SCHEMA> | null = null;
  for (const candidate of candidates) {
    parsed = parseSummaryJson(candidate);
    if (parsed) break;
  }

  if (!parsed) {
    console.warn("summarizeText parse failure", {
      candidateCount: candidates.length,
      candidateLengths: candidates.map((value) => value.length),
    });
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
    typeof parsed.suggested_post_prompt === "string" && parsed.suggested_post_prompt.trim().length
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

