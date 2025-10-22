import { z } from "zod";

import { ensureUserFromRequest } from "@/lib/auth/payload";
import { generateImageFromPrompt, editImageWithInstruction } from "@/lib/ai/prompter";
import { storeImageSrcToSupabase } from "@/lib/supabase/storage";
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
});

const responseSchema = z.object({
  url: z.string(),
  message: z.string().optional(),
  imageData: z.string().optional(),
  mimeType: z.string().optional(),
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

function buildGenerationPrompt(prompt: string, displayName: string): string {
  const safeName = displayName.trim().length ? displayName.trim() : "your profile";
  const instructions = [
    `Design a polished circular avatar portrait for the profile "${safeName}".`,
    "Use a clean 1:1 composition with flattering lighting, focus on the face or icon centered within a circle.",
    "Avoid text, brand marks, or heavy backgrounds. Keep edges soft and readable at small sizes.",
    `Creative direction: ${prompt.trim()}`,
  ];
  return instructions.join(" ");
}

function buildEditInstruction(prompt: string): string {
  const instructions = [
    "Refine this avatar while keeping a balanced circular composition and clean lighting.",
    "Stay focused on the subject. Avoid adding text, watermarks, or cluttered backgrounds.",
    `Apply the following direction: ${prompt.trim()}`,
  ];
  return instructions.join(" ");
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

  const { prompt, mode, displayName, imageUrl, imageData } = parsed.data;
  const effectiveName = typeof displayName === "string" ? displayName : "";
  const requestOrigin = deriveRequestOrigin(req) ?? serverEnv.SITE_URL;

  try {
    if (mode === "generate") {
      const avatarPrompt = buildGenerationPrompt(prompt, effectiveName);
      const generated = await generateImageFromPrompt(avatarPrompt, {
        quality: "high",
        size: "768x768",
      });
      const stored = await persistAndDescribeImage(generated, "profile-avatar-generate", {
        baseUrl: requestOrigin,
      });
      return validatedJson(responseSchema, {
        url: stored.url,
        message:
          "Thanks for the direction! I generated a circular avatar that should look great throughout the product.",
        imageData: stored.imageData ?? undefined,
        mimeType: stored.mimeType ?? undefined,
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

    const instruction = buildEditInstruction(prompt);
    const edited = await editImageWithInstruction(normalizedSource, instruction, {
      quality: "high",
      size: "768x768",
    });
    const stored = await persistAndDescribeImage(edited, "profile-avatar-edit", {
      baseUrl: requestOrigin,
    });

    return validatedJson(responseSchema, {
      url: stored.url,
      message: "Got it! I refreshed the avatar with those notes so you can review the update here.",
      imageData: stored.imageData ?? undefined,
      mimeType: stored.mimeType ?? undefined,
    });
  } catch (error) {
    console.error("ai.avatar error", error);
    const message = error instanceof Error ? error.message : "Failed to update avatar.";
    return returnError(500, "avatar_generation_failed", message);
  }
}

export const runtime = "nodejs";
