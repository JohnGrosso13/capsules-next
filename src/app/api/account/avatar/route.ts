import { z } from "zod";

import { ensureUserFromRequest } from "@/lib/auth/payload";

import { updateUserAvatarImage, clearUserAvatar } from "@/server/users/service";
import { getStorageService } from "@/config/storage";
import { generateStorageObjectKey } from "@/lib/storage/keys";
import type { StorageMetadataValue } from "@/ports/storage";
import { returnError, validatedJson } from "@/server/validation/http";
import { deriveRequestOrigin } from "@/lib/url";
import { decodeBase64Payload } from "@/lib/base64";

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
  avatarUrl: z.string().nullable(),
});

export async function POST(req: Request) {
  const ownerId = await ensureUserFromRequest(req, {}, { allowGuests: false });
  if (!ownerId) {
    return returnError(401, "auth_required", "Sign in to update your avatar.");
  }

  const json = await req.json().catch(() => null);
  const parsedBody = bodySchema.safeParse(json);
  if (!parsedBody.success) {
    return returnError(
      400,
      "invalid_request",
      "Invalid avatar payload.",
      parsedBody.error.flatten(),
    );
  }

  try {
    const requestOrigin = deriveRequestOrigin(req);
    let finalUrl = parsedBody.data.imageUrl ?? null;
    let finalKey = parsedBody.data.storageKey ?? null;
    const mimeType = parsedBody.data.mimeType ?? "image/jpeg";
    const source = parsedBody.data.source ?? "upload";

    const rawImageData = parsedBody.data.imageData;
    if (typeof rawImageData === "string" && rawImageData.trim().length) {
      const storage = getStorageService();
      const bytes = decodeBase64Payload(rawImageData);
      const key = generateStorageObjectKey({
        prefix: storage.getUploadPrefix(),
        ownerId,
        filename: parsedBody.data.filename ?? null,
        contentType: mimeType,
        kind: "profile_avatar",
      });

      const metadata: Record<string, StorageMetadataValue> = {
        user_id: ownerId,
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

      const upload = await storage.uploadBuffer({
        key,
        contentType: mimeType,
        body: bytes,
        metadata,
      });

      finalUrl = upload.url;
      finalKey = upload.key;
    }

    if (!finalUrl) {
      throw new Error("Avatar upload did not produce a URL");
    }

    const result = await updateUserAvatarImage(
      ownerId,
      {
        avatarUrl: finalUrl,
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
      },
      { origin: requestOrigin ?? null },
    );

    return validatedJson(responseSchema, result);
  } catch (error) {
    console.error("account.avatar.update error", error);
    return returnError(500, "avatar_update_failed", "Failed to update your avatar.");
  }
}

export async function DELETE(req: Request) {
  const ownerId = await ensureUserFromRequest(req, {}, { allowGuests: false });
  if (!ownerId) {
    return returnError(401, "auth_required", "Sign in to manage your avatar.");
  }

  try {
    const result = await clearUserAvatar(ownerId);
    return validatedJson(responseSchema, result);
  } catch (error) {
    console.error("account.avatar.delete error", error);
    return returnError(500, "avatar_reset_failed", "Failed to reset your avatar.");
  }
}

export const runtime = "nodejs";
