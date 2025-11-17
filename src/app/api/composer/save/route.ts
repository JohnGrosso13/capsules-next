import { NextResponse } from "next/server";
import { z } from "zod";

import { ensureUserFromRequest } from "@/lib/auth/payload";
import { indexMemory } from "@/lib/supabase/memories";

export const runtime = "nodejs";

const memoryItemSchema = z.object({
  title: z.string().min(1),
  description: z.string().min(1),
  kind: z.string().min(1),
  mediaUrl: z.string().min(1),
  mediaType: z.string().nullable().optional(),
  downloadUrl: z.string().nullable().optional(),
  thumbnailUrl: z.string().nullable().optional(),
  prompt: z.string().nullable().optional(),
  muxPlaybackId: z.string().nullable().optional(),
  muxAssetId: z.string().nullable().optional(),
  durationSeconds: z.number().nullable().optional(),
  runId: z.string().nullable().optional(),
  tags: z.array(z.string()).nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).nullable().optional(),
});

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const userPayload = (body?.user as Record<string, unknown>) ?? {};
  const ownerId = await ensureUserFromRequest(req, userPayload, { allowGuests: false });
  if (!ownerId) {
    return NextResponse.json({ error: "auth required" }, { status: 401 });
  }

  const parsed = memoryItemSchema.safeParse(body?.item ?? {});
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid payload", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const item = parsed.data;

  const metadata: Record<string, unknown> = {
    source: "ai-composer",
    category: "capsule_creation",
    designer_kind: item.kind,
  };
  if (item.prompt) metadata.prompt = item.prompt;
  if (item.downloadUrl) metadata.download_url = item.downloadUrl;
  if (item.thumbnailUrl) metadata.thumbnail_url = item.thumbnailUrl;
  if (item.muxPlaybackId) metadata.mux_playback_id = item.muxPlaybackId;
  if (item.muxAssetId) metadata.mux_asset_id = item.muxAssetId;
  if (item.runId) metadata.video_run_id = item.runId;
  if (item.durationSeconds != null) metadata.duration_seconds = item.durationSeconds;
  if (item.metadata && typeof item.metadata === "object") {
    Object.assign(metadata, item.metadata);
  }

  try {
    const memoryId = await indexMemory({
      ownerId,
      kind: "upload",
      mediaUrl: item.mediaUrl,
      mediaType: item.mediaType ?? null,
      title: item.title,
      description: item.description,
      postId: null,
      metadata,
      rawText: [item.title, item.description, item.prompt].filter(Boolean).join("\n\n"),
      source: "ai-composer",
      tags: item.tags?.filter((tag) => typeof tag === "string" && tag.trim().length) ?? [
        "composer",
        "capsule_creation",
        "composer_creation",
      ],
    });

    return NextResponse.json({ success: true, memoryId });
  } catch (error) {
    console.error("composer save error", error);
    return NextResponse.json({ error: "Failed to save creation" }, { status: 500 });
  }
}
