import { z } from "zod";

import { ensureUserFromRequest } from "@/lib/auth/payload";
import { generateImageFromPrompt, editImageWithInstruction } from "@/lib/ai/prompter";
// Note: banner uses a minimal literal-first builder; keep prompt-styles for other routes.
import { buildLiteralBannerPrompt } from "@/lib/ai/banner-prompt";
import { storeImageSrcToSupabase } from "@/lib/supabase/storage";
import { deriveRequestOrigin, resolveToAbsoluteUrl } from "@/lib/url";
import { serverEnv } from "@/lib/env/server";
import { parseJsonBody, returnError, validatedJson } from "@/server/validation/http";
import { encodeBase64 } from "@/lib/base64";
import { aiImageVariantSchema } from "@/shared/schemas/ai";
import { createAiImageVariant, type AiImageVariantRecord } from "@/server/ai/image-variants";
import type { StylePersonaPromptData } from "@/lib/ai/style-persona";
import { getStylePersona, type CapsuleStylePersonaRecord } from "@/server/capsules/style-personas";

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
type VariantResponse = z.infer<typeof variantResponseSchema>;

const responseSchema = z.object({
  url: z.string(),
  message: z.string().optional(),
  imageData: z.string().optional(),
  mimeType: z.string().optional(),
  variant: variantResponseSchema.optional(),
});

async function persistAndDescribeImage(
  source: string,
  filenameHint: string,
  options: { baseUrl?: string | null } = {},
): Promise<{ url: string; imageData: string | null; mimeType: string | null }> {
  const absoluteSource = resolveToAbsoluteUrl(source, options.baseUrl) ?? source;
  let normalizedSource = absoluteSource;
  let base64Data: string | null = null;
  let mimeType: string | null = null;

  if (/^data:/i.test(source)) {
    const match = source.match(/^data:([^;]+);base64,(.*)$/i);
    if (match) {
      mimeType = match[1] || "image/png";
      base64Data = match[2] || "";
    }
  } else {
    try {
      const response = await fetch(absoluteSource);
      if (response.ok) {
        const contentType = response.headers.get("content-type") || "image/png";
        const arrayBuffer = await response.arrayBuffer();
        const bytes = new Uint8Array(arrayBuffer);
        base64Data = encodeBase64(bytes);
        mimeType = contentType;
        normalizedSource = `data:${contentType};base64,${base64Data}`;
      }
    } catch (error) {
      console.warn("ai.banner: failed to normalize remote image", error);
    }
  }

  let storedUrl = absoluteSource;
  try {
    const stored = await storeImageSrcToSupabase(normalizedSource, filenameHint, {
      baseUrl: options.baseUrl ?? null,
    });
    if (stored?.url) {
      storedUrl = stored.url;
    }
  } catch (error) {
    console.warn("ai.banner: failed to store image to supabase", error);
  }

  return {
    url: storedUrl,
    imageData: base64Data,
    mimeType,
  };
}

function toVariantResponse(record: AiImageVariantRecord | null): VariantResponse | null {
  if (!record) return null;
  return {
    id: record.id,
    runId: record.runId,
    assetKind: record.assetKind,
    branchKey: record.branchKey,
    version: record.version,
    imageUrl: record.imageUrl,
    thumbUrl: record.thumbUrl,
    metadata: record.metadata ?? {},
    parentVariantId: record.parentVariantId,
    createdAt: record.createdAt,
  };
}

function buildGenerationPrompt(
  prompt: string,
  capsuleName: string,
  _stylePreset?: string | null,
  _persona?: StylePersonaPromptData | null,
): string {
  // Minimal, literal-first prompt. Style presets and persona are intentionally ignored here
  // to keep the user's subject primary for banners.
  return buildLiteralBannerPrompt({ userPrompt: prompt, capsuleName, mode: "generate" });
}

function buildEditInstruction(
  prompt: string,
  _stylePreset?: string | null,
  _persona?: StylePersonaPromptData | null,
): string {
  return buildLiteralBannerPrompt({ userPrompt: prompt, mode: "edit" });
}

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
  maskData,
  stylePersonaId,
  seed,
  guidance,
} = parsed.data;
  const capsuleId = typeof capsuleIdRaw === "string" ? capsuleIdRaw : undefined;
  const effectiveName = typeof capsuleName === "string" ? capsuleName : "";
  const requestOrigin = deriveRequestOrigin(req) ?? serverEnv.SITE_URL;

  let personaRecord: CapsuleStylePersonaRecord | null = null;
  if (stylePersonaId) {
    personaRecord = await getStylePersona(stylePersonaId, ownerId);
    if (!personaRecord) {
      return returnError(404, "style_persona_not_found", "The selected style persona is not available.");
    }
  }
  const personaPrompt: StylePersonaPromptData | null = personaRecord
    ? {
        palette: personaRecord.palette,
        medium: personaRecord.medium,
        camera: personaRecord.camera,
        notes: personaRecord.notes,
      }
    : null;

  const seedValue =
    typeof seed === "number" && Number.isFinite(seed) ? Math.max(0, Math.floor(seed)) : null;
  const guidanceValue =
    typeof guidance === "number" && Number.isFinite(guidance)
      ? Math.max(0, Math.min(30, guidance))
      : null;

  try {
    if (mode === "generate") {
      const bannerPrompt = buildGenerationPrompt(prompt, effectiveName, stylePreset, personaPrompt);
      const generated = await generateImageFromPrompt(
        bannerPrompt,
        {
          quality: "high",
          // Prefer 16:9 for hero banners
          size: "1792x1024",
        },
        {
          ownerId,
          assetKind: "banner",
          mode: "generate",
          userPrompt: prompt,
          resolvedPrompt: bannerPrompt,
          stylePreset: stylePreset ?? null,
          options: {
            capsuleName: effectiveName || null,
            stylePersonaId: personaRecord?.id ?? null,
            seed: seedValue,
            guidance: guidanceValue,
          },
        },
      );
      const stored = await persistAndDescribeImage(generated.url, "capsule-banner-generate", {
        baseUrl: requestOrigin,
      });
      let variantRecord: AiImageVariantRecord | null = null;
      try {
        variantRecord = await createAiImageVariant({
          ownerUserId: ownerId,
          capsuleId: capsuleId ?? null,
          assetKind: "banner",
          imageUrl: stored.url,
          thumbUrl: stored.url,
          runId: generated.runId,
          metadata: {
            mode: "generate",
            userPrompt: prompt,
            resolvedPrompt: bannerPrompt,
            capsuleName: effectiveName || null,
            stylePreset: stylePreset ?? null,
            provider: generated.provider,
            stylePersonaId: personaRecord?.id ?? null,
            seed: seedValue,
            guidance: guidanceValue,
            responseMetadata: generated.metadata ?? null,
          },
        });
      } catch (error) {
        console.warn("ai.banner: failed to record variant", error);
      }

      const variantResponse = toVariantResponse(variantRecord);

      return validatedJson(responseSchema, {
        url: stored.url,
        message:
          "Thanks for sharing that direction! I generated a new hero banner in that spirit - check out the preview on the right.",
        imageData: stored.imageData ?? undefined,
        mimeType: stored.mimeType ?? undefined,
        ...(variantResponse ? { variant: variantResponse } : {}),
      });
    }

    let sourceUrl = imageUrl ?? null;
    if (!sourceUrl && imageData) {
      const stored = await storeImageSrcToSupabase(imageData, "capsule-banner-source", {
        baseUrl: requestOrigin,
      });
      sourceUrl = stored?.url ?? null;
    }

    if (!sourceUrl) {
      return returnError(
        400,
        "invalid_request",
        "imageUrl or imageData is required to edit a banner.",
      );
    }

    // Normalize the source into storage to ensure it is fetchable by the image edit API.
    const normalizedSource = await (async () => {
      try {
        const stored = await storeImageSrcToSupabase(sourceUrl as string, "capsule-banner-source", {
          baseUrl: requestOrigin,
        });
        return stored?.url ?? sourceUrl!;
      } catch {
        return sourceUrl!;
      }
    })();

    const maskInput =
      typeof maskData === "string" && maskData.trim().length ? maskData.trim() : null;
    let storedMaskUrl: string | null = null;
    if (maskInput) {
      try {
        const storedMask = await storeImageSrcToSupabase(maskInput, "capsule-banner-mask", {
          baseUrl: requestOrigin,
        });
        storedMaskUrl = storedMask?.url ?? null;
      } catch (maskError) {
        console.warn("ai.banner: failed to store mask", maskError);
      }
    }

    try {
    const instruction = buildEditInstruction(prompt, stylePreset, personaPrompt);
    const edited = await editImageWithInstruction(
      normalizedSource,
      instruction,
      {
        quality: "high",
        size: "1024x1024",
      },
      {
        ownerId,
        assetKind: "banner",
        mode: "edit",
        userPrompt: prompt,
        resolvedPrompt: instruction,
        stylePreset: stylePreset ?? null,
        options: {
          capsuleName: effectiveName || null,
          sourceImageUrl: normalizedSource,
          maskUrl: storedMaskUrl,
          maskApplied: Boolean(maskInput),
          stylePersonaId: personaRecord?.id ?? null,
          seed: seedValue,
          guidance: guidanceValue,
        },
      },
      maskInput,
    );
      const stored = await persistAndDescribeImage(edited.url, "capsule-banner-edit", {
        baseUrl: requestOrigin,
      });

      let variantRecord: AiImageVariantRecord | null = null;
      try {
        variantRecord = await createAiImageVariant({
          ownerUserId: ownerId,
          capsuleId: capsuleId ?? null,
          assetKind: "banner",
          imageUrl: stored.url,
          thumbUrl: stored.url,
          runId: edited.runId,
          parentVariantId: variantId ?? null,
          metadata: {
            mode: "edit",
            userPrompt: prompt,
            resolvedPrompt: instruction,
            capsuleName: effectiveName || null,
            stylePreset: stylePreset ?? null,
            provider: edited.provider,
          baseVariantId: variantId ?? null,
          sourceImageUrl: normalizedSource,
          maskUrl: storedMaskUrl,
          stylePersonaId: personaRecord?.id ?? null,
          seed: seedValue,
          guidance: guidanceValue,
          responseMetadata: edited.metadata ?? null,
        },
      });
      } catch (variantError) {
        console.warn("ai.banner: failed to record edited variant", variantError);
      }

      const variantResponse = toVariantResponse(variantRecord);

      return validatedJson(responseSchema, {
        url: stored.url,
        message:
          "Thanks for the update! I remixed the current banner with those notes so you can preview the refresh.",
        imageData: stored.imageData ?? undefined,
        mimeType: stored.mimeType ?? undefined,
        ...(variantResponse ? { variant: variantResponse } : {}),
      });
    } catch (editError) {
      console.warn("ai.banner edit failed; falling back to fresh generation", editError);

      try {
        const fallbackResolvedPrompt = buildGenerationPrompt(
          `${prompt.trim()} Remix inspired by the current banner, keep the same mood but refresh composition.`,
          effectiveName,
          stylePreset,
        );
        const fallback = await generateImageFromPrompt(
          fallbackResolvedPrompt,
          {
            quality: "high",
            size: "1792x1024",
          },
          {
            ownerId,
            assetKind: "banner",
            mode: "generate",
            userPrompt: prompt,
            resolvedPrompt: fallbackResolvedPrompt,
            stylePreset: stylePreset ?? null,
          options: {
            capsuleName: effectiveName || null,
            reason: "edit-fallback",
            seed: seedValue,
            guidance: guidanceValue,
          },
          },
        );
        const stored = await persistAndDescribeImage(fallback.url, "capsule-banner-edit-fallback", {
          baseUrl: requestOrigin,
        });

        return validatedJson(responseSchema, {
          url: stored.url,
          message:
            "OpenAI couldn’t edit the existing banner, so I generated a fresh take with your notes instead.",
          imageData: stored.imageData ?? undefined,
          mimeType: stored.mimeType ?? undefined,
        });
      } catch (fallbackError) {
        console.error("ai.banner fallback failed", fallbackError);
        throw editError;
      }
    }
  } catch (error) {
    console.error("ai.banner error", error);
    const message = error instanceof Error ? error.message : "Failed to update banner.";
    return returnError(500, "banner_generation_failed", message);
  }
}

export const runtime = "nodejs";
