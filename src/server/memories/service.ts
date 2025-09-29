import { embedText, getEmbeddingModelConfig } from "@/lib/ai/openai";
import { getDatabaseAdminClient } from "@/config/database";
import type { DatabaseError, DatabaseQueryBuilder } from "@/ports/database";
import { deleteMemoryVectors, queryMemoryVectors, upsertMemoryVector } from "@/services/memories/vector-store";
import { normalizeLegacyMemoryRow } from "@/lib/supabase/posts";

const db = getDatabaseAdminClient();
const DEFAULT_LIST_LIMIT = 200;
const MEMORY_FIELDS =
  "id, owner_user_id, kind, post_id, title, description, media_url, media_type, meta, created_at, embedding";

type MemoryRow = {
  id: string;
  owner_user_id: string | null;
  kind: string | null;
  post_id: string | null;
  title: string | null;
  description: string | null;
  media_url: string | null;
  media_type: string | null;
  meta: Record<string, unknown> | null;
  created_at: string | null;
  embedding?: number[] | null;
};

type MemoryIdRow = {
  id: string | number | null;
};

function isMissingTable(error: DatabaseError | null): boolean {
  if (!error) return false;
  const message = (error.message ?? "").toLowerCase();
  return (
    message.includes("could not find") ||
    message.includes("does not exist") ||
    error.code === "PGRST204" ||
    error.code === "PGRST205" ||
    error.code === "42703"
  );
}

function toStringId(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (typeof value === "number") return `${value}`;
  return null;
}

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

  const text = [title, description, mediaType].filter(Boolean).join(" ");
  const { dimensions: expectedEmbeddingDim } = getEmbeddingModelConfig();
  let embedding: number[] | null = null;

  try {
    embedding = await embedText(text);

    if (embedding && embedding.length) {
      if (!expectedEmbeddingDim || embedding.length === expectedEmbeddingDim) {
        record.embedding = embedding;
      } else {
        console.warn(
          "embedding dimension mismatch",
          embedding.length,
          "expected",
          expectedEmbeddingDim,
          "- skipping stored embedding",
        );
        embedding = null;
      }
    }
  } catch (error) {
    console.warn("embedding failed", error);
  }

  try {
    const result = await db
      .from("memories")
      .insert(record)
      .select<MemoryRow>(MEMORY_FIELDS)
      .single();

    if (result.error) {
      console.warn("memories insert error", result.error);
      return;
    }

    const inserted = result.data;
    const memoryId = toStringId(inserted?.id);
    if (!memoryId) return;

    const persistedEmbedding = Array.isArray(inserted?.embedding) ? (inserted?.embedding as number[]) : null;
    const vectorCandidate =
      embedding && embedding.length
        ? embedding
        : persistedEmbedding && persistedEmbedding.length
          ? persistedEmbedding
          : null;

    const vector =
      expectedEmbeddingDim && vectorCandidate && vectorCandidate.length !== expectedEmbeddingDim
        ? null
        : vectorCandidate;

    if (vector && vector.length) {
      try {
        await upsertMemoryVector({
          id: memoryId,
          ownerId,
          values: vector,
          kind,
          postId,
          title,
          description,
          mediaUrl,
          mediaType,
          extra: metadata ?? null,
        });
      } catch (error) {
        console.warn("memories vector upsert failed", error);
      }
    }
  } catch (error) {
    console.warn("memories insert error", error);
  }
}

async function fetchLegacyMemoryItems(ownerId: string, kind: string | null, limit = DEFAULT_LIST_LIMIT) {
  const variants = [
    "id, kind, media_url, media_type, title, description, created_at",
    "id, kind, url, type, title, description, created_at",
    "id, kind, asset_url, asset_type, title, summary, created_at",
    "*",
  ];

  for (const columns of variants) {
    let builder = db
      .from("memory_items")
      .select<Record<string, unknown>>(columns)
      .eq("owner_user_id", ownerId)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (kind) builder = builder.eq("kind", kind);

    const result = await builder.fetch();

    if (result.error) {
      if (!isMissingTable(result.error)) throw result.error;
      continue;
    }

    const rows = result.data ?? [];
    return rows.map((row) => normalizeLegacyMemoryRow(row as Record<string, unknown>));
  }

  return [];
}

export async function listMemories({ ownerId, kind }: { ownerId: string; kind?: string | null }) {
  let builder = db
    .from("memories")
    .select<Record<string, unknown>>(
      "id, kind, media_url, media_type, title, description, created_at, meta",
    )
    .eq("owner_user_id", ownerId)
    .order("created_at", { ascending: false })
    .limit(DEFAULT_LIST_LIMIT);

  if (kind) builder = builder.eq("kind", kind);

  const result = await builder.fetch();

  if (result.error) {
    if (isMissingTable(result.error)) {
      return fetchLegacyMemoryItems(ownerId, kind ?? null, DEFAULT_LIST_LIMIT);
    }
    throw result.error;
  }

  return result.data ?? [];
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
  const embedding = await embedText(query);

  if (embedding) {
    try {
      const matches = await queryMemoryVectors(ownerId, embedding, limit);
      const ids = matches
        .map((match) => (typeof match.id === "string" ? match.id : null))
        .filter((id): id is string => Boolean(id));

      if (ids.length) {
        const result = await db
          .from("memories")
          .select<Record<string, unknown>>(
            "id, kind, media_url, media_type, title, description, created_at, meta",
          )
          .in("id", ids)
          .fetch();

        if (!result.error && Array.isArray(result.data)) {
          const map = new Map<string, Record<string, unknown>>();
          for (const row of result.data) {
            if (row && typeof row === "object") {
              const id = toStringId((row as { id?: unknown }).id);
              if (id) {
                map.set(id, row as Record<string, unknown>);
              }
            }
          }

          const ordered = matches
            .map((match) => (typeof match.id === "string" ? map.get(match.id) : null))
            .filter((row): row is Record<string, unknown> => Boolean(row));

          if (ordered.length) {
            return ordered.slice(0, limit);
          }
        } else if (result.error) {
          console.warn("memories fetch after pinecone query failed", result.error);
        }
      }
    } catch (error) {
      console.warn("pinecone memory query failed", error);
    }
  }

  if (!embedding) {
    const fallback = await listMemories({ ownerId });
    return fallback.slice(0, limit);
  }

  const result = await db.rpc("search_memories_cosine", {
    p_owner_id: ownerId,
    p_query_embedding: embedding,
    p_match_threshold: 0.15,
    p_match_count: limit,
  });

  if (result.error) {
    console.warn("search_memories_cosine error", result.error);
    const fallback = await listMemories({ ownerId });
    return fallback.slice(0, limit);
  }

  return result.data ?? [];
}

export async function deleteMemories({
  ownerId,
  body,
}: {
  ownerId: string;
  body: Record<string, unknown>;
}) {
  const ids = Array.isArray(body.ids) ? body.ids.map(String).filter(Boolean) : [];
  const urls = Array.isArray(body.urls) ? body.urls.map(String).filter(Boolean) : [];
  const kind =
    typeof body.kind === "string" && body.kind.trim().length ? body.kind.trim() : null;
  const deleteAll = Boolean(body.all);

  const applyMemoryFilters = <T>(builder: DatabaseQueryBuilder<T>): DatabaseQueryBuilder<T> => {
    let scoped = builder.eq("owner_user_id", ownerId);
    if (!deleteAll) {
      if (kind) scoped = scoped.eq("kind", kind);
      if (ids.length) scoped = scoped.in("id", ids);
      if (urls.length) scoped = scoped.in("media_url", urls);
    }
    return scoped;
  };

  let deletedMemories = 0;
  let deletedLegacy = 0;
  const pineconeIds = new Set<string>();

  try {
    const preload = await applyMemoryFilters(
      db.from("memories").select<MemoryIdRow>("id"),
    ).fetch();

    if (!preload.error && Array.isArray(preload.data)) {
      for (const row of preload.data) {
        const id = toStringId(row?.id);
        if (id) pineconeIds.add(id);
      }
    } else if (preload.error) {
      console.warn("memories id preload error", preload.error);
    }
  } catch (error) {
    console.warn("memories id preload failed", error);
  }

  try {
    const removal = await applyMemoryFilters(
      db.from("memories").delete<MemoryIdRow>({ count: "exact" }).select<MemoryIdRow>("id"),
    ).fetch();

    if (!removal.error && Array.isArray(removal.data)) {
      deletedMemories += removal.data.length;
    } else if (removal.error) {
      console.warn("memories delete error", removal.error);
    }
  } catch (error) {
    console.warn("memories delete error", error);
  }

  if (deletedMemories > 0 && pineconeIds.size) {
    await deleteMemoryVectors(Array.from(pineconeIds));
  }

  const deleteLegacyRecords = async (
    configure: (builder: DatabaseQueryBuilder<MemoryIdRow>) => DatabaseQueryBuilder<MemoryIdRow>,
    logContext: string,
  ): Promise<number> => {
    try {
      let builder = db
        .from("memory_items")
        .delete<MemoryIdRow>({ count: "exact" })
        .eq("owner_user_id", ownerId);

      builder = configure(builder);

      const result = await builder.select<MemoryIdRow>("id").fetch();
      if (result.error) {
        console.warn(logContext, result.error);
        return 0;
      }
      return (result.data ?? []).length;
    } catch (error) {
      console.warn(logContext, error);
      return 0;
    }
  };

  if (deleteAll) {
    deletedLegacy += await deleteLegacyRecords(
      (builder) => builder,
      "legacy delete all error",
    );
  } else {
    if (ids.length) {
      for (const column of ["id", "uuid", "item_id", "memory_id"]) {
        deletedLegacy += await deleteLegacyRecords(
          (builder) => {
            let scoped = builder;
            if (kind) scoped = scoped.eq("kind", kind);
            return scoped.in(column, ids);
          },
          "memory_items delete error",
        );
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
        deletedLegacy += await deleteLegacyRecords(
          (builder) => {
            let scoped = builder;
            if (kind) scoped = scoped.eq("kind", kind);
            return scoped.in(column, urls);
          },
          "memory_items delete error",
        );
      }
    }

    if (!ids.length && !urls.length && kind) {
      deletedLegacy += await deleteLegacyRecords(
        (builder) => builder.eq("kind", kind),
        "legacy delete kind error",
      );
    }
  }

  return { memories: deletedMemories, legacy: deletedLegacy };
}
