import { z } from "zod";

import { ensureUserFromRequest } from "@/lib/auth/payload";
import { generateImageFromPrompt, editImageWithInstruction } from "@/lib/ai/prompter";
import { composeUserLedPrompt } from "@/lib/ai/prompt-styles";
import { storeImageSrcToSupabase } from "@/lib/supabase/storage";
import { aiImageVariantSchema } from "@/shared/schemas/ai";
import { createAiImageVariant, type AiImageVariantRecord } from "@/server/ai/image-variants";
import { deriveRequestOrigin, resolveToAbsoluteUrl } from "@/lib/url";
import { serverEnv } from "@/lib/env/server";
import { parseJsonBody, returnError, validatedJson } from "@/server/validation/http";
import { Buffer } from "node:buffer";
import {
  checkRateLimit,
  retryAfterSeconds as computeRetryAfterSeconds,
  type RateLimitDefinition,
} from "@/server/rate-limit";

const requestSchema = z.object({
  prompt: z.string().min(1),
  mode: z.enum(["generate", "edit"]).default("generate"),
  displayName: z.string().optional().nullable(),
  imageUrl: z.string().url().optional(),
  imageData: z.string().min(1).optional(),
  stylePreset: z.string().min(1).optional(),
  capsuleId: z.string().uuid().optional(),
  variantId: z.string().uuid().optional(),
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

const AVATAR_RATE_LIMIT: RateLimitDefinition = {
  name: "ai.avatar",
  limit: 10,
  window: "30 m",
};

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
      console.warn("ai.avatar: failed to normalize remote image", error);
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
    console.warn("ai.avatar: failed to store image to supabase", error);
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

function buildGenerationPrompt(prompt: string, displayName: string, stylePreset?: string | null): string {
  const safeName = displayName.trim().length ? displayName.trim() : "the profile owner";
  return composeUserLedPrompt({
    userPrompt: prompt,
    objective: `Create a polished avatar portrait that represents ${safeName}.`,
    subjectContext:
      "The avatar should remain legible when cropped inside a circle and displayed at small sizes.",
    baseCues: {
      composition: [
        "Center the subject with a gentle edge fade so it fits cleanly inside a circular mask.",
        "Keep the background understated to maintain clarity at profile-photo scale.",
      ],
      lighting: [
        "Use flattering, diffused lighting that avoids harsh shadows and highlights facial features softly.",
      ],
      palette: [
        "Choose balanced colors that stay readable on both light and dark UI themes.",
      ],
      medium: [
        "Lean toward modern digital illustration or photoreal rendering depending on the user prompt.",
      ],
      mood: [
        "Aim for confident, approachable energy unless the user suggests otherwise.",
      ],
    },
    baseConstraints: [
      "Avoid text, logos, or watermarks.",
      "Do not introduce heavy borders or distracting patterns.",
    ],
    styleId: stylePreset ?? null,
  });
}

function buildEditInstruction(prompt: string, stylePreset?: string | null): string {
  return composeUserLedPrompt({
    userPrompt: prompt,
    objective: "Update the existing avatar while keeping it circle-safe and instantly recognizable.",
    subjectContext:
      "Maintain the subject's proportions and framing so the refreshed avatar still represents the same profile.",
    baseCues: {
      composition: [
        "Preserve a centered layout with minimal background clutter.",
        "Keep edges tidy for a clean circular crop.",
      ],
      lighting: [
        "Stay close to the existing lighting, using soft adjustments to refine the mood.",
      ],
      mood: [
        "Honor the current personality unless the user specifically requests a shift.",
      ],
    },
    baseConstraints: [
      "Avoid adding text, logos, watermarks, or busy textures.",
      "Do not introduce heavy borders or elements that break the circular silhouette.",
    ],
    styleId: stylePreset ?? null,
  });
}

export async function POST(req: Request) {
  const ownerId = await ensureUserFromRequest(req, {}, { allowGuests: false });
  if (!ownerId) {
    return returnError(401, "auth_required", "Sign in to customize your avatar.");
  }

  const parsed = await parseJsonBody(req, requestSchema);
  if (!parsed.success) {
    return parsed.response;
  }

  const rateLimitResult = await checkRateLimit(AVATAR_RATE_LIMIT, ownerId);
  if (rateLimitResult && !rateLimitResult.success) {
    const retryAfterSeconds = computeRetryAfterSeconds(rateLimitResult.reset);
    return returnError(
      429,
      "rate_limited",
      "You’ve hit the avatar refresh limit. Give it a little time before trying again.",
      retryAfterSeconds === null ? undefined : { retryAfterSeconds },
    );
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
  } = parsed.data;
  const capsuleId = typeof capsuleIdRaw === "string" ? capsuleIdRaw : undefined;
  const effectiveName = typeof displayName === "string" ? displayName : "";
  const requestOrigin = deriveRequestOrigin(req) ?? serverEnv.SITE_URL;

  try {
    if (mode === "generate") {
      const avatarPrompt = buildGenerationPrompt(prompt, effectiveName, stylePreset);
      const generated = await generateImageFromPrompt(
        avatarPrompt,
        {
          quality: "high",
          size: "768x768",
        },
        {
          ownerId,
          assetKind: "avatar",
          mode: "generate",
          userPrompt: prompt,
          resolvedPrompt: avatarPrompt,
          stylePreset: stylePreset ?? null,
          options: { displayName: effectiveName || null },
        },
      );
      const stored = await persistAndDescribeImage(generated.url, "profile-avatar-generate", {
        baseUrl: requestOrigin,
      });
      let variantRecord: AiImageVariantRecord | null = null;
      try {
        variantRecord = await createAiImageVariant({
          ownerUserId: ownerId,
          capsuleId: capsuleId ?? null,
          assetKind: "avatar",
          imageUrl: stored.url,
          thumbUrl: stored.url,
          runId: generated.runId,
          metadata: {
            mode: "generate",
            userPrompt: prompt,
            resolvedPrompt: avatarPrompt,
            stylePreset: stylePreset ?? null,
            provider: generated.provider,
            responseMetadata: generated.metadata ?? null,
          },
        });
      } catch (error) {
        console.warn("ai.avatar: failed to record variant", error);
      }

      const variantResponse = toVariantResponse(variantRecord);

      return validatedJson(responseSchema, {
        url: stored.url,
        message:
          "Thanks for the direction! I generated a circular avatar that should look great throughout the product.",
        imageData: stored.imageData ?? undefined,
        mimeType: stored.mimeType ?? undefined,
        ...(variantResponse ? { variant: variantResponse } : {}),
      });
    }

    let sourceUrl = imageUrl ?? null;
    if (!sourceUrl && imageData) {
      const stored = await storeImageSrcToSupabase(imageData, "profile-avatar-source", {
        baseUrl: requestOrigin,
      });
      sourceUrl = stored?.url ?? null;
    }

    if (!sourceUrl) {
      return returnError(
        400,
        "invalid_request",
        "imageUrl or imageData is required to edit an avatar.",
      );
    }

    const normalizedSource = await (async () => {
      try {
        const stored = await storeImageSrcToSupabase(sourceUrl as string, "profile-avatar-source", {
          baseUrl: requestOrigin,
        });
        return stored?.url ?? sourceUrl!;
      } catch {
        return sourceUrl!;
      }
    })();

    const instruction = buildEditInstruction(prompt, stylePreset);
    const edited = await editImageWithInstruction(
      normalizedSource,
      instruction,
      {
        quality: "high",
        size: "768x768",
      },
      {
        ownerId,
        assetKind: "avatar",
        mode: "edit",
        userPrompt: prompt,
        resolvedPrompt: instruction,
        stylePreset: stylePreset ?? null,
        options: { displayName: effectiveName || null },
      },
    );
    const stored = await persistAndDescribeImage(edited.url, "profile-avatar-edit", {
      baseUrl: requestOrigin,
    });

    let variantRecord: AiImageVariantRecord | null = null;
    try {
      variantRecord = await createAiImageVariant({
        ownerUserId: ownerId,
        capsuleId: capsuleId ?? null,
        assetKind: "avatar",
        imageUrl: stored.url,
        thumbUrl: stored.url,
        runId: edited.runId,
        parentVariantId: variantId ?? null,
        metadata: {
          mode: "edit",
          userPrompt: prompt,
          resolvedPrompt: instruction,
          stylePreset: stylePreset ?? null,
          provider: edited.provider,
          baseVariantId: variantId ?? null,
          sourceImageUrl: normalizedSource,
          responseMetadata: edited.metadata ?? null,
        },
      });
    } catch (error) {
      console.warn("ai.avatar: failed to record edited variant", error);
    }

    const variantResponse = toVariantResponse(variantRecord);

    return validatedJson(responseSchema, {
      url: stored.url,
      message: "Got it! I refreshed the avatar with those notes so you can review the update here.",
      imageData: stored.imageData ?? undefined,
      mimeType: stored.mimeType ?? undefined,
      ...(variantResponse ? { variant: variantResponse } : {}),
    });
  } catch (error) {
    console.error("ai.avatar error", error);
    const message = error instanceof Error ? error.message : "Failed to update avatar.";
    return returnError(500, "avatar_generation_failed", message);
  }
}

export const runtime = "nodejs";
