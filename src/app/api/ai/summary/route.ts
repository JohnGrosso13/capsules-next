import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { ensureUserFromRequest } from "@/lib/auth/payload";
import { summarizeFeedFromDB } from "@/lib/ai/prompter";
import { summarizeText } from "@/lib/ai/summary";
import { serverEnv } from "@/lib/env/server";
import { resolveToAbsoluteUrl } from "@/lib/url";
import { getOrCreateMemoryCaption } from "@/server/memories/caption-cache";
import type { SummaryLengthHint, SummaryResult, SummaryTarget } from "@/types/summary";
import { parseJsonBody, returnError, validatedJson } from "@/server/validation/http";

const attachmentSchema = z.object({
  id: z.string(),
  name: z.string().optional(),
  excerpt: z.string().optional().nullable(),
  text: z.string().optional().nullable(),
  url: z.string().optional().nullable(),
  mimeType: z.string().optional().nullable(),
  thumbnailUrl: z.string().optional().nullable(),
});

const metaSchema = z.object({
  title: z.string().optional(),
  author: z.string().optional(),
  audience: z.string().optional(),
  timeframe: z.string().optional(),
  capsuleId: z.string().uuid().optional(),
});

const requestSchema = z.object({
  target: z.enum(["document", "feed", "text", "memory", "party"]).default("text"),
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
  source: z.enum(["document", "feed", "text", "memory", "party"]),
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

const MAX_CAPTION_ATTACHMENTS = 6;
const IMAGE_EXTENSION_PATTERN = /\.(png|jpe?g|gif|webp|avif|heic|heif|bmp|tiff)(\?|#|$)/i;
const VIDEO_EXTENSION_PATTERN = /\.(mp4|m4v|mov|webm|ogv|ogg|mkv)(\?|#|$)/i;

function isLikelyImageAttachment(mimeType: string | null | undefined, url: string): boolean {
  const normalized = (mimeType ?? "").toLowerCase();
  if (normalized.startsWith("image/") || normalized.startsWith("video/")) return true;
  const lowered = url.toLowerCase();
  if (IMAGE_EXTENSION_PATTERN.test(lowered)) return true;
  if (VIDEO_EXTENSION_PATTERN.test(lowered)) return true;
  return false;
}

async function buildAttachmentCaptionSegments(
  attachments: Array<z.infer<typeof attachmentSchema>> | undefined,
): Promise<string[]> {
  if (!attachments?.length) return [];
  const segments: string[] = [];
  const seen = new Set<string>();

  for (const attachment of attachments) {
    if (segments.length >= MAX_CAPTION_ATTACHMENTS) break;

    const providedText =
      (typeof attachment.text === "string" && attachment.text.trim().length > 0) ||
      (typeof attachment.excerpt === "string" && attachment.excerpt.trim().length > 0);
    if (providedText) continue;

    const rawUrl = typeof attachment.url === "string" ? attachment.url.trim() : "";
    if (!rawUrl.length) continue;

    const absoluteUrl = resolveToAbsoluteUrl(rawUrl, serverEnv.SITE_URL) ?? rawUrl;
    if (!absoluteUrl.length || seen.has(absoluteUrl)) continue;

    const absoluteThumb =
      typeof attachment.thumbnailUrl === "string" && attachment.thumbnailUrl.trim().length
        ? resolveToAbsoluteUrl(attachment.thumbnailUrl.trim(), serverEnv.SITE_URL) ?? attachment.thumbnailUrl.trim()
        : null;

    if (!isLikelyImageAttachment(attachment.mimeType, absoluteUrl)) continue;

    try {
      const caption = await getOrCreateMemoryCaption({
        memoryId:
          typeof attachment.id === "string" && attachment.id.trim().length
            ? attachment.id.trim()
            : null,
        mediaUrl: absoluteUrl,
        mimeType:
          typeof attachment.mimeType === "string" && attachment.mimeType.trim().length
            ? attachment.mimeType
            : null,
        thumbnailUrl: absoluteThumb,
      });
      if (!caption) continue;
      seen.add(absoluteUrl);
      const label =
        typeof attachment.name === "string" && attachment.name.trim().length
          ? attachment.name.trim()
          : "Feed attachment";
      segments.push(`Attachment "${label}": ${caption}`);
    } catch (error) {
      console.warn("attachment caption generation failed", absoluteUrl, error);
    }
  }

  return segments;
}
async function handleFeedSummary(
  body: ParsedBody,
): Promise<z.infer<typeof summaryResponseSchema> | NextResponse> {
  const providedSegments = collectSegments(body);
  const captionSegments = await buildAttachmentCaptionSegments(body.attachments);
  const summarySegments = [...providedSegments, ...captionSegments];

  if (summarySegments.length) {
    const summaryInput: Parameters<typeof summarizeText>[0] = {
      target: "feed",
      segments: summarySegments,
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
  const captionSegments = await buildAttachmentCaptionSegments(body.attachments);
  const combinedSegments = [...segments, ...captionSegments];

  if (!combinedSegments.length) {
    return returnError(400, "missing_content", "No content provided to summarize.");
  }

  const summaryInput: Parameters<typeof summarizeText>[0] = {
    target,
    segments: combinedSegments,
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
