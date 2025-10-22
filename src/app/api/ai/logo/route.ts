import { z } from "zod";

import { ensureUserFromRequest } from "@/lib/auth/payload";
import { generateImageFromPrompt, editImageWithInstruction } from "@/lib/ai/prompter";
import { composeUserLedPrompt } from "@/lib/ai/prompt-styles";
import { storeImageSrcToSupabase } from "@/lib/supabase/storage";
import { deriveRequestOrigin, resolveToAbsoluteUrl } from "@/lib/url";
import { serverEnv } from "@/lib/env/server";
import { parseJsonBody, returnError, validatedJson } from "@/server/validation/http";
import { Buffer } from "node:buffer";

const requestSchema = z.object({
  prompt: z.string().min(1),
  mode: z.enum(["generate", "edit"]).default("generate"),
  capsuleName: z.string().optional().nullable(),
  imageUrl: z.string().url().optional(),
  imageData: z.string().min(1).optional(),
  stylePreset: z.string().min(1).optional(),
});

const responseSchema = z.object({
  url: z.string(),
  message: z.string().optional(),
  imageData: z.string().optional(),
  mimeType: z.string().optional(),
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

function buildGenerationPrompt(prompt: string, capsuleName: string, stylePreset?: string | null): string {
  const safeName = capsuleName.trim().length ? capsuleName.trim() : "the capsule";
  return composeUserLedPrompt({
    userPrompt: prompt,
    objective: `Create a distinctive square logo that represents ${safeName}.`,
    subjectContext: "The mark should remain crisp inside a rounded-square mask across Capsule surfaces.",
    baseCues: {
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
    },
    baseConstraints: [
      "Avoid long text, taglines, or watermark elements.",
      "Keep shapes simple enough for small favicon usage.",
    ],
    styleId: stylePreset ?? null,
  });
}

function buildEditInstruction(prompt: string, stylePreset?: string | null): string {
  return composeUserLedPrompt({
    userPrompt: prompt,
    objective: "Refresh the existing logo while preserving its core structure and recognizability.",
    subjectContext: "Keep the logo square-friendly so it continues to work inside Capsule's rounded mask.",
    baseCues: {
      composition: [
        "Maintain the current balance of positive and negative space.",
      ],
      palette: [
        "Adjust colors thoughtfully so the mark retains contrast at smaller sizes.",
      ],
      mood: [
        "Stay aligned with the existing personality unless the user requests a new tone.",
      ],
    },
    baseConstraints: [
      "Avoid introducing dense typography, lengthy text, or watermark effects.",
      "Preserve clean edges suitable for vector export.",
    ],
    styleId: stylePreset ?? null,
  });
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

  const { prompt, mode, capsuleName, imageUrl, imageData, stylePreset } = parsed.data;
  const effectiveName = typeof capsuleName === "string" ? capsuleName : "";
  const requestOrigin = deriveRequestOrigin(req) ?? serverEnv.SITE_URL;

  try {
    if (mode === "generate") {
      const logoPrompt = buildGenerationPrompt(prompt, effectiveName, stylePreset);
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
          options: { capsuleName: effectiveName || null },
        },
      );
      const stored = await persistAndDescribeImage(generated, "capsule-logo-generate", {
        baseUrl: requestOrigin,
      });
      return validatedJson(responseSchema, {
        url: stored.url,
        message:
          "Thanks for the idea! I drafted a square logo that should feel great across tiles, rails, and settings.",
        imageData: stored.imageData ?? undefined,
        mimeType: stored.mimeType ?? undefined,
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
        assetKind: "logo",
        mode: "edit",
        userPrompt: prompt,
        resolvedPrompt: instruction,
        stylePreset: stylePreset ?? null,
        options: { capsuleName: effectiveName || null, sourceImageUrl: normalizedSource },
      },
    );
    const stored = await persistAndDescribeImage(edited, "capsule-logo-edit", {
      baseUrl: requestOrigin,
    });

    return validatedJson(responseSchema, {
      url: stored.url,
      message:
        "Appreciate the notes! I refreshed the logo with those changes so you can review it here.",
      imageData: stored.imageData ?? undefined,
      mimeType: stored.mimeType ?? undefined,
    });
  } catch (error) {
    console.error("ai.logo error", error);
    const message = error instanceof Error ? error.message : "Failed to update logo.";
    return returnError(500, "logo_generation_failed", message);
  }
}

export const runtime = "nodejs";
