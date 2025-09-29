import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import {
  isAdminRequest,
  mergeUserPayloadFromRequest,
  ensureUserFromRequest,
} from "@/lib/auth/payload";
import { fetchPostRowByIdentifier, markPostAttachmentsUnused } from "@/lib/supabase/posts";
import { softDeletePostById } from "@/server/posts/repository";

export async function DELETE(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const rawId = decodeURIComponent(id ?? "").trim();
  if (!rawId) {
    return NextResponse.json({ error: "post id required" }, { status: 400 });
  }

  let body: Record<string, unknown> | null = null;
  try {
    body = await req.json();
  } catch {
    // ignore empty body
  }

  const userPayload = mergeUserPayloadFromRequest(
    req,
    (body?.user as Record<string, unknown>) ?? {},
  );
  const requesterId = await ensureUserFromRequest(req, userPayload, { allowGuests: false });
  if (!requesterId) {
    return NextResponse.json({ error: "auth required" }, { status: 401 });
  }

  const postRow = await fetchPostRowByIdentifier(rawId);
  if (!postRow) {
    return NextResponse.json({ error: "post not found" }, { status: 404 });
  }

  const isOwner = postRow.author_user_id ? String(postRow.author_user_id) === requesterId : false;
  const hasAdminOverride = isOwner
    ? false
    : await isAdminRequest(
        req,
        userPayload,
        postRow.author_user_id ? String(postRow.author_user_id) : null,
      );

  if (!isOwner && !hasAdminOverride) {
    return NextResponse.json({ error: "not allowed" }, { status: 403 });
  }

  const deletionTime = new Date().toISOString();
  if (postRow.deleted_at) {
    return NextResponse.json({
      success: true,
      alreadyDeleted: true,
      id: postRow.client_id ?? postRow.id,
      deletedAt: postRow.deleted_at,
      attachments: { memories: 0, legacy: 0 },
    });
  }

  try {
    await softDeletePostById(String(postRow.id), deletionTime);
  } catch (error) {
    console.error("Soft delete error", error);
    return NextResponse.json({ error: "Failed to delete post" }, { status: 500 });
  }

  const attachments = await markPostAttachmentsUnused(
    postRow as {
      id: string;
      client_id?: string | null;
      author_user_id?: string | null;
      media_url?: string | null;
    },
    deletionTime,
  );

  return NextResponse.json({
    success: true,
    id: postRow.client_id ?? postRow.id,
    deletedAt: deletionTime,
    attachments,
  });
}
