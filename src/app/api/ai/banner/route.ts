import { z } from "zod";

import { ensureUserFromRequest } from "@/lib/auth/payload";
import { generateImageFromPrompt, editImageWithInstruction } from "@/lib/ai/prompter";
import { storeImageSrcToSupabase } from "@/lib/supabase/storage";
import { parseJsonBody, returnError, validatedJson } from "@/server/validation/http";

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
});

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

  try {
    if (mode === "generate") {
      const bannerPrompt = buildGenerationPrompt(prompt, effectiveName);
      const generated = await generateImageFromPrompt(bannerPrompt, {
        quality: "high",
        size: "1024x1024",
      });
      const stored = await storeImageSrcToSupabase(generated, "capsule-banner-generate");
      return validatedJson(responseSchema, {
        url: stored?.url ?? generated,
        message:
          "Thanks for sharing that direction! I generated a new hero banner in that spirit - check out the preview on the right.",
      });
    }

    let sourceUrl = imageUrl ?? null;
    if (!sourceUrl && imageData) {
      const stored = await storeImageSrcToSupabase(imageData, "capsule-banner-source");
      sourceUrl = stored?.url ?? null;
    }

    if (!sourceUrl) {
      return returnError(400, "invalid_request", "imageUrl or imageData is required to edit a banner.");
    }

    // Normalize the source into storage to ensure it is fetchable by the image edit API.
    const normalizedSource = await (async () => {
      try {
        const stored = await storeImageSrcToSupabase(sourceUrl as string, "capsule-banner-source");
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
    const stored = await storeImageSrcToSupabase(edited, "capsule-banner-edit");

    return validatedJson(responseSchema, {
      url: stored?.url ?? edited,
      message:
        "Thanks for the update! I remixed the current banner with those notes so you can preview the refresh.",
    });
  } catch (error) {
    console.error("ai.banner error", error);
    const message = error instanceof Error ? error.message : "Failed to update banner.";
    return returnError(500, "banner_generation_failed", message);
  }
}

export const runtime = "nodejs";
