import { CreatePostInput } from "./types";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { storeImageSrcToSupabase } from "@/lib/supabase/storage";
import { indexMemory } from "@/lib/supabase/memories";
import { captionImage } from "@/lib/ai/openai";

function parseMaybeJSON(value: unknown): Record<string, unknown> | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "string") {
    try {
      return JSON.parse(value);
    } catch {
      return null;
    }
  }
  if (typeof value === "object" && !Array.isArray(value)) return value as Record<string, unknown>;
  return null;
}

function toPlainObject(value: unknown): Record<string, unknown> {
  const parsed = parseMaybeJSON(value);
  if (parsed) return { ...parsed };
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return { ...(value as Record<string, unknown>) };
  }
  return {};
}

function collectMetaSources(row: Record<string, unknown>): Array<Record<string, unknown>> {
  const sources: Array<Record<string, unknown>> = [];
  const candidates = [
    row.meta,
    row.metadata,
    row.data,
    row.details,
    row.payload,
    row.extra,
    row.info,
  ];
  candidates.forEach((candidate) => {
    const parsed = parseMaybeJSON(candidate);
    if (parsed) sources.push(parsed);
  });
  return sources;
}

function firstDefined<T>(obj: Record<string, unknown>, keys: string[]): T | null {
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      const value = obj[key];
      if (value !== undefined && value !== null && String(value).length) {
        return value as T;
      }
    }
  }
  return null;
}

function deepFindByKeys(obj: Record<string, unknown>, keys: string[]): unknown {
  const queue: Array<Record<string, unknown>> = [obj];
  const visited = new Set<Record<string, unknown>>();
  while (queue.length) {
    const current = queue.shift();
    if (!current || typeof current !== "object") continue;
    if (visited.has(current)) continue;
    visited.add(current);
    const shallow = firstDefined(current, keys as string[]);
    if (shallow) return shallow;
    Object.values(current).forEach((value) => {
      if (value && typeof value === "object" && !Array.isArray(value)) {
        queue.push(value as Record<string, unknown>);
      }
    });
  }
  return null;
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function normalizeUuid(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return UUID_REGEX.test(trimmed) ? trimmed : null;
}

function resolveValue(
  row: Record<string, unknown>,
  metaSources: Array<Record<string, unknown>>,
  keys: string[],
) {
  const direct = firstDefined(row, keys);
  if (direct) return direct;
  for (const source of metaSources) {
    if (!source || typeof source !== "object") continue;
    const shallow = firstDefined(source, keys);
    if (shallow) return shallow;
    const deep = deepFindByKeys(source, keys);
    if (deep) return deep;
  }
  return null;
}

export function normalizeLegacyMemoryRow(row: Record<string, unknown>) {
  const metaSources = collectMetaSources(row);
  const mediaUrl = resolveValue(row, metaSources, [
    "media_url",
    "url",
    "asset_url",
    "storage_path",
    "file_url",
    "public_url",
    "path",
  ]);
  const mediaType = resolveValue(row, metaSources, [
    "media_type",
    "type",
    "asset_type",
    "content_type",
    "mime_type",
  ]);
  const title = resolveValue(row, metaSources, ["title", "name", "label", "headline"]);
  const description = resolveValue(row, metaSources, [
    "description",
    "summary",
    "caption",
    "notes",
    "details",
    "text",
  ]);
  const createdAt = resolveValue(row, metaSources, [
    "created_at",
    "inserted_at",
    "createdAt",
    "created_at_utc",
    "timestamp",
  ]);
  const resolvedKind = (resolveValue(row, metaSources, ["kind", "category", "type"]) ||
    row.kind ||
    row.type ||
    row.category ||
    "upload") as string;
  const id = (row.id || row.uuid || row.item_id || row.memory_id || crypto.randomUUID()) as string;

  return {
    id,
    kind: String(resolvedKind || "upload").toLowerCase(),
    media_url: mediaUrl || null,
    media_type: mediaType || null,
    title: title ? String(title) : "",
    description: description ? String(description) : "",
    created_at: createdAt || new Date().toISOString(),
    meta: metaSources.length ? metaSources[0] : null,
  };
}

function parseAdminMeta(deletionTime: string, postId: string | null) {
  const meta = toPlainObject({});
  meta.status = "unused";
  meta.unused_reason = "post_deleted";
  meta.unused_at = deletionTime;
  if (postId) meta.deleted_post_id = postId;
  return meta;
}

export async function markLegacyMemoryItemsUnused({
  ownerId,
  clientId,
  mediaUrl,
  deletionTime,
}: {
  ownerId: string | null;
  clientId: string | null;
  mediaUrl: string | null;
  deletionTime: string;
}) {
  if (!ownerId) return 0;
  const supabase = getSupabaseAdminClient();
  let updated = 0;
  const attempts: Array<[string, string]> = [];
  if (clientId) attempts.push(["post_id", clientId]);
  if (mediaUrl) attempts.push(["media_url", mediaUrl]);
  for (const [column, value] of attempts) {
    try {
      const res = await supabase
        .from("memory_items")
        .update({ meta: parseAdminMeta(deletionTime, clientId) })
        .eq("owner_user_id", ownerId)
        .eq(column, value)
        .select("id");
      if (!res.error) {
        updated += Array.isArray(res.data) ? res.data.length : 0;
      }
    } catch (err) {
      console.warn("markLegacyMemoryItemsUnused error", err);
    }
  }
  return updated;
}

export async function markPostAttachmentsUnused(
  postRow: {
    id: string;
    client_id?: string | null;
    author_user_id?: string | null;
    media_url?: string | null;
  },
  deletionTime: string,
) {
  const supabase = getSupabaseAdminClient();
  const ownerId = postRow.author_user_id ?? null;
  if (!ownerId) return { memories: 0, legacy: 0 };
  const clientId = postRow.client_id ?? null;
  const mediaUrl = postRow.media_url ?? null;
  let memoryUpdates = 0;
  const seen = new Set<string>();

  const updateMemories = async (column: string, value: string | null) => {
    if (!value) return;
    const res = await supabase
      .from("memories")
      .select("id, meta")
      .eq("owner_user_id", ownerId)
      .eq(column, value);
    if (res.error) {
      const msg = String(res.error.message || "").toLowerCase();
      if (
        msg.includes("does not exist") ||
        res.error.code === "PGRST204" ||
        res.error.code === "42703"
      )
        return;
      throw res.error;
    }
    for (const row of res.data ?? []) {
      if (!row || !row.id) continue;
      const id = String(row.id);
      if (seen.has(id)) continue;
      const nextMeta = parseAdminMeta(deletionTime, clientId ?? postRow.id);
      const updateRes = await supabase
        .from("memories")
        .update({ meta: nextMeta, updated_at: deletionTime })
        .eq("id", row.id);
      if (!updateRes.error) {
        seen.add(id);
        memoryUpdates += 1;
      }
    }
  };

  try {
    await updateMemories("post_id", clientId);
    await updateMemories("media_url", mediaUrl);
  } catch (err) {
    console.warn("markPostAttachmentsUnused memory error", err);
  }

  let legacyUpdates = 0;
  try {
    legacyUpdates = await markLegacyMemoryItemsUnused({
      ownerId,
      clientId,
      mediaUrl,
      deletionTime,
    });
  } catch (err) {
    console.warn("markPostAttachmentsUnused legacy error", err);
  }

  return { memories: memoryUpdates, legacy: legacyUpdates };
}

const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function fetchPostRowByIdentifier(identifier: string) {
  const supabase = getSupabaseAdminClient();
  const normalized = identifier.trim();
  if (!normalized) return null;
  const attempts: Array<{ column: string; value: string | number }> = [];
  if (uuidRegex.test(normalized)) attempts.push({ column: "id", value: normalized });
  if (/^\d+$/.test(normalized)) attempts.push({ column: "id", value: Number(normalized) });
  attempts.push({ column: "client_id", value: normalized });

  for (const attempt of attempts) {
    const { data, error } = await supabase
      .from("posts")
      .select("id, client_id, author_user_id, media_url, deleted_at")
      .eq(attempt.column, attempt.value)
      .maybeSingle();
    if (error) {
      const msg = String(error.message || "").toLowerCase();
      if (msg.includes("row not found") || error.code === "PGRST116" || error.code === "406")
        continue;
      throw error;
    }
    if (data) return data;
  }
  return null;
}

export async function resolvePostId(maybeId: string | null | undefined) {
  const supabase = getSupabaseAdminClient();
  const value = String(maybeId ?? "").trim();
  if (!value) return null;
  if (uuidRegex.test(value)) return value;
  const { data, error } = await supabase
    .from("posts")
    .select("id")
    .eq("client_id", value)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) throw error;
  return data ? (data.id as string) : null;
}

export async function persistCommentToDB(comment: Record<string, unknown>, userId: string | null) {
  const supabase = getSupabaseAdminClient();
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
  };
  if (!row.post_id || !row.content) {
    const err = new Error("post_id and content required");
    throw err;
  }
  const { data, error } = await supabase
    .from("comments")
    .upsert([row], { onConflict: "client_id" })
    .select("id")
    .single();
  if (error) throw error;
  return data.id as string;
}

function normalizeTags(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  try {
    const normalized = Array.from(
      new Set(
        value
          .filter((entry): entry is string => typeof entry === "string")
          .map((entry) => entry.trim().toLowerCase())
          .filter(Boolean)
          .map((entry) => entry.replace(/[^a-z0-9_\-]/g, "").slice(0, 24))
          .filter(Boolean),
      ),
    );
    return normalized.length ? normalized.slice(0, 10) : null;
  } catch {
    return null;
  }
}

function pruneNullish(payload: Record<string, unknown>) {
  const output: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(payload)) {
    if (value === undefined || value === null) continue;
    if (typeof value === "string" && !value.length) continue;
    output[key] = value;
  }
  return output;
}

export async function createPostRecord(post: CreatePostInput, ownerId: string) {
  const supabase = getSupabaseAdminClient();
  const now = new Date().toISOString();
  const draft = { ...post } as Record<string, unknown>;

  const mediaUrl =
    typeof draft.mediaUrl === "string"
      ? draft.mediaUrl.trim()
      : typeof draft.media_url === "string"
        ? (draft.media_url as string).trim()
        : "";
  if (mediaUrl && (/^data:/i.test(mediaUrl) || /^https?:/i.test(mediaUrl))) {
    try {
      const stored = await storeImageSrcToSupabase(mediaUrl, "post");
      if (stored?.url) {
        draft.mediaUrl = stored.url;
        draft.media_url = stored.url;
      }
    } catch (error) {
      console.warn("storeImageSrcToSupabase failed", error);
    }
  }

  const clientId =
    typeof draft.id === "string" && draft.id.trim()
      ? draft.id.trim()
      : typeof draft.client_id === "string" && draft.client_id.trim()
        ? (draft.client_id as string).trim()
        : null;

  const rawCapsuleId =
    typeof draft.capsuleId === "string"
      ? draft.capsuleId
      : typeof draft.capsule_id === "string"
        ? (draft.capsule_id as string)
        : null;
  const capsuleId = normalizeUuid(rawCapsuleId);
  if (rawCapsuleId && !capsuleId) {
    throw new Error("capsuleId must be a UUID");
  }

  const row = pruneNullish({
    client_id: clientId,
    kind: String(draft.kind ?? "text"),
    content: String(draft.content ?? ""),
    created_at: typeof draft.ts === "string" ? draft.ts : now,
    updated_at: now,
    source: String(draft.source ?? "web"),
    media_url:
      typeof draft.mediaUrl === "string"
        ? draft.mediaUrl
        : typeof draft.media_url === "string"
          ? draft.media_url
          : null,
    media_prompt:
      typeof draft.mediaPrompt === "string"
        ? draft.mediaPrompt
        : typeof draft.media_prompt === "string"
          ? draft.media_prompt
          : null,
    user_name:
      typeof draft.userName === "string"
        ? draft.userName
        : typeof draft.user_name === "string"
          ? draft.user_name
          : null,
    user_avatar:
      typeof draft.userAvatar === "string"
        ? draft.userAvatar
        : typeof draft.user_avatar === "string"
          ? draft.user_avatar
          : null,
    capsule_id: capsuleId,
    author_user_id: ownerId,
    poll: draft.poll ?? undefined,
  });

  const tags = normalizeTags(draft.tags);
  if (tags) row.tags = tags;

  let existing: Record<string, unknown> | null = null;
  if (row.client_id) {
    const { data, error } = await supabase
      .from("posts")
      .select("id, capsule_id, media_url, media_prompt, user_name, user_avatar, source, created_at")
      .eq("client_id", row.client_id)
      .is("deleted_at", null)
      .maybeSingle();
    if (!error && data) existing = data as Record<string, unknown>;
  }

  if (existing) {
    if (!row.capsule_id && existing.capsule_id) row.capsule_id = existing.capsule_id;
    if (!row.media_url && existing.media_url) row.media_url = existing.media_url;
    if (!row.media_prompt && existing.media_prompt) row.media_prompt = existing.media_prompt;
    if (!row.user_name && existing.user_name) row.user_name = existing.user_name;
    if (!row.user_avatar && existing.user_avatar) row.user_avatar = existing.user_avatar;
    if (!row.source && existing.source) row.source = existing.source;
    if (existing.created_at) row.created_at = existing.created_at;
  }

  if ((!row.user_name || !row.user_avatar) && ownerId) {
    try {
      const { data: ownerProfile } = await supabase
        .from("users")
        .select("full_name, avatar_url")
        .eq("id", ownerId)
        .maybeSingle();
      if (ownerProfile) {
        if (
          !row.user_name &&
          typeof ownerProfile.full_name === "string" &&
          ownerProfile.full_name.trim()
        ) {
          row.user_name = ownerProfile.full_name.trim();
        }
        if (
          !row.user_avatar &&
          typeof ownerProfile.avatar_url === "string" &&
          ownerProfile.avatar_url.trim()
        ) {
          row.user_avatar = ownerProfile.avatar_url.trim();
        }
      }
    } catch (error) {
      console.warn("post author profile lookup failed", error);
    }
  }

  if (!row.user_name) {
    row.user_name = "Capsules member";
  }

  const payload = pruneNullish(row);

  const isMediaPost =
    typeof row.media_url === "string" &&
    !!row.media_url &&
    ["image", "video"].includes(String(draft.kind ?? "text").toLowerCase());
  if (isMediaPost) {
    try {
      const prompt =
        typeof draft.mediaPrompt === "string"
          ? draft.mediaPrompt.trim()
          : typeof draft.media_prompt === "string"
            ? (draft.media_prompt as string).trim()
            : "";
      const memoryKind = prompt ? "generated" : "upload";
      const memoryTitle =
        (typeof draft.title === "string" && draft.title.trim()) ||
        (memoryKind === "generated" ? "Generated media" : "Upload");
      let memoryDescription = prompt || (typeof draft.content === "string" ? draft.content : "");
      if (!memoryDescription || memoryDescription.trim().length < 6) {
        // Enrich with a short machine caption so text queries can find images
        try {
          const cap = await captionImage(row.media_url as string);
          if (cap) memoryDescription = memoryDescription ? `${memoryDescription} | ${cap}` : cap;
        } catch (err) {
          console.warn("caption main media failed", err);
        }
      }
      await indexMemory({
        ownerId,
        kind: memoryKind,
        mediaUrl: typeof row.media_url === "string" ? row.media_url : null,
        mediaType: null,
        title: memoryTitle,
        description: memoryDescription,
        postId: payload.client_id as string | null,
        metadata: { source: "post", kind: memoryKind },
      });
    } catch (error) {
      console.warn("Memory index (post) failed", error);
    }
  }

  // Index any additional attachments for this post (not just the primary mediaUrl)
  try {
    const attachmentsRaw = Array.isArray((draft as Record<string, unknown>).attachments)
      ? ((draft as Record<string, unknown>).attachments as Array<Record<string, unknown>>)
      : [];
    for (const att of attachmentsRaw) {
      const url = typeof att.url === "string" ? att.url : null;
      if (!url) continue;
      const mime = typeof att.mimeType === "string" ? att.mimeType : null;
      const name = typeof att.name === "string" ? att.name : null;
      const attRec = att as Record<string, unknown>;
      const thumb =
        (typeof attRec.thumbnailUrl === "string" ? (attRec.thumbnailUrl as string) : null) ||
        (typeof (attRec as { thumbUrl?: unknown }).thumbUrl === "string"
          ? ((attRec as { thumbUrl?: string }).thumbUrl as string)
          : null) ||
        (typeof (attRec as { thumbnail_url?: unknown }).thumbnail_url === "string"
          ? ((attRec as { thumbnail_url?: string }).thumbnail_url as string)
          : null);
      let description = "";
      const prompt =
        typeof draft.mediaPrompt === "string"
          ? draft.mediaPrompt
          : typeof draft.media_prompt === "string"
            ? (draft.media_prompt as string)
            : "";
      const content = typeof draft.content === "string" ? draft.content : "";
      description = [prompt, content].filter((s) => s && s.trim()).join(" ");
      if (!description || description.trim().length < 6) {
        try {
          let cap: string | null = null;
          if (mime && mime.startsWith("image/")) {
            cap = await captionImage(url);
          } else if (mime && mime.startsWith("video/")) {
            if (thumb) {
              cap = await captionImage(thumb);
            } else {
              cap = null;
            }
          }
          if (cap) description = description ? `${description} | ${cap}` : cap;
        } catch (err) {
          console.warn("caption attachment failed", err);
        }
      }
      await indexMemory({
        ownerId,
        kind: mime && mime.startsWith("video/") ? "video" : "upload",
        mediaUrl: url,
        mediaType: mime,
        title: name,
        description: description || null,
        postId: clientId,
        metadata: { source: "post_attachment", thumbnail_url: thumb ?? undefined },
      });
    }
  } catch (error) {
    console.warn("attachments index failed", error);
  }
  let upsert = await supabase
    .from("posts")
    .upsert([payload], { onConflict: "client_id" })
    .select("id")
    .single();

  if (
    upsert.error &&
    (upsert.error.code === "PGRST204" || (upsert.error.message ?? "").includes("'poll'"))
  ) {
    const fallback = { ...payload };
    delete fallback.poll;
    if (typeof payload.poll !== "undefined") {
      fallback.media_prompt = fallback.media_prompt || `__POLL__${JSON.stringify(payload.poll)}`;
    }
    upsert = await supabase
      .from("posts")
      .upsert([fallback], { onConflict: "client_id" })
      .select("id")
      .single();
  }

  if (upsert.error) throw upsert.error;
  return upsert.data?.id as string;
}
