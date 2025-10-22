import { NextResponse } from "next/server";
import { z } from "zod";

import { ensureUserFromRequest } from "@/lib/auth/payload";
import { listAiImageVariants } from "@/server/ai/image-variants";
import { aiImageVariantSchema } from "@/shared/schemas/ai";
import { returnError } from "@/server/validation/http";

const querySchema = z.object({
  assetKind: z.string().min(1),
  capsuleId: z.string().uuid().optional(),
  branchKey: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

const variantResponseSchema = aiImageVariantSchema.pick({
  id: true,
  runId: true,
  assetKind: true,
  branchKey: true,
  version: true,
  imageUrl: true,
  thumbUrl: true,
  metadata: true,
  parentVariantId: true,
  createdAt: true,
});

const variantListResponseSchema = z.object({
  variants: z.array(variantResponseSchema),
});

function toVariantResponse(record: z.infer<typeof aiImageVariantSchema>) {
  return variantResponseSchema.parse({
    id: record.id,
    runId: record.runId,
    assetKind: record.assetKind,
    branchKey: record.branchKey,
    version: record.version,
    imageUrl: record.imageUrl,
    thumbUrl: record.thumbUrl,
    metadata: record.metadata ?? {},
    parentVariantId: record.parentVariantId,
    createdAt: record.createdAt,
  });
}

export async function GET(req: Request) {
  const ownerId = await ensureUserFromRequest(req, {}, { allowGuests: false });
  if (!ownerId) {
    return returnError(401, "auth_required", "Sign in to view AI image versions.");
  }

  const url = new URL(req.url);
  const rawParams: Record<string, string> = {};
  url.searchParams.forEach((value, key) => {
    rawParams[key] = value;
  });
  const parsedQuery = querySchema.safeParse(rawParams);
  if (!parsedQuery.success) {
    return returnError(400, "invalid_request", "Invalid query parameters.", {
      issues: parsedQuery.error.issues,
    });
  }

  const { assetKind, capsuleId, branchKey, limit } = parsedQuery.data;

  try {
    const variants = await listAiImageVariants({
      ownerUserId: ownerId,
      capsuleId: capsuleId ?? null,
      assetKind,
      branchKey: branchKey ?? null,
      limit: limit ?? 20,
    });

    const payload = {
      variants: variants.map(toVariantResponse),
    };

    return NextResponse.json(variantListResponseSchema.parse(payload));
  } catch (error) {
    console.error("ai.variants list error", error);
    return returnError(500, "variant_list_failed", "Failed to load image variants.");
  }
}

export const runtime = "edge";
