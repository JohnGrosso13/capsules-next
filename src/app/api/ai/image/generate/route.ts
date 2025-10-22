import { parseJsonBody, validatedJson, returnError } from "@/server/validation/http";
import { z } from "zod";
import { generateImageFromPrompt } from "@/lib/ai/prompter";
import { ensureUserFromRequest } from "@/lib/auth/payload";
import {
  checkRateLimit,
  retryAfterSeconds as computeRetryAfterSeconds,
  type RateLimitDefinition,
} from "@/server/rate-limit";
import {
  buildCapsuleArtGenerationPrompt,
  deriveStyleDebugSummary,
} from "@/server/ai/capsule-art/prompt-builders";
import {
  capsuleArtAssetKindSchema,
  capsuleStyleSelectionSchema,
  type CapsuleArtAssetType,
} from "@/shared/capsule-style";

const requestSchema = z.object({
  prompt: z.string().min(1),
  capsuleName: z.string().optional().nullable(),
  assetKind: capsuleArtAssetKindSchema.optional().nullable(),
  style: capsuleStyleSelectionSchema.optional().nullable(),
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

  const rateLimitResult = await checkRateLimit(IMAGE_GENERATE_RATE_LIMIT, ownerId);
  if (rateLimitResult && !rateLimitResult.success) {
    const retryAfterSeconds = computeRetryAfterSeconds(rateLimitResult.reset);
    return returnError(
      429,
      "rate_limited",
      "You’ve reached the current image generation limit. Please try again shortly.",
      retryAfterSeconds === null ? undefined : { retryAfterSeconds },
    );
  }

  const assetKind = parsed.data.assetKind ?? null;
  const styleInput = parsed.data.style ?? null;
  const capsuleName = parsed.data.capsuleName ?? null;

  let effectivePrompt = prompt;
  let meta: Parameters<typeof generateImageFromPrompt>[1]["meta"] | null = null;

  if (assetKind || styleInput || capsuleName) {
    const asset = ((assetKind as CapsuleArtAssetType | null) ?? "banner") as CapsuleArtAssetType;
    const built = buildCapsuleArtGenerationPrompt({
      userPrompt: prompt,
      asset,
      subjectName: typeof capsuleName === "string" ? capsuleName : null,
      style: styleInput ?? undefined,
    });
    const styleSummary = deriveStyleDebugSummary(built.style);
    effectivePrompt = built.prompt;
    meta = {
      assetKind: asset,
      mode: "generate",
      style: built.style,
      styleSummary,
      prompt: built.prompt,
      userPrompt: prompt,
    };
  }

  const optionsWithMeta = meta ? { ...safeOptions, meta } : safeOptions;

  const url = await generateImageFromPrompt(effectivePrompt, optionsWithMeta);
  return validatedJson(responseSchema, { url });
}

export const runtime = "nodejs";
