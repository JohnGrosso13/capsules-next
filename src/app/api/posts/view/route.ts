import { NextResponse } from "next/server";

import { ensureUserFromRequest } from "@/lib/auth/payload";
import { deriveRequestOrigin, resolveToAbsoluteUrl } from "@/lib/url";
import { serverEnv } from "@/lib/env/server";
import { normalizePost } from "@/server/posts/normalizers";
import {
  fetchPostViewRowByIdentifier,
  listAttachmentsForPosts,
  type PostsViewRow,
} from "@/server/posts/repository";
import type { NormalizedAttachment } from "@/server/posts/media";
import type { CloudflareImageVariantSet } from "@/lib/cloudflare/images";

export const runtime = "nodejs";

function sanitizeAttachment(
  attachment: NormalizedAttachment,
  originForAssets: string | null,
  cloudflareEnabled: boolean,
): NormalizedAttachment {
  const resolvedUrl = resolveToAbsoluteUrl(attachment.url, originForAssets) ?? attachment.url;
  const resolvedThumb = attachment.thumbnailUrl
    ? resolveToAbsoluteUrl(attachment.thumbnailUrl, originForAssets) ?? attachment.thumbnailUrl
    : attachment.thumbnailUrl ?? null;
  const variants = attachment.variants ?? null;
  let sanitizedVariants: CloudflareImageVariantSet | null = null;
  if (variants) {
    const cloned: CloudflareImageVariantSet = { ...variants };
    cloned.original = resolveToAbsoluteUrl(variants.original, originForAssets) ?? variants.original;
    if (Object.prototype.hasOwnProperty.call(variants, "thumb")) {
      if (variants.thumb == null) {
        cloned.thumb = null;
      } else {
        const sanitizedThumb = resolveToAbsoluteUrl(variants.thumb, originForAssets);
        cloned.thumb = sanitizedThumb ?? variants.thumb;
      }
    } else {
      delete cloned.thumb;
    }
    if (Object.prototype.hasOwnProperty.call(variants, "feed")) {
      if (variants.feed == null) {
        cloned.feed = null;
      } else {
        const sanitizedFeed = resolveToAbsoluteUrl(variants.feed, originForAssets);
        cloned.feed = sanitizedFeed ?? variants.feed;
      }
    } else {
      delete cloned.feed;
    }
    if (Object.prototype.hasOwnProperty.call(variants, "full")) {
      if (variants.full == null) {
        cloned.full = null;
      } else {
        const sanitizedFull = resolveToAbsoluteUrl(variants.full, originForAssets);
        cloned.full = sanitizedFull ?? variants.full;
      }
    } else {
      delete cloned.full;
    }
    sanitizedVariants = cloned;
  }

  if (!cloudflareEnabled && sanitizedVariants) {
    sanitizedVariants = {
      original: resolvedUrl,
      feed: resolvedThumb ?? resolvedUrl,
      thumb: resolvedThumb ?? resolvedUrl,
      full: resolvedUrl,
      feedSrcset: null,
      fullSrcset: null,
    };
  }

  return {
    ...attachment,
    url: resolvedUrl,
    thumbnailUrl: resolvedThumb,
    variants: sanitizedVariants,
  };
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const identifier = typeof body?.id === "string" ? body.id.trim() : "";
  if (!identifier.length) {
    return NextResponse.json({ error: "post id required" }, { status: 400 });
  }

  const viewerId = await ensureUserFromRequest(req, null, { allowGuests: false });
  if (!viewerId) {
    return NextResponse.json({ error: "auth required" }, { status: 401 });
  }

  const origin = deriveRequestOrigin(req) ?? serverEnv.SITE_URL;
  const cloudflareEnabled = true;

  let row: PostsViewRow | null = null;
  try {
    row = await fetchPostViewRowByIdentifier(identifier);
  } catch (error) {
    console.error("post view fetch failed", error);
    return NextResponse.json({ error: "post fetch failed" }, { status: 500 });
  }

  if (!row) {
    return NextResponse.json({ error: "post not found" }, { status: 404 });
  }

  const normalized = normalizePost(row as Record<string, unknown>);

  let attachments: NormalizedAttachment[] = [];
  try {
    const records = await listAttachmentsForPosts([normalized.dbId ?? normalized.id]);
    attachments = records.map((record) => ({
      id: String(record.id ?? normalized.id),
      url: record.media_url ?? "",
      mimeType: record.media_type ?? null,
      name: record.title ?? null,
      thumbnailUrl:
        ((record.meta as Record<string, unknown> | null)?.thumbnail_url as string | null) ?? null,
      storageKey: null,
      meta: record.meta ?? null,
      variants: null,
    }));
  } catch (error) {
    console.warn("post attachments fetch failed", error);
  }

  const sanitizedAttachments = attachments.map((attachment) =>
    sanitizeAttachment(attachment, origin, cloudflareEnabled),
  );

  return NextResponse.json({
    post: {
      ...normalized,
      attachments: sanitizedAttachments,
    },
  });
}
