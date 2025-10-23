import { z } from "zod";

import { ensureUserFromRequest } from "@/lib/auth/payload";
import { generateImageFromPrompt, editImageWithInstruction } from "@/lib/ai/prompter";
import { composeUserLedPrompt } from "@/lib/ai/prompt-styles";
import { storeImageSrcToSupabase } from "@/lib/supabase/storage";
import { deriveRequestOrigin, resolveToAbsoluteUrl } from "@/lib/url";
import { serverEnv } from "@/lib/env/server";
import { parseJsonBody, returnError, validatedJson } from "@/server/validation/http";
import { Buffer } from "node:buffer";
import { aiImageVariantSchema } from "@/shared/schemas/ai";
import { createAiImageVariant, type AiImageVariantRecord } from "@/server/ai/image-variants";
import { mergePersonaCues, type StylePersonaPromptData } from "@/lib/ai/style-persona";
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
        const buffer = Buffer.from(arrayBuffer);
        base64Data = buffer.toString("base64");
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
  stylePreset?: string | null,
  persona?: StylePersonaPromptData | null,
): string {
  const safeName = capsuleName.trim().length ? capsuleName.trim() : "the capsule";
  const baseCues = {
    composition: [
      "Establish a clear focal point with layered foreground, midground, and background for depth.",
      "Reserve gentle negative space near the edges for interface elements.",
    ],
    lighting: [
      "Blend atmospheric lighting with subtle gradients to create depth without overpowering overlays.",
    ],
    palette: ["Use vibrant but balanced colors that work across light and dark themes."],
    medium: ["High-resolution digital illustration or cinematic render that withstands scaling."],
    mood: ["Immersive and inviting mood that captures the capsule's vibe."],
  };
  const mergedCues = mergePersonaCues(baseCues, persona ?? null);
  return composeUserLedPrompt({
    userPrompt: prompt,
    objective: `Compose a cinematic hero banner that represents ${safeName}.`,
    subjectContext: "The artwork should render cleanly in a wide 16:9 hero slot with room for UI overlays.",
    baseCues: mergedCues,
    baseConstraints: [
      "Avoid text, logos, or watermarks within the art.",
      "Keep visual noise low near the top third so headlines remain legible.",
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
      "Protect the current focal hierarchy and keep key elements within the safe zones.",
    ],
    lighting: [
      "Fine-tune lighting to reinforce depth without washing out important regions.",
    ],
    mood: ["Match the existing vibe unless the user asks for a change in tone."],
  };
  const mergedCues = mergePersonaCues(baseCues, persona ?? null);
  return composeUserLedPrompt({
    userPrompt: prompt,
    objective: "Refresh the existing hero banner while keeping it 16:9 and overlay-friendly.",
    subjectContext:
      "Preserve the primary focal point and overall composition so the update still feels like the same capsule.",
    baseCues: mergedCues,
    baseConstraints: [
      "Avoid adding text, logos, or watermark-like elements.",
      "Maintain clear space for UI overlays near the top and center.",
    ],
    styleId: stylePreset ?? null,
  });
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
          size: "1024x1024",
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
            size: "1024x1024",
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




