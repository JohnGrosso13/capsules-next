import { parseJsonBody, validatedJson, returnError } from "@/server/validation/http";
import { z } from "zod";
import { generateImageFromPrompt } from "@/lib/ai/prompter";
import { ensureUserFromRequest } from "@/lib/auth/payload";
import {
  checkRateLimit,
  retryAfterSeconds as computeRetryAfterSeconds,
  type RateLimitDefinition,
} from "@/server/rate-limit";

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

  const url = await generateImageFromPrompt(
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
  return validatedJson(responseSchema, { url });
}

export const runtime = "nodejs";
