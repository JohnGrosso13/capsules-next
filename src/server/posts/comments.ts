import { safeRandomUUID } from "@/lib/random";

import { upsertCommentRow } from "./repository";
import { resolvePostId } from "./identifiers";
import { normalizeUuid, pruneNullish } from "./utils";

export async function persistCommentToDB(comment: Record<string, unknown>, userId: string | null) {
  const now = new Date().toISOString();
  const postId = await resolvePostId((comment.postId as string) ?? (comment.post_id as string));
  const commentCapsuleId = normalizeUuid(
    typeof comment.capsuleId === "string"
      ? (comment.capsuleId as string)
      : typeof comment.capsule_id === "string"
        ? (comment.capsule_id as string)
        : null,
  );
  if ((comment.capsuleId || comment.capsule_id) && !commentCapsuleId) {
    throw new Error("capsuleId must be a UUID");
  }

  const attachments = normalizeCommentAttachmentsInput(
    Array.isArray((comment as { attachments?: unknown }).attachments)
      ? (comment as { attachments?: unknown[] }).attachments
      : null,
  );

  const row = {
    client_id: String(comment.id ?? ""),
    post_id: postId,
    content: String(comment.content ?? ""),
    user_id: userId ?? null,
    user_name: (comment.userName as string) ?? null,
    user_avatar: (comment.userAvatar as string) ?? null,
    capsule_id: commentCapsuleId,
    created_at: (comment.ts as string) ?? now,
    updated_at: now,
    source: String(comment.source ?? "web"),
    attachments,
  };
  if (!row.post_id || !row.content) {
    const err = new Error("post_id and content required");
    throw err;
  }
  return upsertCommentRow(row);
}

function normalizeCommentAttachmentsInput(value: unknown): Record<string, unknown>[] | null {
  if (!Array.isArray(value)) return null;
  const attachments: Record<string, unknown>[] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== "object") continue;
    const record = entry as Record<string, unknown>;
    const rawUrl = (() => {
      const maybeUrl = record.url ?? record.sourceUrl ?? record.href;
      if (typeof maybeUrl === "string" && maybeUrl.trim().length) return maybeUrl.trim();
      return "";
    })();
    if (!rawUrl.length) continue;
    const idValue = record.id ?? record.clientId ?? record.client_id;
    const id =
      typeof idValue === "string" && idValue.trim().length ? idValue.trim() : safeRandomUUID();
    const normalized: Record<string, unknown> = {
      id,
      url: rawUrl,
      name:
        typeof record.name === "string" && record.name.trim().length
          ? record.name.trim()
          : typeof record.title === "string" && record.title.trim().length
            ? record.title.trim()
            : null,
      mime_type:
        typeof record.mimeType === "string" && record.mimeType.trim().length
          ? record.mimeType.trim()
          : typeof record.mime_type === "string" && record.mime_type.trim().length
            ? record.mime_type.trim()
            : null,
      thumbnail_url:
        typeof record.thumbnailUrl === "string" && record.thumbnailUrl.trim().length
          ? record.thumbnailUrl.trim()
          : typeof record.thumbnail_url === "string" && record.thumbnail_url.trim().length
            ? record.thumbnail_url.trim()
            : null,
      size:
        typeof record.size === "number" && Number.isFinite(record.size)
          ? Math.max(0, Math.trunc(record.size))
          : typeof record.size === "string" && record.size.trim().length
            ? Number.parseInt(record.size.trim(), 10) || null
            : null,
      storage_key:
        typeof record.storageKey === "string" && record.storageKey.trim().length
          ? record.storageKey.trim()
          : typeof record.storage_key === "string" && record.storage_key.trim().length
            ? record.storage_key.trim()
            : null,
      session_id:
        typeof record.sessionId === "string" && record.sessionId.trim().length
          ? record.sessionId.trim()
          : typeof record.session_id === "string" && record.session_id.trim().length
            ? record.session_id.trim()
            : null,
      source:
        typeof record.source === "string" && record.source.trim().length
          ? record.source.trim()
          : null,
    };
    attachments.push(pruneNullish(normalized));
  }
  return attachments.length ? attachments : null;
}
