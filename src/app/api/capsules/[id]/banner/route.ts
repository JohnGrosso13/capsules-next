import { z } from "zod";

import { ensureUserFromRequest } from "@/lib/auth/payload";
import { Buffer } from "node:buffer";

import { updateCapsuleBannerImage } from "@/server/capsules/service";
import { getStorageProvider } from "@/config/storage";
import { generateStorageObjectKey } from "@/lib/storage/keys";
import type { StorageMetadataValue } from "@/ports/storage";
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

const bodySchema = z
  .object({
    imageUrl: z.string().url("imageUrl must be a valid URL").optional().nullable(),
    imageData: z.string().optional().nullable(),
    filename: z.string().optional().nullable(),
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
    memoryId: z.string().uuid().optional().nullable(),
  })
  .refine((value) => value.imageUrl || value.imageData, {
    message: "imageUrl or imageData is required",
    path: ["imageUrl"],
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
    return returnError(
      400,
      "invalid_request",
      "Invalid banner payload.",
      parsedBody.error.flatten(),
    );
  }

  try {
    let finalUrl = parsedBody.data.imageUrl ?? null;
    let finalKey = parsedBody.data.storageKey ?? null;
    const mimeType = parsedBody.data.mimeType ?? "image/jpeg";
    const source = parsedBody.data.source ?? "upload";

    if (parsedBody.data.imageData) {
      const provider = getStorageProvider();
      const buffer = Buffer.from(parsedBody.data.imageData, "base64");
      const key = generateStorageObjectKey({
        prefix: provider.getUploadPrefix(),
        ownerId: ownerId,
        filename: parsedBody.data.filename ?? null,
        contentType: mimeType,
        kind: "capsule_banner",
      });

      const metadata: Record<string, StorageMetadataValue> = {
        capsule_id: parsedParams.data.id,
        source_kind: source,
      };
      if (parsedBody.data.memoryId) {
        metadata.memory_id = parsedBody.data.memoryId;
      }
      if (parsedBody.data.originalName) {
        metadata.original_name = parsedBody.data.originalName;
      }
      if (parsedBody.data.originalUrl) {
        metadata.original_url = parsedBody.data.originalUrl;
      }
      if (parsedBody.data.width) {
        metadata.width = parsedBody.data.width;
      }
      if (parsedBody.data.height) {
        metadata.height = parsedBody.data.height;
      }
      if (parsedBody.data.filename) {
        metadata.upload_filename = parsedBody.data.filename;
      }
      if (mimeType) {
        metadata.mime_type = mimeType;
      }
      if (parsedBody.data.crop) {
        metadata.crop_offset_x = Number(parsedBody.data.crop.offsetX.toFixed(4));
        metadata.crop_offset_y = Number(parsedBody.data.crop.offsetY.toFixed(4));
      }

      const upload = await provider.uploadBuffer({
        key,
        contentType: mimeType,
        body: buffer,
        metadata,
      });

      finalUrl = upload.url;
      finalKey = upload.key;
    }

    if (!finalUrl) {
      throw new Error("Banner upload did not produce a URL");
    }

    const result = await updateCapsuleBannerImage(ownerId, parsedParams.data.id, {
      bannerUrl: finalUrl,
      storageKey: finalKey,
      mimeType,
      crop: parsedBody.data.crop ?? null,
      source,
      originalUrl: parsedBody.data.originalUrl ?? null,
      originalName: parsedBody.data.originalName ?? null,
      prompt: parsedBody.data.prompt ?? null,
      width: parsedBody.data.width ?? null,
      height: parsedBody.data.height ?? null,
      memoryId: parsedBody.data.memoryId ?? null,
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
