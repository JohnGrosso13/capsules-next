import { embedText, getEmbeddingModelConfig, summarizeMemory } from "@/lib/ai/openai";
import { getDatabaseAdminClient } from "@/config/database";
import type { DatabaseError, DatabaseQueryBuilder } from "@/ports/database";
import {
  deleteMemoryVectors,
  queryMemoryVectors,
  upsertMemoryVector,
} from "@/services/memories/vector-store";
import { normalizeLegacyMemoryRow } from "@/lib/supabase/posts";
import { getSearchIndex } from "@/config/search-index";
import type { SearchIndexRecord } from "@/ports/search-index";
import { serverEnv } from "@/lib/env/server";

const db = getDatabaseAdminClient();
const DEFAULT_LIST_LIMIT = 200;
const MEMORY_FIELDS =
  "id, owner_user_id, kind, post_id, title, description, media_url, media_type, meta, created_at";

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
  rawText,
  source,
  tags,
  eventAt,
}: {
  ownerId: string;
  kind: string;
  mediaUrl: string | null;
  mediaType: string | null;
  title: string | null;
  description: string | null;
  postId: string | null;
  metadata: Record<string, unknown> | null;
  rawText?: string | null;
  source?: string | null;
  tags?: string[] | null;
  eventAt?: string | Date | null;
}) {
  const meta: Record<string, unknown> =
    metadata && typeof metadata === "object" ? { ...metadata } : {};
  if (Object.prototype.hasOwnProperty.call(meta, "embedding")) {
    delete meta.embedding;
  }

  const originalTitle = typeof title === "string" && title.trim().length ? title.trim() : null;
  const originalDescription =
    typeof description === "string" && description.trim().length ? description.trim() : null;

  if (originalTitle && typeof meta.original_title !== "string") {
    meta.original_title = originalTitle;
  }
  if (originalDescription && typeof meta.original_description !== "string") {
    meta.original_description = originalDescription;
  }
  if (typeof rawText === "string" && rawText.trim().length && typeof meta.raw_text !== "string") {
    meta.raw_text = rawText.trim();
  }
  if (source && typeof meta.source !== "string") {
    meta.source = source;
  }

  const effectiveSource = typeof meta.source === "string" ? meta.source : null;

  const existingTags = Array.isArray(meta.summary_tags)
    ? (meta.summary_tags as unknown[]).filter((value): value is string => typeof value === "string")
    : [];
  const explicitTags = Array.isArray(tags)
    ? Array.from(new Set(tags.map((tag) => tag.trim()).filter(Boolean)))
    : [];
  const collectedTags = Array.from(new Set([...existingTags, ...explicitTags]));
  if (collectedTags.length) {
    meta.summary_tags = collectedTags;
  }

  const eventIso = (() => {
    if (eventAt instanceof Date) return eventAt.toISOString();
    if (typeof eventAt === "string" && eventAt.trim().length) return eventAt.trim();
    const metaDateCandidates = [meta.event_at, meta.captured_at, meta.created_at];
    for (const candidate of metaDateCandidates) {
      if (typeof candidate === "string" && candidate.trim().length) return candidate.trim();
    }
    return null;
  })();

  const summaryPieces: string[] = [];
  const maybeAdd = (value: unknown) => {
    if (typeof value === "string") {
      const trimmed = value.trim();
      if (trimmed) summaryPieces.push(trimmed);
    }
  };
  maybeAdd(rawText);
  maybeAdd(originalDescription);
  maybeAdd(originalTitle);
  maybeAdd(meta.post_excerpt);
  maybeAdd(meta.prompt);
  maybeAdd(meta.transcript);
  maybeAdd(meta.raw_text);
  maybeAdd(meta.original_text);

  const summaryInputText = summaryPieces.length
    ? summaryPieces.join("\n")
    : (originalDescription ?? originalTitle ?? "");

  let finalTitle = originalTitle;
  let finalDescription = originalDescription ?? summaryInputText;

  try {
    const summary = await summarizeMemory({
      text: summaryInputText,
      title: originalTitle,
      kind,
      source: effectiveSource,
      mediaType,
      hasMedia: Boolean(mediaUrl),
      timestamp: eventIso,
      tags: collectedTags,
    });
    if (summary) {
      finalDescription = summary.summary;
      if (summary.title) {
        finalTitle = summary.title;
      } else if (!finalTitle && summary.summary) {
        finalTitle = summary.summary.slice(0, 64);
      }
      if (summary.tags.length) {
        meta.summary_tags = Array.from(new Set([...summary.tags, ...collectedTags]));
      }
      if (Object.keys(summary.entities).length) {
        meta.summary_entities = summary.entities;
      }
      meta.summary_time = summary.timeHints;
      meta.summary_model = serverEnv.OPENAI_MODEL || "gpt-4o-mini";
    }
  } catch (error) {
    console.warn("memory summarization failed", error);
  }

  if (
    originalDescription &&
    finalDescription !== originalDescription &&
    typeof meta.original_text !== "string"
  ) {
    meta.original_text = originalDescription;
  }

  const record: Record<string, unknown> = {
    owner_user_id: ownerId,
    kind,
    media_url: mediaUrl,
    media_type: mediaType,
    title: finalTitle ?? null,
    description: finalDescription ?? null,
    post_id: postId,
    meta,
  };

  const embeddingSource = [
    finalTitle,
    finalDescription,
    mediaType,
    ...(Array.isArray(meta.summary_tags) ? (meta.summary_tags as string[]) : []),
  ]
    .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    .join(" ");
  const text = embeddingSource.length
    ? embeddingSource
    : [title, description, mediaType].filter(Boolean).join(" ");
  const { dimensions: expectedEmbeddingDim } = getEmbeddingModelConfig();
  let embedding: number[] | null = null;

  try {
    embedding = await embedText(text);
    if (
      embedding &&
      embedding.length &&
      expectedEmbeddingDim &&
      embedding.length !== expectedEmbeddingDim
    ) {
      console.warn(
        "embedding dimension mismatch",
        embedding.length,
        "expected",
        expectedEmbeddingDim,
        "- discarding embedding before vector sync",
      );
      embedding = null;
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

    if (embedding && embedding.length) {
      try {
        await upsertMemoryVector({
          id: memoryId,
          ownerId,
          values: embedding,
          kind,
          postId,
          title: finalTitle ?? null,
          description: finalDescription ?? null,
          mediaUrl,
          mediaType,
          extra: meta ?? null,
        });
      } catch (error) {
        console.warn("memories vector upsert failed", error);
      }
    }

    try {
      const searchIndex = getSearchIndex();
      if (searchIndex) {
        const searchRecord: SearchIndexRecord = {
          id: memoryId,
          ownerId,
          title: finalTitle ?? null,
          description: finalDescription ?? null,
          kind,
          mediaUrl,
          createdAt: typeof inserted?.created_at === "string" ? inserted?.created_at : null,
          tags: Array.isArray(meta.summary_tags)
            ? (meta.summary_tags as unknown[])
                .filter(
                  (value): value is string => typeof value === "string" && value.trim().length > 0,
                )
                .map((value) => value.trim())
            : null,
          facets: {
            source: effectiveSource ?? undefined,
            holiday:
              meta.summary_time &&
              typeof (meta.summary_time as Record<string, unknown>).holiday === "string"
                ? ((meta.summary_time as Record<string, unknown>).holiday as string)
                : undefined,
          },
          extra: meta,
        };
        await searchIndex.upsert([searchRecord]);
      }
    } catch (error) {
      console.warn("memory search index upsert failed", error);
    }
  } catch (error) {
    console.warn("memories insert error", error);
  }
}

type MemoryKindFilter = {
  dbKinds: string[] | null;
  sourceIncludes: string[] | null;
  sourceExcludes: string[] | null;
};

const BANNER_SOURCE_TOKENS = ["capsule_banner", "banner", "capsule_tile", "tile", "promo_tile"];

function normalizeSourceValue(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim().toLowerCase();
  return trimmed.length ? trimmed : null;
}

function extractSourceTokens(meta: unknown): string[] {
  if (!meta) return [];

  let record: Record<string, unknown> | null = null;
  if (typeof meta === "object") {
    record = meta as Record<string, unknown>;
  } else if (typeof meta === "string") {
    try {
      const parsed = JSON.parse(meta) as unknown;
      if (parsed && typeof parsed === "object") {
        record = parsed as Record<string, unknown>;
      }
    } catch {
      record = null;
    }
  }

  if (!record) return [];

  const tokens: string[] = [];
  const pushToken = (value: unknown) => {
    const normalized = normalizeSourceValue(value);
    if (normalized) tokens.push(normalized);
  };

  pushToken(record.source);
  pushToken(record.source_kind);
  pushToken(record.asset_variant);
  pushToken(record.asset_kind);

  const summaryTags = record.summary_tags;
  if (Array.isArray(summaryTags)) {
    summaryTags.forEach((value) => pushToken(value));
  }

  return Array.from(new Set(tokens));
}

function matchesSourceRules(
  meta: unknown,
  includes: string[] | null,
  excludes: string[] | null,
): boolean {
  const tokens = extractSourceTokens(meta);

  if (includes && includes.length) {
    const includeSet = new Set(includes);
    const hasMatch = tokens.some((token) => includeSet.has(token));
    if (!hasMatch) return false;
  }

  if (excludes && excludes.length) {
    const excludeSet = new Set(excludes);
    const hasExcluded = tokens.some((token) => excludeSet.has(token));
    if (hasExcluded) return false;
  }

  return true;
}

function resolveMemoryKindFilters(kind: string | null | undefined): MemoryKindFilter {
  if (typeof kind !== "string") {
    return { dbKinds: null, sourceIncludes: null, sourceExcludes: null };
  }
  const normalized = kind.trim().toLowerCase();
  if (!normalized) {
    return { dbKinds: null, sourceIncludes: null, sourceExcludes: null };
  }
  if (normalized === "banner" || normalized === "capsule_banner") {
    return { dbKinds: ["upload"], sourceIncludes: BANNER_SOURCE_TOKENS, sourceExcludes: null };
  }
  if (normalized === "upload") {
    return { dbKinds: ["upload"], sourceIncludes: null, sourceExcludes: BANNER_SOURCE_TOKENS };
  }
  return { dbKinds: [normalized], sourceIncludes: null, sourceExcludes: null };
}

async function fetchLegacyMemoryItems(
  ownerId: string,
  filters: MemoryKindFilter,
  limit = DEFAULT_LIST_LIMIT,
) {
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

    if (filters.dbKinds && filters.dbKinds.length) {
      builder = builder.in("kind", filters.dbKinds);
    }

    const result = await builder.fetch();

    if (result.error) {
      if (!isMissingTable(result.error)) throw result.error;
      continue;
    }

    const rows = result.data ?? [];
    const normalized = rows.map((row) => normalizeLegacyMemoryRow(row as Record<string, unknown>));
    return normalized.filter((item) =>
      matchesSourceRules(item.meta, filters.sourceIncludes, filters.sourceExcludes),
    );
  }

  return [];
}

export async function listMemories({ ownerId, kind }: { ownerId: string; kind?: string | null }) {
  const filters = resolveMemoryKindFilters(kind);

  let builder = db
    .from("memories")
    .select<
      Record<string, unknown>
    >("id, kind, media_url, media_type, title, description, created_at, meta")
    .eq("owner_user_id", ownerId)
    .order("created_at", { ascending: false })
    .limit(DEFAULT_LIST_LIMIT);

  if (filters.dbKinds && filters.dbKinds.length) {
    if (filters.dbKinds.length === 1) {
      builder = builder.eq("kind", filters.dbKinds[0]);
    } else {
      builder = builder.in("kind", filters.dbKinds);
    }
  }

  const result = await builder.fetch();

  if (result.error) {
    if (isMissingTable(result.error)) {
      return fetchLegacyMemoryItems(ownerId, filters, DEFAULT_LIST_LIMIT);
    }
    throw result.error;
  }

  const rows = result.data ?? [];
  const hasIncludes = Boolean(filters.sourceIncludes && filters.sourceIncludes.length);
  const hasExcludes = Boolean(filters.sourceExcludes && filters.sourceExcludes.length);
  if (!hasIncludes && !hasExcludes) {
    return rows;
  }
  return rows.filter((row) =>
    matchesSourceRules(
      (row as Record<string, unknown>).meta,
      filters.sourceIncludes,
      filters.sourceExcludes,
    ),
  );
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
  const trimmed = query.trim();
  if (!trimmed) return [];

  const searchIndex = getSearchIndex();
  const highlightMap = new Map<string, string | null>();
  const algoliaRecordMap = new Map<string, SearchIndexRecord>();
  const candidateOrder: string[] = [];
  const ranking = new Map<string, number>();

  const addCandidate = (id: unknown, score: number) => {
    if (typeof id !== "string" || !id.trim().length) return;
    const existing = ranking.get(id);
    if (existing == null) {
      ranking.set(id, score);
      candidateOrder.push(id);
    } else if (score > existing) {
      ranking.set(id, score);
    }
  };

  let embedding: number[] | null = null;
  try {
    embedding = await embedText(trimmed);
  } catch (error) {
    console.warn("memory query embed failed", error);
  }

  if (embedding) {
    try {
      const matches = await queryMemoryVectors(ownerId, embedding, Math.max(limit * 3, limit));
      matches.forEach((match, index) => {
        const score = (typeof match.score === "number" ? match.score : 0) - index * 0.001;
        addCandidate(match.id, score);
      });
    } catch (error) {
      console.warn("pinecone memory query failed", error);
    }
  }

  if (searchIndex) {
    try {
      const matches = await searchIndex.search({
        ownerId,
        text: trimmed,
        limit: Math.max(limit * 3, limit),
      });
      matches.forEach((match, index) => {
        const score = (typeof match.score === "number" ? match.score : 0) - index * 0.001;
        addCandidate(match.id, score);
        if (match.highlight) {
          highlightMap.set(match.id, match.highlight);
        }
        if (match.record) {
          algoliaRecordMap.set(match.id, match.record);
        }
      });
    } catch (error) {
      console.warn("algolia memory query failed", error);
    }
  }

  const ids = candidateOrder.slice(0, limit);
  if (!ids.length) {
    const fallback = await listMemories({ ownerId });
    return fallback.slice(0, limit);
  }

  try {
    const result = await db
      .from("memories")
      .select<
        Record<string, unknown>
      >("id, kind, media_url, media_type, title, description, created_at, meta")
      .in("id", ids)
      .fetch();

    const map = new Map<string, Record<string, unknown>>();
    if (!result.error && Array.isArray(result.data)) {
      for (const row of result.data) {
        if (row && typeof row === "object") {
          const id = toStringId((row as { id?: unknown }).id);
          if (id) {
            map.set(id, row as Record<string, unknown>);
          }
        }
      }
    } else if (result.error) {
      console.warn("memories fetch after search failed", result.error);
    }

    const ordered: Record<string, unknown>[] = [];
    for (const id of ids) {
      const row = map.get(id);
      if (row) {
        if (highlightMap.has(id)) {
          const highlight = highlightMap.get(id);
          const meta = (row.meta ?? {}) as Record<string, unknown>;
          const mergedMeta = { ...meta };
          if (highlight && !mergedMeta.search_highlight) {
            mergedMeta.search_highlight = highlight;
          }
          row.meta = mergedMeta;
        }
        ordered.push(row);
        continue;
      }

      const record = algoliaRecordMap.get(id);
      if (record) {
        const fallbackRow: Record<string, unknown> = {
          id,
          kind: record.kind ?? null,
          media_url: record.mediaUrl ?? null,
          media_type: null,
          title: record.title ?? null,
          description: record.description ?? null,
          created_at: record.createdAt ?? null,
          meta: {
            ...(record.extra ?? {}),
            search_highlight: highlightMap.get(id) ?? null,
          },
        };
        ordered.push(fallbackRow);
      }
    }

    if (ordered.length) {
      return ordered;
    }
  } catch (error) {
    console.warn("memory search hydrate failed", error);
  }

  const fallback = await listMemories({ ownerId });
  return fallback.slice(0, limit);
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
  const kind = typeof body.kind === "string" && body.kind.trim().length ? body.kind.trim() : null;
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
    const preload = await applyMemoryFilters(db.from("memories").select<MemoryIdRow>("id")).fetch();

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
    try {
      const searchIndex = getSearchIndex();
      if (searchIndex) {
        await searchIndex.delete(Array.from(pineconeIds));
      }
    } catch (error) {
      console.warn("memory search index delete failed", error);
    }
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
    deletedLegacy += await deleteLegacyRecords((builder) => builder, "legacy delete all error");
  } else {
    if (ids.length) {
      for (const column of ["id", "uuid", "item_id", "memory_id"]) {
        deletedLegacy += await deleteLegacyRecords((builder) => {
          let scoped = builder;
          if (kind) scoped = scoped.eq("kind", kind);
          return scoped.in(column, ids);
        }, "memory_items delete error");
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
        deletedLegacy += await deleteLegacyRecords((builder) => {
          let scoped = builder;
          if (kind) scoped = scoped.eq("kind", kind);
          return scoped.in(column, urls);
        }, "memory_items delete error");
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
