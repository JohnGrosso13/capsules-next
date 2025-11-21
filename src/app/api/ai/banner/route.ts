import { z } from "zod";

import { ensureUserFromRequest } from "@/lib/auth/payload";
import { deriveRequestOrigin } from "@/lib/url";
import { serverEnv } from "@/lib/env/server";
import { parseJsonBody, returnError, validatedJson } from "@/server/validation/http";
import { aiImageVariantSchema } from "@/shared/schemas/ai";
import { generateBannerAsset, editBannerAsset } from "@/server/customizer/assets/banner";

const requestSchema = z.object({
  prompt: z.string().min(1),
  mode: z.enum(["generate", "edit"]).default("generate"),
  capsuleName: z.string().optional().nullable(),
  imageUrl: z.string().url().optional(),
  imageData: z.string().min(1).optional(),
  stylePreset: z.string().min(1).optional(),
  capsuleId: z.string().uuid().optional(),
  variantId: z.string().uuid().optional(),
  stylePersonaId: z.string().uuid().optional(),
  seed: z.coerce.number().int().min(0).optional(),
  guidance: z.coerce.number().min(0).max(30).optional(),
  maskData: z.string().min(1).optional(),
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

export async function POST(req: Request) {
  const ownerId = await ensureUserFromRequest(req, {}, { allowGuests: false });
  if (!ownerId) {
    return returnError(401, "auth_required", "Sign in to customize capsule banners.");
  }

  const parsed = await parseJsonBody(req, requestSchema);
  if (!parsed.success) {
    return parsed.response;
  }

  const {
    prompt,
    mode,
    capsuleName,
    imageUrl,
    imageData,
    stylePreset,
    capsuleId: capsuleIdRaw,
    variantId,
    stylePersonaId,
    seed,
    guidance,
    maskData,
  } = parsed.data;
  const capsuleId = typeof capsuleIdRaw === "string" ? capsuleIdRaw : undefined;
  const effectiveName = typeof capsuleName === "string" ? capsuleName : "";
  const requestOrigin = deriveRequestOrigin(req) ?? serverEnv.SITE_URL;

  try {
    const baseOptions = {
      prompt,
      ownerId,
      capsuleName: effectiveName,
      capsuleId: capsuleId ?? null,
      stylePreset: stylePreset ?? null,
      stylePersonaId: stylePersonaId ?? null,
      requestOrigin,
      seed: seed ?? null,
      guidance: guidance ?? null,
    };

    const result =
      mode === "generate"
        ? await generateBannerAsset(baseOptions)
        : await editBannerAsset({
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
    const code = (error as { code?: string }).code ?? null;
    if (code === "style_persona_not_found") {
      return returnError(404, "style_persona_not_found", "The selected style persona is not available.");
    }
    console.error("ai.banner error", error);
    const message = error instanceof Error ? error.message : "Failed to update banner.";
    return returnError(500, "banner_generation_failed", message);
  }
}

export const runtime = "nodejs";
