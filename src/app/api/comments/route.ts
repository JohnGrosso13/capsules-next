import { NextResponse } from "next/server";

import { ensureUserFromRequest } from "@/lib/auth/payload";
import { persistCommentToDB } from "@/server/posts/comments";
import { resolvePostId } from "@/server/posts/identifiers";
import { listCommentsForPost, fetchCommentById } from "@/server/posts/repository";
import { notifyPostComment } from "@/server/notifications/triggers";

export const runtime = "edge";

type CommentAttachmentResponse = {
  id: string;
  url: string;
  name: string | null;
  mimeType: string | null;
  thumbnailUrl: string | null;
  size: number | null;
  storageKey: string | null;
  sessionId: string | null;
  source: string | null;
};

type CommentRow = Record<string, unknown>;

function coerceString(value: unknown): string | null {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length ? trimmed : null;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }
  return null;
}

function parseAttachments(value: unknown): CommentAttachmentResponse[] {
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return parseAttachments(parsed);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(value)) return [];
  const attachments: CommentAttachmentResponse[] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== "object") continue;
    const record = entry as Record<string, unknown>;
    const url = coerceString(record.url ?? record.href);
    if (!url) continue;
    const id = coerceString(record.id ?? record.client_id ?? record.clientId) ?? url;
    const mime =
      coerceString(record.mime_type) ?? coerceString(record.mimeType) ?? null;
    const thumb =
      coerceString(record.thumbnail_url) ?? coerceString(record.thumbnailUrl) ?? null;
    const name =
      coerceString(record.name) ?? coerceString(record.title) ?? null;
    let size: number | null = null;
    if (typeof record.size === "number" && Number.isFinite(record.size)) {
      size = Math.max(0, Math.trunc(record.size));
    } else if (typeof record.size === "string" && record.size.trim().length) {
      const parsed = Number.parseInt(record.size.trim(), 10);
      size = Number.isFinite(parsed) ? Math.max(0, parsed) : null;
    }
    const storageKey =
      coerceString(record.storage_key) ?? coerceString(record.storageKey);
    const sessionId =
      coerceString(record.session_id) ?? coerceString(record.sessionId);
    const source = coerceString(record.source);
    attachments.push({
      id,
      url,
      name,
      mimeType: mime,
      thumbnailUrl: thumb,
      size,
      storageKey,
      sessionId,
      source,
    });
  }
  return attachments;
}

function formatCommentRow(
  row: CommentRow,
  rawPostId: string | null,
  resolvedPostId: string | null,
) {
  const identifier =
    coerceString(row.client_id) ??
    coerceString(row.clientId) ??
    coerceString(row.id) ??
    coerceString(rawPostId) ??
    coerceString(resolvedPostId) ??
    null;
  const postId =
    coerceString(rawPostId) ??
    coerceString(row.post_id) ??
    coerceString(resolvedPostId);
  return {
    id: identifier,
    postId,
    content: typeof row.content === "string" ? row.content : null,
    userId:
      typeof row.user_id === "string"
        ? row.user_id
        : typeof row.userId === "string"
          ? row.userId
          : null,
    userName:
      typeof row.user_name === "string"
        ? row.user_name
        : typeof row.userName === "string"
          ? row.userName
          : null,
    userAvatar:
      typeof row.user_avatar === "string"
        ? row.user_avatar
        : typeof row.userAvatar === "string"
          ? row.userAvatar
          : null,
    capsuleId:
      typeof row.capsule_id === "string"
        ? row.capsule_id
        : typeof row.capsuleId === "string"
          ? row.capsuleId
          : null,
    ts:
      typeof row.created_at === "string"
        ? row.created_at
        : typeof row.ts === "string"
          ? row.ts
          : new Date().toISOString(),
    attachments: parseAttachments((row as { attachments?: unknown }).attachments ?? null),
  };
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const rawPostId = url.searchParams.get("postId") ?? url.searchParams.get("post_id");
  const resolved = await resolvePostId(rawPostId);
  if (!resolved) {
    return NextResponse.json({ success: true, comments: [] });
  }

  let rows;
  try {
    rows = await listCommentsForPost(resolved, 200);
  } catch (error) {
    console.error("Fetch comments error", error);
    return NextResponse.json({ error: "Failed to fetch comments" }, { status: 500 });
  }

  const comments = rows.map((row) => formatCommentRow(row as CommentRow, rawPostId, resolved));

  return NextResponse.json({ success: true, comments });
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const comment = (body?.comment as Record<string, unknown>) ?? null;
  if (!comment) {
    return NextResponse.json({ error: "comment required" }, { status: 400 });
  }

  const userPayload = (body?.user as Record<string, unknown>) ?? {};
  const userId = await ensureUserFromRequest(req, userPayload, { allowGuests: false });
  if (!userId) {
    return NextResponse.json({ error: "auth required" }, { status: 401 });
  }

  try {
    const commentId = await persistCommentToDB(comment, userId);
    const persisted = commentId ? await fetchCommentById(commentId) : null;
    const responseComment = persisted
      ? formatCommentRow(persisted as CommentRow, (comment.postId as string) ?? null, null)
      : formatCommentRow(comment, (comment.postId as string) ?? null, null);

    void notifyPostComment({
      postId: responseComment.postId,
      commentAuthorId: userId,
      commentAuthorName: responseComment.userName,
      commentContent: responseComment.content ?? null,
      capsuleId: responseComment.capsuleId ?? null,
    });

    return NextResponse.json({ success: true, comment: responseComment });
  } catch (error) {
    console.error("Persist comment error", error);
    return NextResponse.json({ error: "Failed to save comment" }, { status: 500 });
  }
}
