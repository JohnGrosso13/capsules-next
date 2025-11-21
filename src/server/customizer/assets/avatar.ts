"use server";

import {
  generateImageFromPrompt,
  editImageWithInstruction,
  extractImageProviderError,
} from "@/lib/ai/prompter";
import { composeUserLedPrompt } from "@/lib/ai/prompt-styles";
import { mergePersonaCues, type StylePersonaPromptData } from "@/lib/ai/style-persona";
import { storeImageSrcToSupabase } from "@/lib/supabase/storage";
import { createAiImageVariant, type AiImageVariantRecord } from "@/server/ai/image-variants";
import { getStylePersona, type CapsuleStylePersonaRecord } from "@/server/capsules/style-personas";

import { persistAndDescribeImage, toVariantResponse, type AssetResponse } from "./common";

export type AvatarAssetInput = {
  prompt: string;
  ownerId: string;
  displayName?: string | null;
  capsuleId?: string | null;
  variantId?: string | null;
  stylePreset?: string | null;
  stylePersonaId?: string | null;
  requestOrigin?: string | null;
  seed?: number | null;
  guidance?: number | null;
};

export type AvatarEditInput = AvatarAssetInput & {
  imageUrl?: string | null;
  imageData?: string | null;
  maskData?: string | null;
};

function buildGenerationPrompt(
  prompt: string,
  displayName: string,
  stylePreset?: string | null,
  persona?: StylePersonaPromptData | null,
): string {
  const safeName = displayName.trim().length ? displayName.trim() : "the profile owner";
  const baseCues = {
    composition: [
      "Center the subject with a gentle edge fade so it fits cleanly inside a circular mask.",
      "Keep the background understated to maintain clarity at profile-photo scale.",
    ],
    lighting: [
      "Use flattering, diffused lighting that avoids harsh shadows and highlights facial features softly.",
    ],
    palette: ["Choose balanced colors that stay readable on both light and dark UI themes."],
    medium: [
      "Lean toward modern digital illustration or photoreal rendering depending on the user prompt.",
    ],
    mood: ["Aim for confident, approachable energy unless the user suggests otherwise."],
  };
  const mergedCues = mergePersonaCues(baseCues, persona ?? null);
  return composeUserLedPrompt({
    userPrompt: prompt,
    objective: `Create a polished avatar portrait that represents ${safeName}.`,
    subjectContext:
      "The avatar should remain legible when cropped inside a circle and displayed at small sizes.",
    baseCues: mergedCues,
    baseConstraints: [
      "Avoid text, logos, or watermarks.",
      "Do not introduce heavy borders or distracting patterns.",
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
    composition: [
      "Preserve a centered layout with minimal background clutter.",
      "Keep edges tidy for a clean circular crop.",
    ],
    lighting: ["Stay close to the existing lighting, using soft adjustments to refine the mood."],
    mood: ["Honor the current personality unless the user specifically requests a shift."],
  };
  const mergedCues = mergePersonaCues(baseCues, persona ?? null);
  return composeUserLedPrompt({
    userPrompt: prompt,
    objective: "Update the existing avatar while keeping it circle-safe and instantly recognizable.",
    subjectContext:
      "Maintain the subject's proportions and framing so the refreshed avatar still represents the same profile.",
    baseCues: mergedCues,
    baseConstraints: [
      "Avoid adding text, logos, watermarks, or busy textures.",
      "Do not introduce heavy borders or elements that break the circular silhouette.",
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

export async function generateAvatarAsset(input: AvatarAssetInput): Promise<AssetResponse> {
  const {
    prompt,
    ownerId,
    displayName,
    capsuleId,
    stylePreset,
    stylePersonaId,
    requestOrigin,
    seed,
    guidance,
  } = input;
  const resolvedCapsuleId = capsuleId ?? null;
  const effectiveName = typeof displayName === "string" ? displayName : "";
  const seedValue = sanitizeSeed(seed);
  const guidanceValue = sanitizeGuidance(guidance);
  const { record: personaRecord, prompt: personaPrompt } = await resolvePersona(
    stylePersonaId ?? null,
    ownerId,
  );
  const avatarPrompt = buildGenerationPrompt(prompt, effectiveName, stylePreset, personaPrompt);
  const generated = await generateImageFromPrompt(
    avatarPrompt,
    { quality: "standard", size: "768x768" },
    {
      ownerId,
      assetKind: "avatar",
      mode: "generate",
      userPrompt: prompt,
      resolvedPrompt: avatarPrompt,
      stylePreset: stylePreset ?? null,
      options: {
        displayName: effectiveName || null,
        stylePersonaId: personaRecord?.id ?? null,
        seed: seedValue,
        guidance: guidanceValue,
      },
    },
  );
  const stored = await persistAndDescribeImage(generated.url, "profile-avatar-generate", {
    baseUrl: requestOrigin ?? null,
  });
  let variantRecord: AiImageVariantRecord | null = null;
  try {
    variantRecord = await createAiImageVariant({
      ownerUserId: ownerId,
      capsuleId: resolvedCapsuleId,
      assetKind: "avatar",
      imageUrl: stored.url,
      thumbUrl: stored.url,
      runId: generated.runId,
      metadata: {
        mode: "generate",
        userPrompt: prompt,
        resolvedPrompt: avatarPrompt,
        displayName: effectiveName || null,
        stylePreset: stylePreset ?? null,
        provider: generated.provider,
        stylePersonaId: personaRecord?.id ?? null,
        seed: seedValue,
        guidance: guidanceValue,
        responseMetadata: generated.metadata ?? null,
      },
    });
  } catch (variantError) {
    console.warn("customizer.avatar.generate variant failed", variantError);
  }

  return {
    url: stored.url,
    message:
      "Got it! I drafted a fresh avatar concept with that vibe so you can see how it feels.",
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
    const stored = await storeImageSrcToSupabase(sourceUrl, "profile-avatar-source", {
      baseUrl: requestOrigin ?? null,
    });
    return stored?.url ?? sourceUrl;
  } catch {
    return sourceUrl;
  }
}

export async function editAvatarAsset(input: AvatarEditInput): Promise<AssetResponse> {
  const {
    prompt,
    ownerId,
    displayName,
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
  const effectiveName = typeof displayName === "string" ? displayName : "";
  const seedValue = sanitizeSeed(seed);
  const guidanceValue = sanitizeGuidance(guidance);
  const { record: personaRecord, prompt: personaPrompt } = await resolvePersona(
    stylePersonaId ?? null,
    ownerId,
  );
  let sourceUrl = imageUrl ?? null;
  if (!sourceUrl && imageData) {
    const storedSource = await storeImageSrcToSupabase(imageData, "profile-avatar-source", {
      baseUrl: requestOrigin ?? null,
    });
    sourceUrl = storedSource?.url ?? null;
  }
  if (!sourceUrl) {
    throw new Error("imageUrl or imageData is required to edit an avatar.");
  }
  const normalizedSource = await normalizeSourceImage(sourceUrl, requestOrigin ?? null);
  const maskInput =
    typeof maskData === "string" && maskData.trim().length ? maskData.trim() : null;
  let storedMaskUrl: string | null = null;
  if (maskInput) {
    try {
      const storedMask = await storeImageSrcToSupabase(maskInput, "profile-avatar-mask", {
        baseUrl: requestOrigin ?? null,
      });
      storedMaskUrl = storedMask?.url ?? null;
    } catch (maskError) {
      console.warn("customizer.avatar.edit mask failed", maskError);
    }
  }
  const instruction = buildEditInstruction(prompt, stylePreset, personaPrompt);
  try {
    const edited = await editImageWithInstruction(
      normalizedSource,
      instruction,
      {
        quality: "standard",
        size: "768x768",
      },
      {
        ownerId,
        assetKind: "avatar",
        mode: "edit",
        userPrompt: prompt,
        resolvedPrompt: instruction,
        stylePreset: stylePreset ?? null,
        options: {
          displayName: effectiveName || null,
          maskUrl: storedMaskUrl,
          maskApplied: Boolean(maskInput),
          stylePersonaId: personaRecord?.id ?? null,
          seed: seedValue,
          guidance: guidanceValue,
        },
      },
      maskInput,
    );
    const stored = await persistAndDescribeImage(edited.url, "profile-avatar-edit", {
      baseUrl: requestOrigin ?? null,
    });
    let variantRecord: AiImageVariantRecord | null = null;
    try {
      variantRecord = await createAiImageVariant({
        ownerUserId: ownerId,
        capsuleId: resolvedCapsuleId,
        assetKind: "avatar",
        imageUrl: stored.url,
        thumbUrl: stored.url,
        runId: edited.runId,
        parentVariantId: variantId ?? null,
        metadata: {
          mode: "edit",
          userPrompt: prompt,
          resolvedPrompt: instruction,
          displayName: effectiveName || null,
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
      console.warn("customizer.avatar.edit variant failed", variantError);
    }

    return {
      url: stored.url,
      message:
        "Got it! I refreshed the avatar with those notes so you can review the update here.",
    imageData: stored.imageData ?? null,
    mimeType: stored.mimeType ?? null,
      variant: toVariantResponse(variantRecord),
    };
  } catch (error) {
    const providerError = extractImageProviderError(error);
    if (providerError) {
      throw providerError;
    }
    throw error;
  }
}
