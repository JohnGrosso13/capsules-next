"use server";

import { generateImageFromPrompt, editImageWithInstruction } from "@/lib/ai/prompter";
import { composeUserLedPrompt } from "@/lib/ai/prompt-styles";
import { mergePersonaCues, type StylePersonaPromptData } from "@/lib/ai/style-persona";
import { storeImageSrcToSupabase } from "@/lib/supabase/storage";
import { createAiImageVariant, type AiImageVariantRecord } from "@/server/ai/image-variants";
import { getStylePersona, type CapsuleStylePersonaRecord } from "@/server/capsules/style-personas";

import { persistAndDescribeImage, toVariantResponse, type AssetResponse } from "./common";

export type LogoAssetInput = {
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

export type LogoEditInput = LogoAssetInput & {
  imageUrl?: string | null;
  imageData?: string | null;
  maskData?: string | null;
};

function buildGenerationPrompt(
  prompt: string,
  capsuleName: string,
  stylePreset?: string | null,
  persona?: StylePersonaPromptData | null,
): string {
  const safeName = capsuleName.trim().length ? capsuleName.trim() : "the capsule";
  const baseCues = {
    composition: ["Center the mark with a balanced silhouette that reads clearly at 48px."],
    palette: ["Favor high-contrast color blocking so the icon stands out on varied backgrounds."],
    medium: ["Polished vector or clean digital illustration with scalable geometry."],
    mood: ["Confident and modern; align with the capsule's personality."],
  };
  const mergedCues = mergePersonaCues(baseCues, persona ?? null);
  return composeUserLedPrompt({
    userPrompt: prompt,
    objective: `Create a distinctive square logo that represents ${safeName}.`,
    subjectContext: "The mark should remain crisp inside a rounded-square mask across Capsule surfaces.",
    baseCues: mergedCues,
    baseConstraints: [
      "Avoid long text, taglines, or watermark elements.",
      "Keep shapes simple enough for small favicon usage.",
    ],
    styleId: stylePreset ?? null,
  });
}

function buildEditInstruction(
  prompt: string,
  stylePreset?: string | null,
  persona?: StylePersonaPromptData | null,
): string {
  const baseCues = {
    composition: ["Maintain the current balance of positive and negative space."],
    palette: ["Adjust colors thoughtfully so the mark retains contrast at smaller sizes."],
    mood: ["Stay aligned with the existing personality unless the user requests a new tone."],
  };
  const mergedCues = mergePersonaCues(baseCues, persona ?? null);
  return composeUserLedPrompt({
    userPrompt: prompt,
    objective: "Refresh the existing logo while preserving its core structure and recognizability.",
    subjectContext: "Keep the logo square-friendly so it continues to work inside Capsule's rounded mask.",
    baseCues: mergedCues,
    baseConstraints: [
      "Avoid introducing dense typography, lengthy text, or watermark effects.",
      "Preserve clean edges suitable for vector export.",
    ],
    styleId: stylePreset ?? null,
  });
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

async function resolvePersona(
  personaId: string | null | undefined,
  ownerId: string,
): Promise<{ record: CapsuleStylePersonaRecord | null; prompt: StylePersonaPromptData | null }> {
  if (!personaId) return { record: null, prompt: null };
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

export async function generateLogoAsset(input: LogoAssetInput): Promise<AssetResponse> {
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
  const logoPrompt = buildGenerationPrompt(prompt, effectiveName, stylePreset, personaPrompt);
  const generated = await generateImageFromPrompt(
    logoPrompt,
    { quality: "high", size: "1024x1024" },
    {
      ownerId,
      assetKind: "logo",
      mode: "generate",
      userPrompt: prompt,
      resolvedPrompt: logoPrompt,
      stylePreset: stylePreset ?? null,
      options: {
        capsuleName: effectiveName || null,
        stylePersonaId: personaRecord?.id ?? null,
        seed: seedValue,
        guidance: guidanceValue,
      },
    },
  );
  const stored = await persistAndDescribeImage(generated.url, "capsule-logo-generate", {
    baseUrl: requestOrigin ?? null,
  });
  let variantRecord: AiImageVariantRecord | null = null;
  try {
    variantRecord = await createAiImageVariant({
      ownerUserId: ownerId,
      capsuleId: resolvedCapsuleId,
      assetKind: "logo",
      imageUrl: stored.url,
      thumbUrl: stored.url,
      runId: generated.runId,
      metadata: {
        mode: "generate",
        userPrompt: prompt,
        resolvedPrompt: logoPrompt,
        capsuleName: effectiveName || null,
        stylePreset: stylePreset ?? null,
        provider: generated.provider,
        stylePersonaId: personaRecord?.id ?? null,
        seed: seedValue,
        guidance: guidanceValue,
        responseMetadata: generated.metadata ?? null,
      },
    });
  } catch (variantError) {
    console.warn("customizer.logo.generate variant failed", variantError);
  }

  return {
    url: stored.url,
    message:
      "Appreciate the direction! I drafted a fresh square logo concept that fits Capsule's surfaces.",
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
    const stored = await storeImageSrcToSupabase(sourceUrl, "capsule-logo-source", {
      baseUrl: requestOrigin ?? null,
    });
    return stored?.url ?? sourceUrl;
  } catch {
    return sourceUrl;
  }
}

export async function editLogoAsset(input: LogoEditInput): Promise<AssetResponse> {
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
    const storedSource = await storeImageSrcToSupabase(imageData, "capsule-logo-source", {
      baseUrl: requestOrigin ?? null,
    });
    sourceUrl = storedSource?.url ?? null;
  }
  if (!sourceUrl) {
    throw new Error("imageUrl or imageData is required to edit a logo.");
  }
  const normalizedSource = await normalizeSourceImage(sourceUrl, requestOrigin ?? null);
  const maskInput =
    typeof maskData === "string" && maskData.trim().length ? maskData.trim() : null;
  let storedMaskUrl: string | null = null;
  if (maskInput) {
    try {
      const storedMask = await storeImageSrcToSupabase(maskInput, "capsule-logo-mask", {
        baseUrl: requestOrigin ?? null,
      });
      storedMaskUrl = storedMask?.url ?? null;
    } catch (maskError) {
      console.warn("customizer.logo.edit mask store failed", maskError);
    }
  }
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
      assetKind: "logo",
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
  const stored = await persistAndDescribeImage(edited.url, "capsule-logo-edit", {
    baseUrl: requestOrigin ?? null,
  });
  let variantRecord: AiImageVariantRecord | null = null;
  try {
    variantRecord = await createAiImageVariant({
      ownerUserId: ownerId,
      capsuleId: resolvedCapsuleId,
      assetKind: "logo",
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
    console.warn("customizer.logo.edit variant failed", variantError);
  }

  return {
    url: stored.url,
    message:
      "Appreciate the notes! I refreshed the logo with those changes so you can review it here.",
    imageData: stored.imageData ?? null,
    mimeType: stored.mimeType ?? null,
    variant: toVariantResponse(variantRecord),
  };
}
