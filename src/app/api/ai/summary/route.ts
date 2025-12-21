import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { ensureUserFromRequest } from "@/lib/auth/payload";
import { summarizeFeedFromDB } from "@/lib/ai/prompter";
import { summarizeText } from "@/lib/ai/summary";
import { serverEnv } from "@/lib/env/server";
import { resolveToAbsoluteUrl } from "@/lib/url";
import { getOrCreateMemoryCaption } from "@/server/memories/caption-cache";
import { readSummaryCache, writeSummaryCache } from "@/server/summary-cache";
import {
  checkRateLimits,
  retryAfterSeconds as computeRetryAfterSeconds,
  type RateLimitDefinition,
} from "@/server/rate-limit";
import { resolveClientIp } from "@/server/http/ip";
import type { SummarySignaturePayload } from "@/lib/ai/summary-signature";
import type {
  SummaryApiResponse,
  SummaryAttachmentInput,
  SummaryLengthHint,
  SummaryRequestMeta,
  SummaryResult,
  SummaryTarget,
} from "@/types/summary";
import { parseJsonBody, returnError, validatedJson } from "@/server/validation/http";
import {
  chargeUsage,
  ensureFeatureAccess,
  resolveWalletContext,
  EntitlementError,
} from "@/server/billing/entitlements";
import { computeTextCreditsFromTokens, estimateTokensFromText } from "@/lib/billing/usage";

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

const SUMMARY_RATE_LIMIT: RateLimitDefinition = {
  name: "ai.summary",
  limit: 20,
  window: "10 m",
};

const SUMMARY_IP_RATE_LIMIT: RateLimitDefinition = {
  name: "ai.summary.ip",
  limit: 80,
  window: "10 m",
};

const SUMMARY_GLOBAL_RATE_LIMIT: RateLimitDefinition = {
  name: "ai.summary.global",
  limit: 250,
  window: "10 m",
};

type ParsedBody = z.infer<typeof requestSchema>;

function normalizeString(value?: string | null): string | null {
  return typeof value === "string" && value.trim().length ? value : null;
}

function normalizeAttachments(
  attachments: Array<z.infer<typeof attachmentSchema>> | undefined,
): SummaryAttachmentInput[] | null {
  if (!attachments?.length) return null;
  return attachments.map((attachment) => ({
    id: attachment.id,
    name: normalizeString(attachment.name),
    excerpt: attachment.excerpt ?? null,
    text: attachment.text ?? null,
    url: normalizeString(attachment.url),
    mimeType: normalizeString(attachment.mimeType),
    thumbnailUrl: normalizeString(attachment.thumbnailUrl),
  }));
}

function normalizeMeta(meta: ParsedBody["meta"]): SummaryRequestMeta | null {
  if (!meta) return null;
  return {
    title: normalizeString(meta.title ?? null),
    author: normalizeString(meta.author ?? null),
    audience: normalizeString(meta.audience ?? null),
    timeframe: normalizeString(meta.timeframe ?? null),
    capsuleId: normalizeString(meta.capsuleId ?? null),
  };
}

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

function mapSummaryResult(result: SummaryResult): SummaryApiResponse {
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
const IMAGE_EXTENSION_PATTERN = /\.(png|jpe?g|gif|webp|avif|heic|heif|bmp|tiff|dng)(\?|#|$)/i;
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
  ownerId: string,
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
        ownerId,
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
type SummaryHandlerResult = { payload: z.infer<typeof summaryResponseSchema>; tokensUsed: number };

async function handleFeedSummary(
  body: ParsedBody,
  ownerId: string,
): Promise<SummaryHandlerResult | NextResponse> {
  const providedSegments = collectSegments(body);
  const captionSegments = await buildAttachmentCaptionSegments(body.attachments, ownerId);
  const summarySegments = [...providedSegments, ...captionSegments];
  const normalizedAttachments = normalizeAttachments(body.attachments);
  const normalizedMeta = normalizeMeta(body.meta);

  const signaturePayload: SummarySignaturePayload = {
    target: "feed",
    capsuleId: body.capsuleId ?? body.meta?.capsuleId ?? null,
    hint: body.hint ?? null,
    limit: body.limit ?? null,
    segments: summarySegments,
    attachments: normalizedAttachments,
    meta: normalizedMeta,
  };

  const cached = await readSummaryCache(signaturePayload);
  if (cached) {
    // Cache hits already paid for; no new usage incurred.
    return { payload: cached, tokensUsed: 0 };
  }

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
    const payload = mapSummaryResult(summary);
    await writeSummaryCache(signaturePayload, payload);
    const tokensUsed =
      typeof summary.tokens === "number" && Number.isFinite(summary.tokens) ? summary.tokens : 0;
    return { payload, tokensUsed };
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
    const payload = mapSummaryResult(result);
    await writeSummaryCache(signaturePayload, payload);
    return { payload, tokensUsed: 0 };
  } catch (error) {
    console.error("summarizeFeedFromDB error", error);
    return returnError(502, "summary_failed", "Unable to summarize feed.");
  }
}

async function handleGenericSummary(
  body: ParsedBody,
  target: SummaryTarget,
  ownerId: string,
): Promise<SummaryHandlerResult | NextResponse> {
  const segments = collectSegments(body);
  const captionSegments = await buildAttachmentCaptionSegments(body.attachments, ownerId);
  const combinedSegments = [...segments, ...captionSegments];
  const normalizedAttachments = normalizeAttachments(body.attachments);
  const normalizedMeta = normalizeMeta(body.meta);

  const signaturePayload: SummarySignaturePayload = {
    target,
    capsuleId: body.capsuleId ?? body.meta?.capsuleId ?? null,
    hint: body.hint ?? null,
    limit: body.limit ?? null,
    segments: combinedSegments,
    attachments: normalizedAttachments,
    meta: normalizedMeta,
  };

  const cached = await readSummaryCache(signaturePayload);
  if (cached) {
    return { payload: cached, tokensUsed: 0 };
  }

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

  const payload = mapSummaryResult(summary);
  await writeSummaryCache(signaturePayload, payload);
  const tokensUsed = typeof summary.tokens === "number" && Number.isFinite(summary.tokens) ? summary.tokens : 0;
  return { payload, tokensUsed };
}

export async function POST(req: NextRequest) {
  const ownerId = await ensureUserFromRequest(req, null, { allowGuests: false });
  if (!ownerId) {
    return returnError(401, "auth_required", "Authentication required.");
  }

  const clientIp = resolveClientIp(req);
  const rateLimit = await checkRateLimits([
    { definition: SUMMARY_RATE_LIMIT, identifier: ownerId },
    { definition: SUMMARY_IP_RATE_LIMIT, identifier: clientIp ? `ip:${clientIp}` : null },
    { definition: SUMMARY_GLOBAL_RATE_LIMIT, identifier: "global:ai.summary" },
  ]);
  if (rateLimit && !rateLimit.success) {
    const retryAfterSeconds = computeRetryAfterSeconds(rateLimit.reset);
    return returnError(
      429,
      "rate_limited",
      "Too many summary requests right now. Please wait a moment and try again.",
      retryAfterSeconds == null ? undefined : { retryAfterSeconds },
    );
  }

  const parsed = await parseJsonBody(req, requestSchema);
  if (!parsed.success) {
    return parsed.response;
  }

  let walletContext: Awaited<ReturnType<typeof resolveWalletContext>> | null = null;
  try {
    walletContext = await resolveWalletContext({
      ownerType: "user",
      ownerId,
      supabaseUserId: ownerId,
      req,
      ensureDevCredits: true,
    });
    ensureFeatureAccess({
      balance: walletContext.balance,
      bypass: walletContext.bypass,
      requiredTier: "starter",
      featureName: "AI summaries",
    });
  } catch (billingError) {
    if (billingError instanceof EntitlementError) {
      return returnError(
        billingError.status,
        billingError.code,
        billingError.message,
        billingError.details,
      );
    }
    console.error("billing.summary.init_failed", billingError);
    return returnError(500, "billing_error", "Failed to verify summary allowance.");
  }

  const body = parsed.data;

  let handlerResult: SummaryHandlerResult | NextResponse;
  if (body.target === "feed") {
    handlerResult = await handleFeedSummary(body, ownerId);
  } else {
    handlerResult = await handleGenericSummary(body, body.target, ownerId);
  }

  if (handlerResult instanceof NextResponse) {
    return handlerResult;
  }

  const { payload, tokensUsed } = handlerResult;

  try {
    const effectiveTokens = tokensUsed || estimateTokensFromText(payload.summary);
    const computeCost = computeTextCreditsFromTokens(effectiveTokens, payload.model);
    if (walletContext && computeCost > 0 && !walletContext.bypass) {
      await chargeUsage({
        wallet: walletContext.wallet,
        balance: walletContext.balance,
        metric: "compute",
        amount: computeCost,
        reason: "ai.summary",
        bypass: walletContext.bypass,
      });
    }
  } catch (billingError) {
    if (billingError instanceof EntitlementError) {
      return returnError(
        billingError.status,
        billingError.code,
        billingError.message,
        billingError.details,
      );
    }
    console.error("billing.summary.charge_failed", billingError);
    return returnError(500, "billing_error", "Failed to record summary usage.");
  }

  return validatedJson(summaryResponseSchema, payload);
}

export const runtime = "nodejs";
