import { z } from "zod";

import { ensureUserFromRequest } from "@/lib/auth/payload";
import { generateImageFromPrompt, editImageWithInstruction } from "@/lib/ai/prompter";
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

function buildGenerationPrompt(prompt: string, capsuleName: string): string {
  const safeName = capsuleName.trim().length ? capsuleName.trim() : "your capsule";
  const instructions = [
    `Design a cinematic hero banner for the Capsule community "${safeName}".`,
    "Output should suit a 16:9 layout with clear focal point, depth, and soft gradients for UI overlays.",
    "Avoid text, logos, watermarks, or heavy typography. Keep it vibrant but balanced.",
    `Creative direction: ${prompt.trim()}`,
  ];
  return instructions.join(" ");
}

function buildEditInstruction(prompt: string): string {
  const instructions = [
    "Refine this hero banner while keeping a clean 16:9 composition and preserving the existing focal balance.",
    "Do not add text or logos. Maintain clarity and coherent lighting.",
    `Apply the following direction: ${prompt.trim()}`,
  ];
  return instructions.join(" ");
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

  const { prompt, mode, capsuleName, imageUrl, imageData } = parsed.data;
  const effectiveName = typeof capsuleName === "string" ? capsuleName : "";
  const requestOrigin = deriveRequestOrigin(req) ?? serverEnv.SITE_URL;

  try {
    if (mode === "generate") {
      const bannerPrompt = buildGenerationPrompt(prompt, effectiveName);
      const generated = await generateImageFromPrompt(bannerPrompt, {
        quality: "high",
        size: "1024x1024",
      });
      const stored = await persistAndDescribeImage(generated, "capsule-banner-generate", {
        baseUrl: requestOrigin,
      });
      return validatedJson(responseSchema, {
        url: stored.url,
        message:
          "Thanks for sharing that direction! I generated a new hero banner in that spirit - check out the preview on the right.",
        imageData: stored.imageData ?? undefined,
        mimeType: stored.mimeType ?? undefined,
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

    const instruction = buildEditInstruction(prompt);
    const edited = await editImageWithInstruction(normalizedSource, instruction, {
      quality: "high",
      size: "1024x1024",
    });
    const stored = await persistAndDescribeImage(edited, "capsule-banner-edit", {
      baseUrl: requestOrigin,
    });

    return validatedJson(responseSchema, {
      url: stored.url,
      message:
        "Thanks for the update! I remixed the current banner with those notes so you can preview the refresh.",
      imageData: stored.imageData ?? undefined,
      mimeType: stored.mimeType ?? undefined,
    });
  } catch (error) {
    console.error("ai.banner error", error);
    const message = error instanceof Error ? error.message : "Failed to update banner.";
    return returnError(500, "banner_generation_failed", message);
  }
}

export const runtime = "nodejs";
