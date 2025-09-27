import { embedText } from "@/lib/ai/openai";

import { getSupabaseAdminClient } from "@/lib/supabase/admin";

import type { PostgrestSingleResponse } from "@supabase/supabase-js";

import { normalizeLegacyMemoryRow } from "@/lib/supabase/posts";

const DEFAULT_LIST_LIMIT = 200;

export async function indexMemory({
  ownerId,

  kind,

  mediaUrl,

  mediaType,

  title,

  description,

  postId,

  metadata,
}: {
  ownerId: string;

  kind: string;

  mediaUrl: string | null;

  mediaType: string | null;

  title: string | null;

  description: string | null;

  postId: string | null;

  metadata: Record<string, unknown> | null;
}) {
  const supabase = getSupabaseAdminClient();

  const record: Record<string, unknown> = {
    owner_user_id: ownerId,

    kind,

    media_url: mediaUrl,

    media_type: mediaType,

    title,

    description,

    post_id: postId,

    meta: metadata ?? null,
  };

  const text = [title, description, mediaType].filter(Boolean).join("");

  try {
    const embedding = await embedText(text);

    if (embedding) record.embedding = embedding;
  } catch (error) {
    console.warn("embedding failed", error);
  }

  const { error } = await supabase.from("memories").insert([record]);

  if (error) {
    console.warn("memories insert error", error);
  }
}

async function fetchLegacyMemoryItems(
  ownerId: string,
  kind: string | null,
  limit = DEFAULT_LIST_LIMIT,
) {
  const supabase = getSupabaseAdminClient();

  const variants = [
    "id, kind, media_url, media_type, title, description, created_at",

    "id, kind, url, type, title, description, created_at",

    "id, kind, asset_url, asset_type, title, summary, created_at",

    "*",
  ];

  for (const columns of variants) {
    let query = supabase

      .from("memory_items")

      .select(columns)

      .eq("owner_user_id", ownerId)

      .order("created_at", { ascending: false })

      .limit(limit);

    if (kind) query = query.eq("kind", kind);

    const res = await query;

    if (!res.error) {
      const rows = Array.isArray(res.data) ? res.data : [];

      return rows.map((row) => normalizeLegacyMemoryRow(row as unknown as Record<string, unknown>));
    }

    const msg = String(res.error?.message ?? "").toLowerCase();

    if (
      !(
        msg.includes("could not find") ||
        msg.includes("does not exist") ||
        res.error?.code === "PGRST204" ||
        res.error?.code === "42703"
      )
    ) {
      throw res.error;
    }
  }

  return [];
}

export async function listMemories({ ownerId, kind }: { ownerId: string; kind?: string | null }) {
  const supabase = getSupabaseAdminClient();

  let query = supabase

    .from("memories")

    .select("id, kind, media_url, media_type, title, description, created_at, meta")

    .eq("owner_user_id", ownerId)

    .order("created_at", { ascending: false })

    .limit(DEFAULT_LIST_LIMIT);

  if (kind) query = query.eq("kind", kind);

  const { data, error } = await query;

  if (error) {
    const msg = String(error.message ?? "").toLowerCase();

    if (msg.includes("could not find") || error.code === "PGRST205" || error.code === "42703") {
      return fetchLegacyMemoryItems(ownerId, kind ?? null, DEFAULT_LIST_LIMIT);
    }

    throw error;
  }

  return data ?? [];
}

export async function searchMemories({
  ownerId,

  query,

  limit,
}: {
  ownerId: string;

  query: string;

  limit: number;
}) {
  const supabase = getSupabaseAdminClient();

  const embedding = await embedText(query);

  if (!embedding) {
    return listMemories({ ownerId }).then((items) => items.slice(0, limit));
  }

  const { data, error } = await supabase.rpc("search_memories_cosine", {
    p_owner_id: ownerId,

    p_query_embedding: embedding,

    p_match_threshold: 0.15,

    p_match_count: limit,
  });

  if (error) {
    console.warn("search_memories_cosine error", error);

    return listMemories({ ownerId }).then((items) => items.slice(0, limit));
  }

  return data ?? [];
}

export async function deleteMemories({
  ownerId,

  body,
}: {
  ownerId: string;

  body: Record<string, unknown>;
}) {
  const supabase = getSupabaseAdminClient();

  const ids = Array.isArray(body.ids) ? body.ids.map(String).filter(Boolean) : [];

  const urls = Array.isArray(body.urls) ? body.urls.map(String).filter(Boolean) : [];

  const kind = typeof body.kind === "string" && body.kind.trim() ? body.kind.trim() : null;

  const deleteAll = Boolean(body.all);

  const run = async (promise: PromiseLike<PostgrestSingleResponse<unknown>>) => {
    const res = await promise;

    if (res.error) return 0;

    if (Array.isArray(res.data)) return res.data.length;

    return (res as { count?: number }).count ?? 0;
  };

  let deletedMemories = 0;

  let deletedLegacy = 0;

  try {
    let query = supabase.from("memories").delete({ count: "exact" }).eq("owner_user_id", ownerId);

    if (!deleteAll) {
      if (kind) query = query.eq("kind", kind);

      if (ids.length) query = query.in("id", ids);

      if (urls.length) query = query.in("media_url", urls);
    }

    deletedMemories += await run(query);
  } catch (error) {
    console.warn("memories delete error", error);
  }

  const legacyDelete = async (column: string, values: string[]) => {
    if (!values.length) return 0;

    try {
      let query = supabase

        .from("memory_items")

        .delete({ count: "exact" })

        .eq("owner_user_id", ownerId)

        .in(column, values);

      if (kind) query = query.eq("kind", kind);

      return await run(query);
    } catch (error) {
      console.warn("memory_items delete error", error);

      return 0;
    }
  };

  if (deleteAll) {
    try {
      deletedLegacy += await run(
        supabase.from("memory_items").delete({ count: "exact" }).eq("owner_user_id", ownerId),
      );
    } catch (error) {
      console.warn("legacy delete all error", error);
    }
  } else {
    if (ids.length) {
      for (const column of ["id", "uuid", "item_id", "memory_id"]) {
        deletedLegacy += await legacyDelete(column, ids);
      }
    }

    if (urls.length) {
      for (const column of [
        "media_url",
        "url",
        "asset_url",
        "storage_path",
        "file_url",
        "public_url",
        "path",
      ]) {
        deletedLegacy += await legacyDelete(column, urls);
      }
    }

    if (!ids.length && !urls.length && kind) {
      try {
        deletedLegacy += await run(
          supabase

            .from("memory_items")

            .delete({ count: "exact" })

            .eq("owner_user_id", ownerId)

            .eq("kind", kind),
        );
      } catch (error) {
        console.warn("legacy delete kind error", error);
      }
    }
  }

  return { memories: deletedMemories, legacy: deletedLegacy };
}
