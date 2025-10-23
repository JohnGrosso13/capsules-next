import { z } from "zod";

import { ensureUserFromRequest } from "@/lib/auth/payload";
import { generateImageFromPrompt, editImageWithInstruction } from "@/lib/ai/prompter";
import { composeUserLedPrompt } from "@/lib/ai/prompt-styles";
import { mergePersonaCues, type StylePersonaPromptData } from "@/lib/ai/style-persona";
import { getStylePersona, type CapsuleStylePersonaRecord } from "@/server/capsules/style-personas";
import { storeImageSrcToSupabase } from "@/lib/supabase/storage";
import { deriveRequestOrigin, resolveToAbsoluteUrl } from "@/lib/url";
import { serverEnv } from "@/lib/env/server";
import { parseJsonBody, returnError, validatedJson } from "@/server/validation/http";
import { aiImageVariantSchema } from "@/shared/schemas/ai";
import { createAiImageVariant, type AiImageVariantRecord } from "@/server/ai/image-variants";
import { Buffer } from "node:buffer";

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
        const buffer = Buffer.from(arrayBuffer);
        base64Data = buffer.toString("base64");
        mimeType = contentType;
        normalizedSource = `data:${contentType};base64,${base64Data}`;
      }
    } catch (error) {
      console.warn("ai.logo: failed to normalize remote image", error);
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
    console.warn("ai.logo: failed to store image to supabase", error);
  }

  return {
    url: storedUrl,
    imageData: base64Data,
    mimeType,
  };
}

function buildGenerationPrompt(
  prompt: string,
  capsuleName: string,
  stylePreset?: string | null,
  persona?: StylePersonaPromptData | null,
): string {
  const safeName = capsuleName.trim().length ? capsuleName.trim() : "the capsule";
  const baseCues = {
    composition: [
      "Center the mark with a balanced silhouette that reads clearly at 48px.",
    ],
    palette: [
      "Favor high-contrast color blocking so the icon stands out on varied backgrounds.",
    ],
    medium: [
      "Polished vector or clean digital illustration with scalable geometry.",
    ],
    mood: [
      "Confident and modern; align with the capsule's personality.",
    ],
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
    composition: [
      "Maintain the current balance of positive and negative space.",
    ],
    palette: [
      "Adjust colors thoughtfully so the mark retains contrast at smaller sizes.",
    ],
    mood: [
      "Stay aligned with the existing personality unless the user requests a new tone.",
    ],
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

export async function POST(req: Request) {
  const ownerId = await ensureUserFromRequest(req, {}, { allowGuests: false });
  if (!ownerId) {
    return returnError(401, "auth_required", "Sign in to customize capsule logos.");
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
    maskData,
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
      const logoPrompt = buildGenerationPrompt(prompt, effectiveName, stylePreset, personaPrompt);
      const generated = await generateImageFromPrompt(
        logoPrompt,
        {
          quality: "high",
          size: "768x768",
        },
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
        baseUrl: requestOrigin,
      });
      let variantRecord: AiImageVariantRecord | null = null;
      try {
        variantRecord = await createAiImageVariant({
          ownerUserId: ownerId,
          capsuleId: capsuleId ?? null,
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
        console.warn("ai.logo: failed to record variant", variantError);
      }

      const variantResponse = toVariantResponse(variantRecord);

      return validatedJson(responseSchema, {
        url: stored.url,
        message:
          "Thanks for the idea! I drafted a square logo that should feel great across tiles, rails, and settings.",
        imageData: stored.imageData ?? undefined,
        mimeType: stored.mimeType ?? undefined,
        ...(variantResponse ? { variant: variantResponse } : {}),
      });
    }

    let sourceUrl = imageUrl ?? null;
    if (!sourceUrl && imageData) {
      const stored = await storeImageSrcToSupabase(imageData, "capsule-logo-source", {
        baseUrl: requestOrigin,
      });
      sourceUrl = stored?.url ?? null;
    }

    if (!sourceUrl) {
      return returnError(
        400,
        "invalid_request",
        "imageUrl or imageData is required to edit a logo.",
      );
    }

    const normalizedSource = await (async () => {
      try {
        const stored = await storeImageSrcToSupabase(sourceUrl as string, "capsule-logo-source", {
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
        const storedMask = await storeImageSrcToSupabase(maskInput, "capsule-logo-mask", {
          baseUrl: requestOrigin,
        });
        storedMaskUrl = storedMask?.url ?? null;
      } catch (maskError) {
        console.warn("ai.logo: failed to store mask", maskError);
      }
    }

    const instruction = buildEditInstruction(prompt, stylePreset, personaPrompt);
    const edited = await editImageWithInstruction(
      normalizedSource,
      instruction,
      {
        quality: "high",
        size: "768x768",
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
      baseUrl: requestOrigin,
    });

    let variantRecord: AiImageVariantRecord | null = null;
    try {
      variantRecord = await createAiImageVariant({
        ownerUserId: ownerId,
        capsuleId: capsuleId ?? null,
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
      console.warn("ai.logo: failed to record edited variant", variantError);
    }

    const variantResponse = toVariantResponse(variantRecord);

    return validatedJson(responseSchema, {
      url: stored.url,
      message:
        "Appreciate the notes! I refreshed the logo with those changes so you can review it here.",
      imageData: stored.imageData ?? undefined,
      mimeType: stored.mimeType ?? undefined,
      ...(variantResponse ? { variant: variantResponse } : {}),
    });
  } catch (error) {
    console.error("ai.logo error", error);
    const message = error instanceof Error ? error.message : "Failed to update logo.";
    return returnError(500, "logo_generation_failed", message);
  }
}

export const runtime = "nodejs";







