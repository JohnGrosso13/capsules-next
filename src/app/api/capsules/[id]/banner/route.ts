import { z } from "zod";

import { ensureUserFromRequest } from "@/lib/auth/payload";
import { updateCapsuleBannerImage } from "@/server/capsules/service";
import { returnError, validatedJson } from "@/server/validation/http";

type BannerParamsContext = {
  params: { id: string } | Promise<{ id: string }>;
};

async function resolveCapsuleParams(context: BannerParamsContext): Promise<{ id: string }> {
  const params = context.params;
  if (params instanceof Promise) {
    return params;
  }
  return params;
}

const paramsSchema = z.object({
  id: z.string().uuid("capsule id must be a valid UUID"),
});

const bodySchema = z.object({
  imageUrl: z.string().url("imageUrl must be a valid URL"),
  storageKey: z.string().optional().nullable(),
  mimeType: z.string().optional().nullable(),
  crop: z
    .object({
      offsetX: z.number().finite().min(-1).max(1),
      offsetY: z.number().finite().min(-1).max(1),
    })
    .optional()
    .nullable(),
  source: z.enum(["upload", "memory", "ai"]).optional().nullable(),
  originalUrl: z.string().url().optional().nullable(),
  originalName: z.string().optional().nullable(),
  prompt: z.string().optional().nullable(),
  width: z.number().int().positive().optional().nullable(),
  height: z.number().int().positive().optional().nullable(),
});

const responseSchema = z.object({
  bannerUrl: z.string().nullable(),
});

export async function POST(req: Request, context: BannerParamsContext) {
  const ownerId = await ensureUserFromRequest(req, {}, { allowGuests: false });
  if (!ownerId) {
    return returnError(401, "auth_required", "Sign in to update capsule banner.");
  }

  const params = await resolveCapsuleParams(context);
  const parsedParams = paramsSchema.safeParse(params);
  if (!parsedParams.success) {
    return returnError(400, "invalid_request", "Invalid capsule id.", parsedParams.error.flatten());
  }

  const json = await req.json().catch(() => null);
  const parsedBody = bodySchema.safeParse(json);
  if (!parsedBody.success) {
    return returnError(400, "invalid_request", "Invalid banner payload.", parsedBody.error.flatten());
  }

  try {
    const result = await updateCapsuleBannerImage(ownerId, parsedParams.data.id, {
      bannerUrl: parsedBody.data.imageUrl,
      storageKey: parsedBody.data.storageKey ?? null,
      mimeType: parsedBody.data.mimeType ?? null,
      crop: parsedBody.data.crop ?? null,
      source: parsedBody.data.source ?? null,
      originalUrl: parsedBody.data.originalUrl ?? null,
      originalName: parsedBody.data.originalName ?? null,
      prompt: parsedBody.data.prompt ?? null,
      width: parsedBody.data.width ?? null,
      height: parsedBody.data.height ?? null,
    });
    return validatedJson(responseSchema, result);
  } catch (error) {
    console.error("capsules.banner.update error", error);
    if (error instanceof Error && "status" in error) {
      const status = Number((error as { status?: number }).status) || 500;
      return returnError(status, "capsules_error", error.message);
    }
    return returnError(500, "capsules_error", "Failed to update capsule banner.");
  }
}

export const runtime = "nodejs";
