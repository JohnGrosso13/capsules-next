import "server-only";

import { encodeBase64 } from "@/lib/base64";
import { storeImageSrcToSupabase } from "@/lib/supabase/storage";
import { resolveToAbsoluteUrl } from "@/lib/url";
import type { AiImageVariant } from "@/shared/schemas/ai";

export type PersistedImage = {
  url: string;
  imageData: string | null;
  mimeType: string | null;
};

export type VariantRecord = Pick<
  AiImageVariant,
  | "id"
  | "runId"
  | "assetKind"
  | "branchKey"
  | "version"
  | "imageUrl"
  | "thumbUrl"
  | "metadata"
  | "parentVariantId"
  | "createdAt"
>;

export type AssetResponse = {
  url: string;
  message?: string | null;
  imageData?: string | null;
  mimeType?: string | null;
  variant?: VariantRecord | null;
};

export async function persistAndDescribeImage(
  source: string,
  filenameHint: string,
  options: { baseUrl?: string | null } = {},
): Promise<PersistedImage> {
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
        const bytes = new Uint8Array(arrayBuffer);
        base64Data = encodeBase64(bytes);
        mimeType = contentType;
        normalizedSource = `data:${contentType};base64,${base64Data}`;
      }
    } catch (error) {
      console.warn("customizer.persistImage: failed to normalize remote image", error);
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
    console.warn("customizer.persistImage: failed to store image", error);
  }

  return {
    url: storedUrl,
    imageData: base64Data,
    mimeType,
  };
}

export function toVariantResponse(record: VariantRecord | null): VariantRecord | null {
  if (!record) return null;
  return {
    id: record.id,
    runId: record.runId,
    assetKind: record.assetKind,
    branchKey: record.branchKey,
    version: record.version,
    imageUrl: record.imageUrl,
    thumbUrl: record.thumbUrl,
    metadata: record.metadata ?? {},
    parentVariantId: record.parentVariantId ?? null,
    createdAt: record.createdAt,
  };
}
