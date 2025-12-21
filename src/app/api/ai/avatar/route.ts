import { z } from "zod";

import { ensureUserFromRequest } from "@/lib/auth/payload";
import { deriveRequestOrigin } from "@/lib/url";
import { serverEnv } from "@/lib/env/server";
import { parseJsonBody, returnError, validatedJson } from "@/server/validation/http";
import { aiImageVariantSchema } from "@/shared/schemas/ai";
import {
  checkRateLimits,
  retryAfterSeconds as computeRetryAfterSeconds,
  type RateLimitDefinition,
} from "@/server/rate-limit";
import { resolveClientIp } from "@/server/http/ip";
import { generateAvatarAsset, editAvatarAsset } from "@/server/customizer/assets/avatar";
import {
  chargeUsage,
  ensureFeatureAccess,
  resolveWalletContext,
  EntitlementError,
} from "@/server/billing/entitlements";
import { imageCreditsForQuality } from "@/lib/billing/usage";

const requestSchema = z.object({
  prompt: z.string().min(1),
  mode: z.enum(["generate", "edit"]).default("generate"),
  displayName: z.string().optional().nullable(),
  imageUrl: z.string().url().optional(),
  imageData: z.string().min(1).optional(),
  stylePreset: z.string().min(1).optional(),
  capsuleId: z.string().uuid().optional(),
  variantId: z.string().uuid().optional(),
  stylePersonaId: z.string().uuid().optional(),
  maskData: z.string().min(1).optional(),
  seed: z.coerce.number().int().min(0).optional(),
  guidance: z.coerce.number().min(0).max(30).optional(),
});

const variantResponseSchema = aiImageVariantSchema.pick({
  id: true,
  runId: true,
  assetKind: true,
  branchKey: true,
  version: true,
  imageUrl: true,
  thumbUrl: true,
  metadata: true,
  parentVariantId: true,
  createdAt: true,
});

const responseSchema = z.object({
  url: z.string(),
  message: z.string().optional(),
  imageData: z.string().optional(),
  mimeType: z.string().optional(),
  variant: variantResponseSchema.optional(),
});

const AVATAR_RATE_LIMIT: RateLimitDefinition = {
  name: "ai.avatar",
  limit: 10,
  window: "30 m",
};

const AVATAR_IP_RATE_LIMIT: RateLimitDefinition = {
  name: "ai.avatar.ip",
  limit: 40,
  window: "30 m",
};

const AVATAR_GLOBAL_RATE_LIMIT: RateLimitDefinition = {
  name: "ai.avatar.global",
  limit: 120,
  window: "30 m",
};

export async function POST(req: Request) {
  const ownerId = await ensureUserFromRequest(req, {}, { allowGuests: false });
  if (!ownerId) {
    return returnError(401, "auth_required", "Sign in to customize your avatar.");
  }

  const clientIp = resolveClientIp(req);
  const rateLimit = await checkRateLimits([
    { definition: AVATAR_RATE_LIMIT, identifier: `avatar:${ownerId}` },
    { definition: AVATAR_IP_RATE_LIMIT, identifier: clientIp ? `ip:${clientIp}` : null },
    { definition: AVATAR_GLOBAL_RATE_LIMIT, identifier: "global:ai.avatar" },
  ]);
  if (rateLimit && !rateLimit.success) {
    const retryAfter = computeRetryAfterSeconds(rateLimit.reset);
    return returnError(
      429,
      "rate_limited",
      "Take a short break. You'll be able to generate more avatars in a moment.",
      retryAfter == null ? undefined : { retryAfterSeconds: retryAfter },
    );
  }

  const parsed = await parseJsonBody(req, requestSchema);
  if (!parsed.success) {
    return parsed.response;
  }

  const {
    prompt,
    mode,
    displayName,
    imageUrl,
    imageData,
    stylePreset,
    capsuleId: capsuleIdRaw,
    variantId,
    stylePersonaId,
    maskData,
    seed,
    guidance,
  } = parsed.data;
  const capsuleId = typeof capsuleIdRaw === "string" ? capsuleIdRaw : undefined;
  const requestOrigin = deriveRequestOrigin(req) ?? serverEnv.SITE_URL;

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
      requiredTier: "starter",
      featureName: "AI avatar generation",
    });
    const computeCost = imageCreditsForQuality("medium");
    await chargeUsage({
      wallet: walletContext.wallet,
      balance: walletContext.balance,
      metric: "compute",
      amount: computeCost,
      reason: "ai.avatar",
      bypass: walletContext.bypass,
    });

    const baseOptions = {
      prompt,
      ownerId,
      displayName: displayName ?? null,
      capsuleId: capsuleId ?? null,
      stylePreset: stylePreset ?? null,
      stylePersonaId: stylePersonaId ?? null,
      requestOrigin,
      seed: seed ?? null,
      guidance: guidance ?? null,
    };
    const result =
      mode === "generate"
        ? await generateAvatarAsset(baseOptions)
        : await editAvatarAsset({
            ...baseOptions,
            variantId: variantId ?? null,
            imageUrl: imageUrl ?? null,
            imageData: imageData ?? null,
            maskData: maskData ?? null,
          });

    return validatedJson(responseSchema, {
      url: result.url,
      message: result.message ?? undefined,
      imageData: result.imageData ?? undefined,
      mimeType: result.mimeType ?? undefined,
      ...(result.variant ? { variant: result.variant } : {}),
    });
  } catch (error) {
    if (error instanceof EntitlementError) {
      return returnError(error.status, error.code, error.message, error.details);
    }
    const code = (error as { code?: string }).code ?? null;
    if (code === "style_persona_not_found") {
      return returnError(404, "style_persona_not_found", "The selected style persona is not available.");
    }
    console.error("ai.avatar error", error);
    const message = error instanceof Error ? error.message : "Failed to update avatar.";
    return returnError(500, "avatar_generation_failed", message);
  }
}

export const runtime = "nodejs";
