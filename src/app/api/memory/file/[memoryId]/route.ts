import { NextResponse } from "next/server";

import { ensureUserFromRequest } from "@/lib/auth/payload";
import { getDatabaseAdminClient } from "@/config/database";
import { deriveRequestOrigin, resolveToAbsoluteUrl } from "@/lib/url";
import { serverEnv } from "@/lib/env/server";

const db = getDatabaseAdminClient();

type MemoryFileRow = {
  id: string;
  owner_user_id: string | null;
  media_url: string | null;
  media_type: string | null;
  title: string | null;
  meta: Record<string, unknown> | null;
};

export const runtime = "nodejs";

function sanitizeFilename(name: string): string {
  return name.replace(/[\\"]/g, "_").trim() || "document";
}

function readMetaString(meta: Record<string, unknown> | null, keys: string[]): string | null {
  if (!meta) return null;
  for (const key of keys) {
    const value = (meta as Record<string, unknown>)[key];
    if (typeof value === "string") {
      const trimmed = value.trim();
      if (trimmed.length) return trimmed;
    }
  }
  return null;
}

export async function GET(
  req: Request,
  context: { params: { memoryId?: string } },
) {
  const memoryIdParam = context.params?.memoryId ?? null;
  if (!memoryIdParam) {
    return NextResponse.json({ error: "Memory id required." }, { status: 400 });
  }

  const memoryId = decodeURIComponent(memoryIdParam).trim();
  if (!memoryId.length) {
    return NextResponse.json({ error: "Memory id required." }, { status: 400 });
  }

  const ownerId = await ensureUserFromRequest(req, null, { allowGuests: false });
  if (!ownerId) {
    return NextResponse.json({ error: "auth required" }, { status: 401 });
  }

  const result = await db
    .from("memories")
    .select<MemoryFileRow>("id, owner_user_id, media_url, media_type, title, meta")
    .eq("id", memoryId)
    .maybeSingle();

  if (result.error) {
    const code = result.error.code ?? "";
    if (code === "PGRST116" || code === "PGRST204") {
      return NextResponse.json({ error: "Memory not found." }, { status: 404 });
    }
    console.error("memory file lookup failed", result.error);
    return NextResponse.json({ error: "Failed to load memory." }, { status: 500 });
  }

  const record = result.data;
  if (!record || record.owner_user_id !== ownerId) {
    return NextResponse.json({ error: "Memory not found." }, { status: 404 });
  }

  const mediaUrl =
    typeof record.media_url === "string" && record.media_url.trim().length
      ? record.media_url.trim()
      : null;
  if (!mediaUrl) {
    return NextResponse.json({ error: "Memory file unavailable." }, { status: 404 });
  }

  const requestOrigin = deriveRequestOrigin(req) ?? serverEnv.SITE_URL;
  const absoluteUrl = resolveToAbsoluteUrl(mediaUrl, requestOrigin);
  if (!absoluteUrl) {
    return NextResponse.json({ error: "Memory file unavailable." }, { status: 400 });
  }

  let upstream: Response;
  try {
    upstream = await fetch(absoluteUrl);
  } catch (error) {
    console.error("memory file fetch failed", absoluteUrl, error);
    return NextResponse.json({ error: "Failed to download memory file." }, { status: 502 });
  }

  if (!upstream.ok || !upstream.body) {
    console.error("memory file upstream error", absoluteUrl, upstream.status);
    return NextResponse.json({ error: "Failed to download memory file." }, { status: 502 });
  }

  const meta =
    record.meta && typeof record.meta === "object" ? (record.meta as Record<string, unknown>) : null;

  const url = new URL(req.url);
  const downloadParam = url.searchParams.get("download");
  const shouldDownload =
    typeof downloadParam === "string" &&
    ["1", "true", "download", "yes"].includes(downloadParam.toLowerCase());

  const preferredName =
    readMetaString(meta, ["file_original_name", "original_name", "fileName"]) ??
    record.title ??
    `memory-${memoryId}`;
  const safeName = sanitizeFilename(preferredName);
  const encodedName = encodeURIComponent(preferredName);

  const headers = new Headers();
  const upstreamType = upstream.headers.get("content-type");
  const contentType =
    (typeof record.media_type === "string" && record.media_type.trim().length
      ? record.media_type.trim()
      : upstreamType) ?? "application/octet-stream";
  headers.set("Content-Type", contentType);

  const contentLength = upstream.headers.get("content-length");
  if (contentLength) {
    headers.set("Content-Length", contentLength);
  }

  headers.set("Cache-Control", "private, max-age=60");
  headers.set(
    "Content-Disposition",
    `${shouldDownload ? "attachment" : "inline"}; filename="${safeName}"; filename*=UTF-8''${encodedName}`,
  );

  const auditTasks: Array<Promise<unknown>> = [];
  auditTasks.push(
    db
      .rpc("mark_memory_view", {
        p_memory_id: memoryId,
        p_viewer_id: ownerId,
      })
      .catch((error) => {
        console.warn("memory view audit failed", error);
      }),
  );

  const sessionId =
    readMetaString(meta, ["upload_session_id", "uploadSessionId"]) ?? null;
  if (sessionId) {
    auditTasks.push(
      db
        .rpc("mark_upload_session_access", {
          p_session_id: sessionId,
          p_user_id: ownerId,
        })
        .catch((error) => {
          console.warn("upload session audit failed", error);
        }),
    );
  }

  void Promise.allSettled(auditTasks);

  return new Response(upstream.body, {
    status: upstream.status,
    headers,
  });
}
