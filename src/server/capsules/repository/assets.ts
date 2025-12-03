import { decorateDatabaseError } from "@/lib/database/utils";

import { db, normalizeString } from "./shared";
import type { CapsuleAssetRow, PostCapsuleRow } from "./types";

async function fetchPostCapsuleMap(postClientIds: string[]): Promise<Map<string, string | null>> {
  if (!postClientIds.length) return new Map();
  const uniqueIds = Array.from(
    new Set(postClientIds.map((id) => normalizeString(id)).filter(Boolean)),
  ) as string[];
  if (!uniqueIds.length) return new Map();

  const result = await db
    .from("posts")
    .select<PostCapsuleRow>("client_id, capsule_id")
    .in("client_id", uniqueIds)
    .fetch();

  if (result.error) {
    throw decorateDatabaseError("capsules.assets.postMap", result.error);
  }

  const map = new Map<string, string | null>();
  (result.data ?? []).forEach((row) => {
    const key = normalizeString(row?.client_id);
    if (!key) return;
    map.set(key, normalizeString(row?.capsule_id));
  });
  return map;
}

export async function listCapsuleAssets(params: {
  capsuleId: string;
  limit?: number;
  offset?: number;
  includeInternal?: boolean;
}): Promise<CapsuleAssetRow[]> {
  const normalizedCapsuleId = normalizeString(params.capsuleId);
  if (!normalizedCapsuleId) return [];
  const limit =
    typeof params.limit === "number" && params.limit > 0 ? Math.min(params.limit, 500) : 200;
  const offset = Math.max(0, Math.trunc(params.offset ?? 0));
  const includeInternal = Boolean(params.includeInternal);

  let query = db
    .from("memories")
    .select<CapsuleAssetRow>(
      "id, owner_user_id, media_url, media_type, title, description, meta, created_at, post_id, kind, view_count, uploaded_by",
    )
    .eq("is_latest", true)
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (includeInternal) {
    const attachmentCondition = `and(meta->>source.eq.post_attachment,or(meta->>capsule_id.eq.${normalizedCapsuleId},meta->>capsule_id.is.null))`;
    const directCondition = `meta->>capsule_id.eq.${normalizedCapsuleId}`;
    query = query.or(`${attachmentCondition},${directCondition}`);
  } else {
    query = query
      .filter("meta->>source", "eq", "post_attachment")
      .or(`meta->>capsule_id.eq.${normalizedCapsuleId},meta->>capsule_id.is.null`);
  }

  const result = await query.fetch();

  if (result.error) {
    throw decorateDatabaseError("capsules.assets.list", result.error);
  }

  const rows = result.data ?? [];
  const matched: CapsuleAssetRow[] = [];
  const orphanedPostIds: string[] = [];

  rows.forEach((row) => {
    const meta = (row?.meta ?? null) as Record<string, unknown> | null;
    const capsuleFromMeta = normalizeString(
      meta && typeof meta === "object"
        ? ((meta as { capsule_id?: unknown }).capsule_id as string | undefined)
        : null,
    );
    if (capsuleFromMeta) {
      if (capsuleFromMeta === normalizedCapsuleId) {
        matched.push(row);
      }
      return;
    }
    const postId = normalizeString(row?.post_id ?? null);
    if (postId) {
      orphanedPostIds.push(postId);
    }
  });

  if (orphanedPostIds.length) {
    const postMap = await fetchPostCapsuleMap(orphanedPostIds);
    rows.forEach((row) => {
      if (matched.includes(row)) return;
      const postId = normalizeString(row?.post_id ?? null);
      if (!postId) return;
      const target = normalizeString(postMap.get(postId) ?? null);
      if (target === normalizedCapsuleId) {
        matched.push(row);
      }
    });
  }

  return matched;
}

