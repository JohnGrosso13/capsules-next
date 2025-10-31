import { NextRequest } from "next/server";
import { z } from "zod";

import { ensureUserFromRequest } from "@/lib/auth/payload";
import { hasOpenAIApiKey, postOpenAIJson } from "@/adapters/ai/openai/server";
import { returnError, validatedJson } from "@/server/validation/http";
import type { CapsuleHistoryPeriod } from "@/types/capsules";

const paramsSchema = z.object({
  id: z.string().uuid("capsule id must be a valid UUID"),
});

const timelineItemSchema = z.object({
  label: z.string(),
  detail: z.string(),
  timestamp: z.string().nullable().optional().default(null),
});

const requestSchema = z.object({
  period: z.enum(["weekly", "monthly", "all_time"]),
  capsuleName: z.string().optional().nullable(),
  postCount: z.number().int().min(0).max(500).optional(),
  summary: z.string().optional(),
  highlights: z.array(z.string()).optional(),
  timeline: z.array(timelineItemSchema).optional(),
  nextFocus: z.array(z.string()).optional(),
  timeframe: z
    .object({
      start: z.string().nullable().optional().default(null),
      end: z.string().nullable().optional().default(null),
    })
    .optional(),
});

const aiHintSchema = z.object({
  summary_hint: z.string(),
  timeline_hint: z.string(),
  articles_hint: z.string(),
});

const responseSchema = z.object({
  summary: z.string(),
  timeline: z.string(),
  articles: z.string(),
});

type HintResponse = z.infer<typeof responseSchema>;

type NormalizedHintInput = {
  period: CapsuleHistoryPeriod;
  capsuleName: string | null;
  postCount: number;
  summary: string;
  highlights: string[];
  timeline: Array<{ label: string; detail: string; timestamp: string | null }>;
  nextFocus: string[];
  timeframe: { start: string | null; end: string | null };
};

type OpenAIChatResponse = {
  choices?: Array<{ message?: { content?: string | null } | null }>;
};

const MAX_SECTION_TEXT = 600;
const MAX_LIST_ITEM_LENGTH = 240;
const MAX_LIST_ITEMS = 6;

function sanitizeText(value: string | null | undefined, limit = MAX_SECTION_TEXT): string {
  if (typeof value !== "string") return "";
  const normalized = value.replace(/\s+/g, " ").trim();
  if (!normalized.length) return "";
  return normalized.slice(0, limit);
}

function sanitizeStringList(values: string[] | undefined, limit = MAX_LIST_ITEMS): string[] {
  if (!Array.isArray(values)) return [];
  const output: string[] = [];
  for (const entry of values) {
    const text = sanitizeText(entry, MAX_LIST_ITEM_LENGTH);
    if (!text.length) continue;
    output.push(text);
    if (output.length >= limit) break;
  }
  return output;
}

function sanitizeTimeline(
  items: Array<{ label: string; detail: string; timestamp: string | null }> | undefined,
  limit = MAX_LIST_ITEMS,
): Array<{ label: string; detail: string; timestamp: string | null }> {
  if (!Array.isArray(items)) return [];
  const output: Array<{ label: string; detail: string; timestamp: string | null }> = [];
  for (const item of items) {
    const label = sanitizeText(item?.label ?? "", 120);
    const detail = sanitizeText(item?.detail ?? "", MAX_LIST_ITEM_LENGTH);
    if (!label.length && !detail.length) continue;
    output.push({
      label,
      detail,
      timestamp: typeof item?.timestamp === "string" && item.timestamp.trim().length
        ? item.timestamp.trim()
        : null,
    });
    if (output.length >= limit) break;
  }
  return output;
}

function normalizeHintInput(input: z.infer<typeof requestSchema>): NormalizedHintInput {
  return {
    period: input.period,
    capsuleName:
      typeof input.capsuleName === "string" && input.capsuleName.trim().length
        ? input.capsuleName.trim()
        : null,
    postCount: typeof input.postCount === "number" && Number.isFinite(input.postCount)
      ? Math.max(0, Math.min(500, Math.trunc(input.postCount)))
      : 0,
    summary: sanitizeText(input.summary ?? ""),
    highlights: sanitizeStringList(input.highlights),
    timeline: sanitizeTimeline(input.timeline),
    nextFocus: sanitizeStringList(input.nextFocus),
    timeframe: {
      start:
        typeof input.timeframe?.start === "string" && input.timeframe.start.trim().length
          ? input.timeframe.start.trim()
          : null,
      end:
        typeof input.timeframe?.end === "string" && input.timeframe.end.trim().length
          ? input.timeframe.end.trim()
          : null,
    },
  };
}

function buildFallbackHints(input: NormalizedHintInput): HintResponse {
  const { postCount, summary, highlights, timeline, nextFocus } = input;
  const summaryHint =
    postCount === 0
      ? "No updates landed this period—share a quick milestone or reflection to keep the capsule feeling alive."
      : summary.length < 160
        ? "Tighten the summary with one bold takeaway so members immediately see the impact of this period."
        : "Great momentum—consider opening the summary with the biggest community win to celebrate your members.";

  const timelineHint =
    timeline.length === 0
      ? "Timeline is empty—drop in a standout event or post so readers can trace what happened at a glance."
      : timeline.length > 4
        ? "Timeline is getting dense—feature the top 3 moments and tuck deeper details into linked posts."
        : "Tie each timeline entry to a clear action or link so members can jump back into the conversation easily.";

  const articlesHint =
    highlights.length === 0
      ? "No spotlighted articles yet—pin a recent post or recap to guide members toward the conversation."
      : highlights.length > 5
        ? "You have lots of highlights—group related updates or merge sentences so the list stays scannable."
        : nextFocus.length
            ? "Connect your highlights to the next focus items so members understand what to do after reading."
            : "Invite members to react or comment on your highlighted posts to spark more replies this week.";

  return {
    summary: summaryHint,
    timeline: timelineHint,
    articles: articlesHint,
  };
}

function stripFence(raw: string | null | undefined): string {
  if (!raw) return "";
  return raw.replace(/```json|```/gi, "").trim();
}

async function requestAiHints(input: NormalizedHintInput): Promise<HintResponse | null> {
  if (!hasOpenAIApiKey()) return null;

  const body = {
    model: "gpt-4o-mini",
    temperature: 0.6,
    max_tokens: 320,
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "capsule_history_hints",
        schema: {
          type: "object",
          additionalProperties: false,
          required: ["summary_hint", "timeline_hint", "articles_hint"],
          properties: {
            summary_hint: { type: "string", description: "Advice focused on improving the written summary." },
            timeline_hint: { type: "string", description: "Advice about the timeline events coverage." },
            articles_hint: { type: "string", description: "Advice that references the highlighted articles/posts." },
          },
        },
      },
    },
    messages: [
      {
        role: "system",
        content:
          "You are Capsule AI, a strategic community assistant. Give concise, encouraging engagement advice (<=180 chars each) tailored to the provided capsule history data.",
      },
      {
        role: "user",
        content: JSON.stringify({
          period: input.period,
          capsule_name: input.capsuleName,
          post_count: input.postCount,
          summary: input.summary,
          highlights: input.highlights,
          timeline: input.timeline,
          next_focus: input.nextFocus,
          timeframe: input.timeframe,
        }),
      },
    ],
  };

  const result = await postOpenAIJson<OpenAIChatResponse>("/chat/completions", body);
  if (!result.ok || !result.data) {
    console.error("capsules.history.hints openai_error", result.status, result.rawBody);
    return null;
  }

  const content = stripFence(result.data.choices?.[0]?.message?.content);
  if (!content) {
    return null;
  }

  let parsed: z.infer<typeof aiHintSchema>;
  try {
    parsed = aiHintSchema.parse(JSON.parse(content));
  } catch (error) {
    console.warn("capsules.history.hints parse_error", error);
    return null;
  }

  return {
    summary: sanitizeText(parsed.summary_hint, 220),
    timeline: sanitizeText(parsed.timeline_hint, 220),
    articles: sanitizeText(parsed.articles_hint, 220),
  };
}

async function generateHints(input: NormalizedHintInput): Promise<HintResponse> {
  try {
    const aiHints = await requestAiHints(input);
    if (aiHints) {
      return aiHints;
    }
  } catch (error) {
    console.error("capsules.history.hints ai_generation_failed", error);
  }
  return buildFallbackHints(input);
}

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const viewerId = await ensureUserFromRequest(req, null, { allowGuests: false });
  if (!viewerId) {
    return returnError(401, "auth_required", "Authentication required.");
  }

  const rawParams = await context.params;
  const parsedParams = paramsSchema.safeParse(rawParams ?? {});
  if (!parsedParams.success) {
    return returnError(400, "invalid_request", "Invalid capsule id.", parsedParams.error.flatten());
  }

  let body: z.infer<typeof requestSchema>;
  try {
    body = requestSchema.parse(await req.json());
  } catch {
    return returnError(400, "invalid_request", "Invalid request body.");
  }

  const normalized = normalizeHintInput(body);
  const hints = await generateHints(normalized);
  return validatedJson(responseSchema, hints);
}

export const runtime = "nodejs";
