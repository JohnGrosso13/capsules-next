import { getDatabaseAdminClient } from "@/config/database";
import { captionImage, captionVideo } from "@/lib/ai/openai";
import { ensureAccessibleMediaUrl } from "@/server/posts/media";

const CAPTION_KEY = "ai_caption";
const CAPTION_SOURCE_KEY = "ai_caption_source";
const CAPTION_UPDATED_KEY = "ai_caption_updated_at";

type CaptionCacheRow = {
  id: string;
  media_url: string | null;
  meta: Record<string, unknown> | null;
};

type CaptionRequest = {
  memoryId?: string | null;
  mediaUrl?: string | null;
  mimeType?: string | null;
  thumbnailUrl?: string | null;
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function normalizeUuid(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed.length || !UUID_PATTERN.test(trimmed)) return null;
  return trimmed;
}

function readCachedCaption(meta: Record<string, unknown> | null): string | null {
  if (!meta || typeof meta !== "object") return null;
  const raw = (meta as { [CAPTION_KEY]?: unknown })[CAPTION_KEY];
  if (typeof raw === "string" && raw.trim().length) {
    return raw.trim();
  }
  return null;
}

async function loadMemoryById(id: string): Promise<CaptionCacheRow | null> {
  const db = getDatabaseAdminClient();
  try {
    const result = await db
      .from("memories")
      .select<CaptionCacheRow>("id, media_url, meta")
      .eq("id", id)
      .maybeSingle();
    if (result.error) {
      console.warn("caption cache memory lookup failed", result.error);
      return null;
    }
    return result.data ?? null;
  } catch (error) {
    console.warn("caption cache memory lookup error", error);
    return null;
  }
}

async function loadMemoryByUrl(url: string): Promise<CaptionCacheRow | null> {
  const db = getDatabaseAdminClient();
  try {
    const result = await db
      .from("memories")
      .select<CaptionCacheRow>("id, media_url, meta")
      .eq("media_url", url)
      .eq("is_latest", true)
      .limit(1)
      .maybeSingle();
    if (result.error) {
      console.warn("caption cache memory url lookup failed", result.error);
      return null;
    }
    return result.data ?? null;
  } catch (error) {
    console.warn("caption cache memory url lookup error", error);
    return null;
  }
}

async function updateCaptionMeta(id: string, meta: Record<string, unknown>, caption: string, source: string) {
  const db = getDatabaseAdminClient();
  const updatedMeta: Record<string, unknown> = { ...meta };
  updatedMeta[CAPTION_KEY] = caption;
  updatedMeta[CAPTION_SOURCE_KEY] = source;
  updatedMeta[CAPTION_UPDATED_KEY] = new Date().toISOString();
  try {
    const result = await db
      .from("memories")
      .update({ meta: updatedMeta })
      .eq("id", id)
      .select("id")
      .maybeSingle();
    if (result.error) {
      console.warn("caption cache meta update failed", result.error);
    }
  } catch (error) {
    console.warn("caption cache meta update error", error);
  }
}

type CaptionGenerationResult = {
  caption: string;
  source: string;
};

async function generateCaptionForMedia(
  mediaUrl: string | null,
  mimeType: string | null,
  thumbnailUrl: string | null,
): Promise<CaptionGenerationResult | null> {
  const accessibleMedia = await ensureAccessibleMediaUrl(mediaUrl);
  const accessibleThumb = await ensureAccessibleMediaUrl(thumbnailUrl);

  const trimmedMime = mimeType ? mimeType.trim().toLowerCase() : null;

  if (trimmedMime && trimmedMime.startsWith("video/")) {
    const caption = await captionVideo(accessibleMedia ?? mediaUrl ?? null, accessibleThumb);
    if (caption && caption.trim().length) {
      const source = accessibleThumb ? "video_thumbnail" : "video";
      return { caption: caption.trim(), source };
    }
    return null;
  }

  const target = accessibleMedia ?? accessibleThumb ?? mediaUrl ?? thumbnailUrl;
  if (!target) return null;
  const caption = await captionImage(target);
  if (!caption || !caption.trim().length) return null;
  const source = accessibleThumb ? "image_thumbnail" : "image";
  return { caption: caption.trim(), source };
}

export async function getOrCreateMemoryCaption({
  memoryId,
  mediaUrl,
  mimeType,
  thumbnailUrl,
}: CaptionRequest): Promise<string | null> {
  let normalizedId = normalizeUuid(memoryId);
  let record: CaptionCacheRow | null = null;

  if (normalizedId) {
    record = await loadMemoryById(normalizedId);
  }

  if (!record && mediaUrl) {
    record = await loadMemoryByUrl(mediaUrl);
    if (record) {
      normalizedId = record.id;
    }
  }

  const existingCaption = readCachedCaption(record?.meta ?? null);
  if (existingCaption) {
    return existingCaption;
  }

  const captionResult = await generateCaptionForMedia(record?.media_url ?? mediaUrl ?? null, mimeType ?? null, thumbnailUrl ?? null);
  if (!captionResult) return null;

  if (normalizedId) {
    await updateCaptionMeta(normalizedId, record?.meta ?? {}, captionResult.caption, captionResult.source);
  }

  return captionResult.caption;
}
