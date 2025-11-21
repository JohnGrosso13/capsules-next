"use server";

import { generateImageFromPrompt, editImageWithInstruction } from "@/lib/ai/prompter";
import { buildLiteralBannerPrompt } from "@/lib/ai/banner-prompt";
import type { StylePersonaPromptData } from "@/lib/ai/style-persona";
import { storeImageSrcToSupabase } from "@/lib/supabase/storage";
import { createAiImageVariant, type AiImageVariantRecord } from "@/server/ai/image-variants";
import { getStylePersona, type CapsuleStylePersonaRecord } from "@/server/capsules/style-personas";

import { persistAndDescribeImage, toVariantResponse, type AssetResponse } from "./common";

export type BannerAssetInput = {
  prompt: string;
  ownerId: string;
  capsuleName?: string | null;
  capsuleId?: string | null;
  variantId?: string | null;
  stylePreset?: string | null;
  stylePersonaId?: string | null;
  requestOrigin?: string | null;
  seed?: number | null;
  guidance?: number | null;
};

export type BannerEditInput = BannerAssetInput & {
  imageUrl?: string | null;
  imageData?: string | null;
  maskData?: string | null;
};

function buildGenerationPrompt(
  prompt: string,
  capsuleName: string,
  _stylePreset?: string | null,
  _persona?: StylePersonaPromptData | null,
): string {
  return buildLiteralBannerPrompt({
    userPrompt: prompt,
    capsuleName,
    mode: "generate",
  });
}

function buildEditInstruction(
  prompt: string,
  _stylePreset?: string | null,
  _persona?: StylePersonaPromptData | null,
): string {
  const trimmed = prompt.trim();
  if (!trimmed.length) {
    return buildLiteralBannerPrompt({
      userPrompt: "Refresh the existing hero banner with subtle updates to layout and lighting.",
      capsuleName: "",
      mode: "edit",
    });
  }
  return buildLiteralBannerPrompt({
    userPrompt: trimmed,
    capsuleName: "",
    mode: "edit",
  });
}

async function resolvePersona(
  personaId: string | null | undefined,
  ownerId: string,
): Promise<{ record: CapsuleStylePersonaRecord | null; prompt: StylePersonaPromptData | null }> {
  if (!personaId) {
    return { record: null, prompt: null };
  }
  const personaRecord = await getStylePersona(personaId, ownerId);
  if (!personaRecord) {
    throw Object.assign(new Error("Style persona is not available."), {
      code: "style_persona_not_found",
    });
  }
  return {
    record: personaRecord,
    prompt: {
      palette: personaRecord.palette,
      medium: personaRecord.medium,
      camera: personaRecord.camera,
      notes: personaRecord.notes,
    },
  };
}

function sanitizeSeed(value: number | null | undefined): number | null {
  if (value == null) return null;
  if (!Number.isFinite(value)) return null;
  return Math.max(0, Math.floor(value));
}

function sanitizeGuidance(value: number | null | undefined): number | null {
  if (value == null) return null;
  if (!Number.isFinite(value)) return null;
  return Math.max(0, Math.min(30, value));
}

export async function generateBannerAsset(input: BannerAssetInput): Promise<AssetResponse> {
  const {
    prompt,
    ownerId,
    capsuleName,
    capsuleId,
    stylePreset,
    stylePersonaId,
    requestOrigin,
    seed,
    guidance,
  } = input;
  const resolvedCapsuleId = capsuleId ?? null;
  const effectiveName = typeof capsuleName === "string" ? capsuleName : "";
  const seedValue = sanitizeSeed(seed);
  const guidanceValue = sanitizeGuidance(guidance);
  const { record: personaRecord, prompt: personaPrompt } = await resolvePersona(
    stylePersonaId ?? null,
    ownerId,
  );
  const bannerPrompt = buildGenerationPrompt(prompt, effectiveName, stylePreset, personaPrompt);
  const generated = await generateImageFromPrompt(
    bannerPrompt,
    { quality: "high", size: "1792x1024" },
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
    baseUrl: requestOrigin ?? null,
  });
  let variantRecord: AiImageVariantRecord | null = null;
  try {
    variantRecord = await createAiImageVariant({
      ownerUserId: ownerId,
      capsuleId: resolvedCapsuleId,
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
    console.warn("customizer.banner.generate variant failed", error);
  }

  return {
    url: stored.url,
    message:
      "Thanks for sharing that direction! I generated a new hero banner in that spirit - check out the preview on the right.",
    imageData: stored.imageData ?? null,
    mimeType: stored.mimeType ?? null,
    variant: toVariantResponse(variantRecord),
  };
}

async function normalizeSourceImage(
  sourceUrl: string,
  requestOrigin: string | null | undefined,
): Promise<string> {
  try {
    const stored = await storeImageSrcToSupabase(sourceUrl, "capsule-banner-source", {
      baseUrl: requestOrigin ?? null,
    });
    return stored?.url ?? sourceUrl;
  } catch {
    return sourceUrl;
  }
}

export async function editBannerAsset(input: BannerEditInput): Promise<AssetResponse> {
  const {
    prompt,
    ownerId,
    capsuleName,
    capsuleId,
    variantId,
    stylePreset,
    stylePersonaId,
    requestOrigin,
    seed,
    guidance,
    imageUrl,
    imageData,
    maskData,
  } = input;
  const resolvedCapsuleId = capsuleId ?? null;
  const effectiveName = typeof capsuleName === "string" ? capsuleName : "";
  const seedValue = sanitizeSeed(seed);
  const guidanceValue = sanitizeGuidance(guidance);
  const { record: personaRecord, prompt: personaPrompt } = await resolvePersona(
    stylePersonaId ?? null,
    ownerId,
  );

  let sourceUrl = imageUrl ?? null;
  if (!sourceUrl && imageData) {
    const storedSource = await storeImageSrcToSupabase(imageData, "capsule-banner-source", {
      baseUrl: requestOrigin ?? null,
    });
    sourceUrl = storedSource?.url ?? null;
  }
  if (!sourceUrl) {
    throw new Error("imageUrl or imageData is required to edit a banner.");
  }
  const normalizedSource = await normalizeSourceImage(sourceUrl, requestOrigin ?? null);
  const maskInput =
    typeof maskData === "string" && maskData.trim().length ? maskData.trim() : null;
  let storedMaskUrl: string | null = null;
  if (maskInput) {
    try {
      const storedMask = await storeImageSrcToSupabase(maskInput, "capsule-banner-mask", {
        baseUrl: requestOrigin ?? null,
      });
      storedMaskUrl = storedMask?.url ?? null;
    } catch (maskError) {
      console.warn("customizer.banner.edit mask store failed", maskError);
    }
  }
  const instruction = buildEditInstruction(prompt, stylePreset, personaPrompt);

  try {
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
      baseUrl: requestOrigin ?? null,
    });
    let variantRecord: AiImageVariantRecord | null = null;
    try {
      variantRecord = await createAiImageVariant({
        ownerUserId: ownerId,
        capsuleId: resolvedCapsuleId,
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
      console.warn("customizer.banner.edit variant failed", variantError);
    }

    return {
      url: stored.url,
      message:
        "Thanks for the update! I remixed the current banner with those notes so you can preview the refresh.",
    imageData: stored.imageData ?? null,
    mimeType: stored.mimeType ?? null,
      variant: toVariantResponse(variantRecord),
    };
  } catch (editError) {
    console.warn("customizer.banner.edit failed, attempting fallback", editError);
    const fallbackResolvedPrompt = buildGenerationPrompt(
      `${prompt.trim()} Remix inspired by the current banner, keep the same mood but refresh composition.`,
      effectiveName,
      stylePreset,
      personaPrompt,
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
          stylePersonaId: personaRecord?.id ?? null,
          seed: seedValue,
          guidance: guidanceValue,
        },
      },
    );
    const stored = await persistAndDescribeImage(fallback.url, "capsule-banner-edit-fallback", {
      baseUrl: requestOrigin ?? null,
    });
    return {
      url: stored.url,
      message:
        "OpenAI couldn't edit the existing banner, so I generated a fresh take with your notes instead.",
    imageData: stored.imageData ?? null,
    mimeType: stored.mimeType ?? null,
      variant: null,
    };
  }
}
