import { z } from "zod";

import { parseJsonBody, validatedJson, returnError } from "@/server/validation/http";
import { detectIntentHeuristically, normalizeIntent } from "@/lib/ai/intent";
import { hasOpenAIApiKey, postOpenAIJson } from "@/adapters/ai/openai/server";
import { buildCompletionTokenLimit } from "@/lib/ai/openai";
import { serverEnv } from "@/lib/env/server";
import {
  checkRateLimits,
  retryAfterSeconds as computeRetryAfterSeconds,
  type RateLimitDefinition,
} from "@/server/rate-limit";
import { resolveClientIp } from "@/server/http/ip";
import { ensureUserFromRequest } from "@/lib/auth/payload";
import {
  chargeUsage,
  ensureFeatureAccess,
  resolveWalletContext,
  EntitlementError,
} from "@/server/billing/entitlements";
import { computeTextCreditsFromTokens, estimateTokensFromText } from "@/lib/billing/usage";

const requestSchema = z.object({ message: z.string().min(1) });

const responseSchema = z.object({
  intent: z.enum(["chat", "generate", "post", "navigate", "style"]).optional(),
  confidence: z.number().min(0).max(1).optional(),
  reason: z.string().optional(),
  source: z.enum(["heuristic", "ai", "none"]).optional(),
  postMode: z.enum(["ai", "manual"]).optional(),
});

type ClassifiedIntent = {
  intent: "chat" | "generate" | "post" | "navigate" | "style";
  postMode?: "ai" | "manual";
  confidence?: number;
  reason?: string;
};

const FALLBACK_RESPONSE: ClassifiedIntent = {
  intent: "chat",
  confidence: 0.4,
  reason: "Handing off to AI to infer the right intent.",
};

const INTENT_RATE_LIMIT: RateLimitDefinition = {
  name: "ai.intent",
  limit: 60,
  window: "5 m",
};

const INTENT_IP_RATE_LIMIT: RateLimitDefinition = {
  name: "ai.intent.ip",
  limit: 200,
  window: "5 m",
};

function clampConfidence(value: unknown, fallback: number): number {
  const num = typeof value === "number" && Number.isFinite(value) ? value : fallback;
  return Math.max(0, Math.min(1, num));
}

export async function POST(req: Request) {
  const userId = await ensureUserFromRequest(req, {}, { allowGuests: false });
  if (!userId) {
    return returnError(401, "auth_required", "Sign in to classify intent.");
  }

  const clientIp = resolveClientIp(req);
  const rateLimit = await checkRateLimits([
    { definition: INTENT_RATE_LIMIT, identifier: "intent:global" },
    { definition: INTENT_IP_RATE_LIMIT, identifier: clientIp ? `ip:${clientIp}` : null },
  ]);
  if (rateLimit && !rateLimit.success) {
    const retryAfterSeconds = computeRetryAfterSeconds(rateLimit.reset);
    return returnError(
      429,
      "rate_limited",
      "Too many intent requests. Please wait a moment.",
      retryAfterSeconds == null ? undefined : { retryAfterSeconds },
    );
  }

  const parsed = await parseJsonBody(req, requestSchema);
  if (!parsed.success) return parsed.response;

  const text = parsed.data.message.trim();
  const heuristic = detectIntentHeuristically(text);

  let walletContext: Awaited<ReturnType<typeof resolveWalletContext>> | null = null;
  try {
    walletContext = await resolveWalletContext({
      ownerType: "user",
      ownerId: userId,
      supabaseUserId: userId,
      req,
      ensureDevCredits: true,
    });
    ensureFeatureAccess({
      balance: walletContext.balance,
      bypass: walletContext.bypass,
      requiredTier: "starter",
      featureName: "Intent classification",
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
    console.error("billing.intent.init_failed", billingError);
    return returnError(500, "billing_error", "Failed to verify intent allowance.");
  }

  if (!hasOpenAIApiKey()) {
    return validatedJson(responseSchema, {
      intent: heuristic.intent,
      confidence: heuristic.confidence,
      reason: heuristic.reason ?? FALLBACK_RESPONSE.reason,
      source: "heuristic",
    });
  }

  const model = serverEnv.OPENAI_MODEL_NANO ?? serverEnv.OPENAI_MODEL ?? "gpt-4o-mini";
  const tokenLimit = buildCompletionTokenLimit(model, 200);
  const body = {
    model,
    response_format: { type: "json_object" },
    temperature: 0,
    ...tokenLimit,
    messages: [
      {
        role: "system",
        content:
          "You are an intent classifier for a social app. Output JSON only with keys: intent (chat|generate|post|navigate|style), optional postMode (ai|manual) where postMode=ai means draft/ask-the-AI-to-write, postMode=manual means publish existing content, confidence (0-1), reason (short). Never include any text outside JSON.",
      },
      {
        role: "user",
        content: [
          "Classify the user request into one intent. Rules:",
          "- post (postMode=manual) when the user wants to immediately publish existing text/media or says 'post/share to feed'.",
          "- post (postMode=ai) when the user asks AI to write/draft/compose a post/caption/update for them.",
          "- navigate when they want to go/open/switch to a view or switch themes (dark/light).",
          "- style when they want to recolor/restyle/theme their capsule/layout/UI.",
          "- chat when they are conversing, asking questions, looking for analysis/advice, or otherwise expect a conversational reply.",
          "- generate when they explicitly ask you to create or edit an asset (text, poll, plan, summary, logo/image/video) without saying to post it yet.",
          "Return strictly JSON.",
          "",
          `User: ${text}`,
        ].join("\n"),
      },
    ],
  };

let classified: ClassifiedIntent = FALLBACK_RESPONSE;
let completionUsageTokens = 0;
try {
  const result = await postOpenAIJson<{ choices?: Array<{ message?: { content?: string } }>; usage?: { total_tokens?: number } }>(
    "/chat/completions",
    body,
  );
  if (typeof result.data?.usage?.total_tokens === "number" && Number.isFinite(result.data.usage.total_tokens)) {
    completionUsageTokens = result.data.usage.total_tokens;
  }
  const content = result.data?.choices?.[0]?.message?.content;
  if (content) {
      const parsed = safeParseJson(content);
      const parsedIntent = parsed && typeof parsed.intent === "string" ? parsed.intent : null;
      if (parsed && parsedIntent) {
        const normalizedIntent = normalizeIntent(parsedIntent);
        const parsedPostMode =
          parsed.postMode === "ai" || parsed.postMode === "manual" ? parsed.postMode : undefined;
        const parsedConfidence = clampConfidence(parsed.confidence, heuristic.confidence);
        const parsedReason =
          typeof parsed.reason === "string" && parsed.reason.trim().length
            ? parsed.reason.trim()
            : heuristic.reason ?? FALLBACK_RESPONSE.reason;
        const finalReason = parsedReason ?? FALLBACK_RESPONSE.reason ?? "Intent classified";

        classified = {
          intent: normalizedIntent,
          ...(normalizedIntent === "post" && parsedPostMode ? { postMode: parsedPostMode } : {}),
          confidence: parsedConfidence,
          reason: finalReason,
        };
      }
    }
  } catch (error) {
    console.error("Intent classification error", error);
  }

  if (!classified.intent) {
    classified = { ...FALLBACK_RESPONSE, intent: heuristic.intent };
  }

  try {
    const tokensUsed =
      completionUsageTokens ||
      estimateTokensFromText(
        [
          text,
          classified.intent,
          classified.reason ?? "",
          classified.postMode ?? "",
          String(classified.confidence ?? heuristic.confidence ?? 0),
        ].join("\n"),
      );
    const computeCost = computeTextCreditsFromTokens(tokensUsed, model);
    if (walletContext && computeCost > 0 && !walletContext.bypass) {
      await chargeUsage({
        wallet: walletContext.wallet,
        balance: walletContext.balance,
        metric: "compute",
        amount: computeCost,
        reason: "ai.intent",
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
    console.error("billing.intent.charge_failed", billingError);
    return returnError(500, "billing_error", "Failed to record intent usage.");
  }

  return validatedJson(responseSchema, {
    intent: classified.intent,
    confidence: clampConfidence(classified.confidence, heuristic.confidence),
    reason: classified.reason ?? heuristic.reason ?? FALLBACK_RESPONSE.reason ?? "Intent classified",
    source: "ai",
    postMode: classified.postMode,
  });
}

function safeParseJson(content: string | null | undefined): Record<string, unknown> | null {
  if (!content) return null;
  try {
    const parsed = JSON.parse(content);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

export const runtime = "edge";
