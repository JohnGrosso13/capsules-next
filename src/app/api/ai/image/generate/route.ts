import { parseJsonBody, validatedJson, returnError } from "@/server/validation/http";
import { z } from "zod";
import { generateImageFromPrompt } from "@/lib/ai/prompter";
import { ensureUserFromRequest } from "@/lib/auth/payload";

const requestSchema = z.object({
  prompt: z.string().min(1),
  options: z
    .object({
      quality: z.string().optional(),
      size: z.string().optional(),
    })
    .optional(),
});

const responseSchema = z.object({ url: z.string() });

export async function POST(req: Request) {
  // Require authentication to prevent abuse and unexpected costs
  const ownerId = await ensureUserFromRequest(req, {}, { allowGuests: false });
  if (!ownerId) {
    return returnError(401, "auth_required", "Authentication required");
  }

  const parsed = await parseJsonBody(req, requestSchema);
  if (!parsed.success) return parsed.response;
  const { prompt, options } = parsed.data;
  const safeOptions = options
    ? {
        ...(typeof options.quality === "string" ? { quality: options.quality } : {}),
        ...(typeof options.size === "string" ? { size: options.size } : {}),
      }
    : {};
  const url = await generateImageFromPrompt(prompt, safeOptions);
  return validatedJson(responseSchema, { url });
}

export const runtime = "nodejs";
