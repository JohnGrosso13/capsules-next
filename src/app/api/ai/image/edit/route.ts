import { parseJsonBody, validatedJson } from "@/server/validation/http";
import { z } from "zod";
import { editImageWithInstruction } from "@/lib/ai/prompter";

const requestSchema = z.object({
  imageUrl: z.string().url(),
  instruction: z.string().min(1),
  options: z
    .object({
      quality: z.string().optional(),
      size: z.string().optional(),
    })
    .optional(),
});

const responseSchema = z.object({ url: z.string() });

export async function POST(req: Request) {
  const parsed = await parseJsonBody(req, requestSchema);
  if (!parsed.success) return parsed.response;
  const { imageUrl, instruction, options } = parsed.data;
  const safeOptions = options
    ? {
        ...(typeof options.quality === "string" ? { quality: options.quality } : {}),
        ...(typeof options.size === "string" ? { size: options.size } : {}),
      }
    : {};
  const url = await editImageWithInstruction(imageUrl, instruction, safeOptions);
  return validatedJson(responseSchema, { url });
}

export const runtime = "nodejs";
