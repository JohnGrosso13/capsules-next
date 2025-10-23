import { NextResponse } from "next/server";
import { z } from "zod";

import { ensureUserFromRequest } from "@/lib/auth/payload";
import { getDatabaseAdminClient } from "@/config/database";
import { deriveRequestOrigin, resolveToAbsoluteUrl } from "@/lib/url";
import { serverEnv } from "@/lib/env/server";
import { normalizeLegacyMemoryRow } from "@/server/posts/service";

const db = getDatabaseAdminClient();

const requestSchema = z.object({
  memoryId: z
    .string()
    .min(1, "memoryId is required")
    .transform((value) => value.trim()),
  user: z.record(z.string(), z.unknown()).optional().nullable(),
});

type MemoryMediaRow = {
  id: string | null;
  owner_user_id: string | null;
  media_url: string | null;
  media_type: string | null;
  view_count: number | null;
};

export const runtime = "nodejs";

async function fetchModernMemory(
  ownerId: string,
  memoryId: string,
): Promise<MemoryMediaRow | null | undefined> {
  const result = await db
    .from("memories")
    .select<MemoryMediaRow>("id, owner_user_id, media_url, media_type, view_count")
    .eq("id", memoryId)
    .maybeSingle();

  if (result.error) {
    if (result.error.code === "PGRST116" || result.error.code === "PGRST204") {
      return undefined;
    }
    throw result.error;
  }

  if (!result.data) return null;
  if (result.data.owner_user_id !== ownerId) return null;
  if (!result.data) return null;
  return {
    id: typeof result.data.id === "string" ? result.data.id : null,
    owner_user_id: result.data.owner_user_id,
    media_url: result.data.media_url,
    media_type: result.data.media_type,
    view_count:
      typeof result.data.view_count === "number"
        ? result.data.view_count
        : typeof (result.data as { view_count?: unknown }).view_count === "string"
          ? Number((result.data as { view_count?: string }).view_count) || 0
          : 0,
  };
}

async function fetchLegacyMemory(
  ownerId: string,
  memoryId: string,
): Promise<MemoryMediaRow | null> {
  const candidateColumns = ["id", "uuid", "item_id", "memory_id"];
  for (const column of candidateColumns) {
    try {
      const legacy = await db
        .from("memory_items")
        .select<Record<string, unknown>>("*")
        .eq("owner_user_id", ownerId)
        .eq(column, memoryId)
        .maybeSingle();

      if (legacy.error) {
        if (
          legacy.error.code === "PGRST116" ||
          legacy.error.code === "PGRST204" ||
          legacy.error.code === "PGRST205" ||
          legacy.error.code === "42703"
        ) {
          continue;
        }
        throw legacy.error;
      }

      if (!legacy.data) {
        continue;
      }

      const normalized = normalizeLegacyMemoryRow(legacy.data);
      const mediaUrl =
        typeof normalized.media_url === "string" && normalized.media_url.trim().length
          ? normalized.media_url.trim()
          : null;

      if (!mediaUrl) {
        continue;
      }

  return {
    id: null,
    owner_user_id: ownerId,
    media_url: mediaUrl,
    media_type:
      typeof normalized.media_type === "string" && normalized.media_type.trim().length
        ? normalized.media_type.trim()
        : null,
    view_count: null,
  };
    } catch (error) {
      console.warn("memory legacy lookup error", column, error);
    }
  }
  return null;
}

async function resolveMemoryMedia(
  ownerId: string,
  memoryId: string,
): Promise<MemoryMediaRow | null> {
  const modern = await fetchModernMemory(ownerId, memoryId);
  if (modern !== undefined) {
    return modern;
  }
  return await fetchLegacyMemory(ownerId, memoryId);
}

export async function POST(req: Request) {
  const json = await req.json().catch(() => null);
  const parsed = requestSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid memory request." }, { status: 400 });
  }

  const ownerId = await ensureUserFromRequest(
    req,
    (parsed.data.user as Record<string, unknown>) ?? {},
    {
      allowGuests: false,
    },
  );
  if (!ownerId) {
    return NextResponse.json({ error: "auth required" }, { status: 401 });
  }

  const memoryId = parsed.data.memoryId.trim();
  if (!memoryId.length) {
    return NextResponse.json({ error: "Memory id is required." }, { status: 400 });
  }

  try {
    const record = await resolveMemoryMedia(ownerId, memoryId);
    if (!record) {
      return NextResponse.json({ error: "Memory not found." }, { status: 404 });
    }

    const mediaUrl =
      typeof record.media_url === "string" && record.media_url.trim().length
        ? record.media_url.trim()
        : null;
    if (!mediaUrl) {
      return NextResponse.json({ error: "Memory media unavailable." }, { status: 404 });
    }

    const memoryIdForAudit = record.id;
    if (memoryIdForAudit) {
      try {
        await db.rpc("mark_memory_view", {
          p_memory_id: memoryIdForAudit,
          p_viewer_id: ownerId,
        });
      } catch (auditError) {
        console.warn("memory view audit failed", auditError);
      }
    }

    const baseOrigin = deriveRequestOrigin(req) ?? serverEnv.SITE_URL;
    const absoluteUrl = resolveToAbsoluteUrl(mediaUrl, baseOrigin);
    if (!absoluteUrl) {
      return NextResponse.json({ error: "Memory media unavailable." }, { status: 400 });
    }

    const upstream = await fetch(absoluteUrl);
    if (!upstream.ok) {
      console.error("memory image fetch failed", absoluteUrl, upstream.status);
      return NextResponse.json({ error: "Failed to download memory media." }, { status: 502 });
    }

    const contentType =
      upstream.headers.get("content-type") ??
      (typeof record.media_type === "string" && record.media_type.trim().length
        ? record.media_type
        : "application/octet-stream");
    const buffer = await upstream.arrayBuffer();

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "private, max-age=60",
      },
    });
  } catch (error) {
    console.error("memory image proxy error", error);
    return NextResponse.json({ error: "Failed to fetch memory image." }, { status: 500 });
  }
}
