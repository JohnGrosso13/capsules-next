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

function buildGenerationPrompt(prompt: string, capsuleName: string): string {
  const safeName = capsuleName.trim().length ? capsuleName.trim() : "your capsule";
  const instructions = [
    `Design a bold, memorable square logo for the Capsule community "${safeName}".`,
    "Keep the mark centered, high-contrast, and readable inside a rounded-square mask.",
    "Avoid dense typography or long phrases—favor initials, iconography, or abstract shapes.",
    `Creative direction: ${prompt.trim()}`,
  ];
  return instructions.join(" ");
}

function buildEditInstruction(prompt: string): string {
  const instructions = [
    "Refine this logo while keeping a balanced square composition and clean silhouette.",
    "Do not introduce lengthy text or watermarks. Preserve clarity at small sizes.",
    `Apply the following direction: ${prompt.trim()}`,
  ];
  return instructions.join(" ");
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

  const { prompt, mode, capsuleName, imageUrl, imageData } = parsed.data;
  const effectiveName = typeof capsuleName === "string" ? capsuleName : "";
  const requestOrigin = deriveRequestOrigin(req) ?? serverEnv.SITE_URL;

  try {
    if (mode === "generate") {
      const logoPrompt = buildGenerationPrompt(prompt, effectiveName);
      const generated = await generateImageFromPrompt(logoPrompt, {
        quality: "high",
        size: "768x768",
      });
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

    const instruction = buildEditInstruction(prompt);
    const edited = await editImageWithInstruction(normalizedSource, instruction, {
      quality: "high",
      size: "768x768",
    });
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
