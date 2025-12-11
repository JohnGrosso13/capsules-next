import { parseJsonBody, validatedJson, returnError } from "@/server/validation/http";
import { z } from "zod";
import { generateImageFromPrompt } from "@/lib/ai/prompter";
import { ensureUserFromRequest } from "@/lib/auth/payload";
import {
  checkRateLimits,
  retryAfterSeconds as computeRetryAfterSeconds,
  type RateLimitDefinition,
} from "@/server/rate-limit";
import { resolveClientIp } from "@/server/http/ip";
import {
  chargeUsage,
  ensureFeatureAccess,
  resolveWalletContext,
  EntitlementError,
} from "@/server/billing/entitlements";

const requestSchema = z.object({
  prompt: z.string().min(1),
  options: z
    .object({
      quality: z.string().optional(),
      size: z.string().optional(),
    })
    .optional(),
});

const responseSchema = z.object({ url: z.string() });

const IMAGE_GENERATE_RATE_LIMIT: RateLimitDefinition = {
  name: "ai.image.generate",
  limit: 12,
  window: "10 m",
};

const IMAGE_GENERATE_IP_RATE_LIMIT: RateLimitDefinition = {
  name: "ai.image.generate.ip",
  limit: 60,
  window: "10 m",
};

const IMAGE_GENERATE_GLOBAL_RATE_LIMIT: RateLimitDefinition = {
  name: "ai.image.generate.global",
  limit: 200,
  window: "10 m",
};

const IMAGE_GENERATE_COMPUTE_COST = 5_000;

export async function POST(req: Request) {
  // Require authentication to prevent abuse and unexpected costs
  const ownerId = await ensureUserFromRequest(req, {}, { allowGuests: false });
  if (!ownerId) {
    return returnError(401, "auth_required", "Authentication required");
  }

  const parsed = await parseJsonBody(req, requestSchema);
  if (!parsed.success) return parsed.response;
  const { prompt, options } = parsed.data;
  const safeOptions = options
    ? {
        ...(typeof options.quality === "string" ? { quality: options.quality } : {}),
        ...(typeof options.size === "string" ? { size: options.size } : {}),
      }
    : {};

  const clientIp = resolveClientIp(req);
  const rateLimitResult = await checkRateLimits([
    { definition: IMAGE_GENERATE_RATE_LIMIT, identifier: ownerId },
    { definition: IMAGE_GENERATE_IP_RATE_LIMIT, identifier: clientIp ? `ip:${clientIp}` : null },
    { definition: IMAGE_GENERATE_GLOBAL_RATE_LIMIT, identifier: "global:ai.image.generate" },
  ]);
  if (rateLimitResult && !rateLimitResult.success) {
    const retryAfterSeconds = computeRetryAfterSeconds(rateLimitResult.reset);
    return returnError(
      429,
      "rate_limited",
      "You've reached the current image generation limit. Please try again shortly.",
      retryAfterSeconds === null ? undefined : { retryAfterSeconds },
    );
  }

  try {
    const walletContext = await resolveWalletContext({
      ownerType: "user",
      ownerId,
      supabaseUserId: ownerId,
      req,
      ensureDevCredits: true,
    });
    ensureFeatureAccess({
      balance: walletContext.balance,
      bypass: walletContext.bypass,
      requiredTier: "default",
      featureName: "AI image generation",
    });
    await chargeUsage({
      wallet: walletContext.wallet,
      balance: walletContext.balance,
      metric: "compute",
      amount: IMAGE_GENERATE_COMPUTE_COST,
      reason: "ai.image.generate",
      bypass: walletContext.bypass,
    });
  } catch (error) {
    if (error instanceof EntitlementError) {
      return returnError(error.status, error.code, error.message, error.details);
    }
    console.error("billing.ai_image_generate.failed", error);
    return returnError(500, "billing_error", "Failed to verify allowance");
  }

  const result = await generateImageFromPrompt(
    prompt,
    safeOptions,
    {
      ownerId,
      assetKind: "generic",
      mode: "generate",
      userPrompt: prompt,
      resolvedPrompt: prompt,
      stylePreset: null,
    },
  );
  return validatedJson(responseSchema, { url: result.url });
}

export const runtime = "nodejs";
