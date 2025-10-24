import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { ensureUserFromRequest } from "@/lib/auth/payload";
import { summarizeFeedFromDB } from "@/lib/ai/prompter";
import { summarizeText } from "@/lib/ai/summary";
import type { SummaryLengthHint, SummaryResult, SummaryTarget } from "@/types/summary";
import { parseJsonBody, returnError, validatedJson } from "@/server/validation/http";

const attachmentSchema = z.object({
  id: z.string(),
  name: z.string().optional(),
  excerpt: z.string().optional(),
  text: z.string().optional(),
});

const metaSchema = z.object({
  title: z.string().optional(),
  author: z.string().optional(),
  audience: z.string().optional(),
  timeframe: z.string().optional(),
  capsuleId: z.string().uuid().optional(),
});

const requestSchema = z.object({
  target: z.enum(["document", "feed", "text", "memory"]).default("text"),
  text: z.string().optional(),
  segments: z.array(z.string()).optional(),
  attachments: z.array(attachmentSchema).optional(),
  capsuleId: z.string().uuid().optional().nullable(),
  limit: z.number().int().min(1).max(50).optional(),
  hint: z.enum(["brief", "medium", "detailed"]).optional(),
  meta: metaSchema.partial().optional(),
});

const summaryResponseSchema = z.object({
  status: z.literal("ok"),
  summary: z.string(),
  highlights: z.array(z.string()),
  hashtags: z.array(z.string()),
  nextActions: z.array(z.string()),
  insights: z.array(z.string()),
  tone: z.string().nullable(),
  sentiment: z.string().nullable(),
  postTitle: z.string().nullable(),
  postPrompt: z.string().nullable(),
  wordCount: z.number().nullable(),
  model: z.string().nullable(),
  source: z.enum(["document", "feed", "text", "memory"]),
});

type ParsedBody = z.infer<typeof requestSchema>;

function collectSegments(body: ParsedBody): string[] {
  const segments: string[] = [];
  if (Array.isArray(body.segments)) {
    segments.push(...body.segments.filter((value): value is string => typeof value === "string"));
  }
  if (typeof body.text === "string") {
    segments.push(body.text);
  }
  if (Array.isArray(body.attachments)) {
    for (const attachment of body.attachments) {
      if (typeof attachment.text === "string" && attachment.text.trim().length) {
        segments.push(attachment.text);
      } else if (typeof attachment.excerpt === "string" && attachment.excerpt.trim().length) {
        segments.push(attachment.excerpt);
      }
    }
  }
  return segments;
}

function mapSummaryResult(result: SummaryResult): z.infer<typeof summaryResponseSchema> {
  return {
    status: "ok",
    summary: result.summary,
    highlights: result.highlights,
    hashtags: result.hashtags,
    nextActions: result.nextActions,
    insights: result.insights,
    tone: result.tone,
    sentiment: result.sentiment,
    postTitle: result.postTitle,
    postPrompt: result.postPrompt,
    wordCount: result.wordCount,
    model: result.model,
    source: result.source,
  };
}

async function handleFeedSummary(
  body: ParsedBody,
): Promise<z.infer<typeof summaryResponseSchema> | NextResponse> {
  const providedSegments = collectSegments(body);
  if (providedSegments.length) {
    const summaryInput: Parameters<typeof summarizeText>[0] = {
      target: "feed",
      segments: providedSegments,
      meta: {
        capsuleId: body.capsuleId ?? body.meta?.capsuleId ?? null,
        title: body.meta?.title ?? null,
        author: body.meta?.author ?? null,
        audience: body.meta?.audience ?? null,
        timeframe: body.meta?.timeframe ?? null,
      },
    };
    if (body.hint) {
      summaryInput.hint = body.hint as SummaryLengthHint;
    }
    const summary = await summarizeText(summaryInput);
    if (!summary) {
      return returnError(502, "summary_failed", "Unable to generate feed summary.");
    }
    return mapSummaryResult(summary);
  }

  try {
    const feed = await summarizeFeedFromDB({
      capsuleId: body.capsuleId ?? body.meta?.capsuleId ?? null,
      limit: body.limit ?? 30,
    });

    const result: SummaryResult = {
      summary: feed.message,
      highlights: feed.bullets,
      hashtags: [],
      nextActions: feed.next_actions,
      insights: [],
      tone: null,
      sentiment: null,
      postTitle: feed.suggestion?.title ?? null,
      postPrompt: feed.suggestion?.prompt ?? null,
      wordCount: null,
      model: null,
      source: "feed",
    };
    return mapSummaryResult(result);
  } catch (error) {
    console.error("summarizeFeedFromDB error", error);
    return returnError(502, "summary_failed", "Unable to summarize feed.");
  }
}

async function handleGenericSummary(
  body: ParsedBody,
  target: SummaryTarget,
): Promise<z.infer<typeof summaryResponseSchema> | NextResponse> {
  const segments = collectSegments(body);
  if (!segments.length) {
    return returnError(400, "missing_content", "No content provided to summarize.");
  }

  const summaryInput: Parameters<typeof summarizeText>[0] = {
    target,
    segments,
    meta: {
      capsuleId: body.capsuleId ?? body.meta?.capsuleId ?? null,
      title: body.meta?.title ?? null,
      author: body.meta?.author ?? null,
      audience: body.meta?.audience ?? null,
      timeframe: body.meta?.timeframe ?? null,
    },
  };
  if (body.hint) {
    summaryInput.hint = body.hint as SummaryLengthHint;
  }
  const summary = await summarizeText(summaryInput);

  if (!summary) {
    return returnError(502, "summary_failed", "Unable to generate summary.");
  }

  return mapSummaryResult(summary);
}

export async function POST(req: NextRequest) {
  const ownerId = await ensureUserFromRequest(req, null, { allowGuests: false });
  if (!ownerId) {
    return returnError(401, "auth_required", "Authentication required.");
  }

  const parsed = await parseJsonBody(req, requestSchema);
  if (!parsed.success) {
    return parsed.response;
  }

  const body = parsed.data;

  let payload: z.infer<typeof summaryResponseSchema> | NextResponse;
  if (body.target === "feed") {
    payload = await handleFeedSummary(body);
  } else {
    payload = await handleGenericSummary(body, body.target);
  }

  if (payload instanceof NextResponse) {
    return payload;
  }

  return validatedJson(summaryResponseSchema, payload);
}

export const runtime = "nodejs";
