import { embedText, getEmbeddingModelConfig, summarizeMemory } from "@/lib/ai/openai";
import { getDatabaseAdminClient } from "@/config/database";
import type { DatabaseError, DatabaseQueryBuilder } from "@/ports/database";
import {
  deleteMemoryVectors,
  queryMemoryVectors,
  upsertMemoryVector,
} from "@/services/memories/vector-store";
import { normalizeLegacyMemoryRow } from "@/lib/supabase/posts";
import { normalizeMediaUrl } from "@/lib/media";
import { resolveToAbsoluteUrl } from "@/lib/url";
import { getSearchIndex } from "@/config/search-index";
import type { SearchIndexRecord } from "@/ports/search-index";
import { serverEnv } from "@/lib/env/server";
import { ensureAccessibleMediaUrl } from "@/server/posts/media";

const db = getDatabaseAdminClient();
const DEFAULT_LIST_LIMIT = 200;
const MEMORY_FIELDS =
  "id, owner_user_id, kind, post_id, title, description, media_url, media_type, meta, created_at, uploaded_by, last_viewed_by, last_viewed_at, view_count, version_group_id, version_of, version_index, is_latest";

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
  uploaded_by?: string | null;
  last_viewed_by?: string | null;
  last_viewed_at?: string | null;
  view_count?: number | null;
  version_group_id?: string | null;
  version_of?: string | null;
  version_index?: number | null;
  is_latest?: boolean | null;
};

type MemoryIdRow = {
  id: string | number | null;
};

const MEMORY_MEDIA_META_KEYS = [
  "thumbnail_url",
  "thumbnailUrl",
  "poster_url",
  "posterUrl",
  "thumb",
  "preview_url",
  "previewUrl",
  "image_thumb",
  "imageThumb",
  "media_url",
  "mediaUrl",
  "url",
  "asset_url",
  "assetUrl",
];

function resolveEffectiveOrigin(origin: string | null | undefined): string {
  const fallback = serverEnv.SITE_URL;
  if (typeof origin !== "string") return fallback;
  const trimmed = origin.trim();
  if (!trimmed.length) return fallback;
  try {
    return new URL(trimmed).origin;
  } catch {
    return fallback;
  }
}

async function rewritePotentialMediaUrl(
  value: unknown,
  origin: string | null | undefined,
): Promise<string | null> {
  const normalized = normalizeMediaUrl(value);
  if (!normalized) return null;
  if (/^data:/i.test(normalized) || /^blob:/i.test(normalized)) {
    return normalized;
  }

  let candidate = await ensureAccessibleMediaUrl(normalized);
  if (!candidate) {
    candidate = normalized;
  }

  try {
    const parsedCandidate = new URL(candidate);
    const siteOrigin = new URL(serverEnv.SITE_URL);
    if (parsedCandidate.hostname === siteOrigin.hostname) {
      candidate = `${parsedCandidate.pathname}${parsedCandidate.search}${parsedCandidate.hash}`;
    }
  } catch {
    // candidate is likely relative already
  }

  const effectiveOrigin = resolveEffectiveOrigin(origin);
  return resolveToAbsoluteUrl(candidate, effectiveOrigin) ?? candidate;
}

export async function sanitizeMemoryMeta(
  meta: unknown,
  origin: string | null | undefined,
): Promise<unknown> {
  if (!meta || typeof meta !== "object" || Array.isArray(meta)) {
    return meta ?? null;
  }

  const source = meta as Record<string, unknown>;
  const output: Record<string, unknown> = { ...source };

  await Promise.all(
    MEMORY_MEDIA_META_KEYS.map(async (key) => {
      const current = output[key];
      if (typeof current !== "string" || !current.trim().length) return;
      const rewritten = await rewritePotentialMediaUrl(current, origin);
      if (rewritten) {
        output[key] = rewritten;
      }
    }),
  );

  if (Array.isArray(output.derived_assets)) {
    output.derived_assets = await Promise.all(
      output.derived_assets.map(async (entry) => {
        if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
          return entry;
        }
        const asset = { ...(entry as Record<string, unknown>) };
        if (typeof asset.url === "string" && asset.url.trim().length) {
          const rewritten = await rewritePotentialMediaUrl(asset.url, origin);
          if (rewritten) {
            asset.url = rewritten;
          }
        }
        return asset;
      }),
    );
  }

  return output;
}

async function sanitizeMemoryItem(
  row: Record<string, unknown>,
  origin: string | null | undefined,
): Promise<Record<string, unknown>> {
  const mediaUrl = await rewritePotentialMediaUrl(
    (row["media_url"] ?? row["mediaUrl"]) as string | null | undefined,
    origin,
  );
  const mediaTypeRaw =
    typeof row["media_type"] === "string"
      ? (row["media_type"] as string)
      : typeof row["mediaType"] === "string"
        ? (row["mediaType"] as string)
        : null;
  const mediaType = mediaTypeRaw ? mediaTypeRaw.trim() : null;
  const sanitizedMeta = await sanitizeMemoryMeta(row["meta"], origin);

  return {
    ...row,
    media_url: mediaUrl,
    mediaUrl,
    media_type: mediaType,
    mediaType,
    meta: sanitizedMeta ?? null,
  };
}

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

type QueryTimeRange = {
  since?: string | null;
  until?: string | null;
};

function resolveQueryTimeRange(query: string): QueryTimeRange {
  const lower = query.toLowerCase();
  const range: QueryTimeRange = {};

  const now = new Date();

   const unitToMs = (unit: string): number => {
    const normalized = unit.toLowerCase();
    if (normalized.startsWith("day")) return 24 * 60 * 60 * 1000;
    if (normalized.startsWith("week")) return 7 * 24 * 60 * 60 * 1000;
    if (normalized.startsWith("month")) return 30 * 24 * 60 * 60 * 1000;
    if (normalized.startsWith("year")) return 365 * 24 * 60 * 60 * 1000;
    return 0;
  };

  const startOfDay = (date: Date) => {
    const copy = new Date(date);
    copy.setHours(0, 0, 0, 0);
    return copy;
  };
  const endOfDay = (date: Date) => {
    const copy = new Date(date);
    copy.setHours(23, 59, 59, 999);
    return copy;
  };

  const setRange = (since: Date, until?: Date) => {
    range.since = since.toISOString();
    if (until) {
      range.until = until.toISOString();
    }
  };

  const numericLastMatch = query.match(/last\s+(\d+)\s*(days?|weeks?|months?|years?)/i);
  if (numericLastMatch && typeof numericLastMatch[1] === "string") {
    const amount = Number.parseInt(numericLastMatch[1], 10);
    const unitSource = typeof numericLastMatch[2] === "string" ? numericLastMatch[2] : "";
    const ms = Number.isFinite(amount) ? amount * unitToMs(unitSource) : 0;
    if (ms > 0) {
      const start = new Date(now.getTime() - ms);
      setRange(start, now);
      return range;
    }
  }

  const agoMatch = query.match(/(\d+)\s*(days?|weeks?|months?|years?)\s+ago/i);
  if (agoMatch && typeof agoMatch[1] === "string") {
    const amount = Number.parseInt(agoMatch[1], 10);
    const unitSource = typeof agoMatch[2] === "string" ? agoMatch[2] : "";
    const ms = Number.isFinite(amount) ? amount * unitToMs(unitSource) : 0;
    if (ms > 0) {
      const start = new Date(now.getTime() - ms);
      setRange(start, now);
      return range;
    }
  }

  if (/\btoday\b/.test(lower)) {
    setRange(startOfDay(now), endOfDay(now));
    return range;
  }

  if (/\byesterday\b/.test(lower)) {
    const y = new Date(now);
    y.setDate(y.getDate() - 1);
    setRange(startOfDay(y), endOfDay(y));
    return range;
  }

  if (/\bthis\s+week\b/.test(lower)) {
    const current = new Date(now);
    const day = current.getDay(); // 0 (Sun) - 6 (Sat)
    const diffToMonday = (day + 6) % 7;
    const start = new Date(current);
    start.setDate(current.getDate() - diffToMonday);
    setRange(startOfDay(start), endOfDay(now));
    return range;
  }

  if (/\blast\s+week\b/.test(lower)) {
    const current = new Date(now);
    const day = current.getDay();
    const diffToMonday = (day + 6) % 7;
    const thisWeekStart = new Date(current);
    thisWeekStart.setDate(current.getDate() - diffToMonday);
    const lastWeekEnd = new Date(thisWeekStart);
    lastWeekEnd.setDate(thisWeekStart.getDate() - 1);
    const lastWeekStart = new Date(lastWeekEnd);
    lastWeekStart.setDate(lastWeekEnd.getDate() - 6);
    setRange(startOfDay(lastWeekStart), endOfDay(lastWeekEnd));
    return range;
  }

  if (/\bthis\s+month\b/.test(lower)) {
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    setRange(startOfDay(start), endOfDay(now));
    return range;
  }

  if (/\blast\s+month\b/.test(lower)) {
    const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastMonthEnd = new Date(thisMonthStart);
    lastMonthEnd.setDate(thisMonthStart.getDate() - 1);
    setRange(startOfDay(lastMonthStart), endOfDay(lastMonthEnd));
    return range;
  }

  if (/\bthis\s+year\b/.test(lower)) {
    const start = new Date(now.getFullYear(), 0, 1);
    setRange(startOfDay(start), endOfDay(now));
    return range;
  }

  if (/\blast\s+year\b/.test(lower)) {
    const start = new Date(now.getFullYear() - 1, 0, 1);
    const end = new Date(now.getFullYear() - 1, 11, 31);
    setRange(startOfDay(start), endOfDay(end));
    return range;
  }

  return range;
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
}): Promise<string | null> {
  const meta: Record<string, unknown> =
    metadata && typeof metadata === "object" ? { ...metadata } : {};
  if (Object.prototype.hasOwnProperty.call(meta, "embedding")) {
    delete meta.embedding;
  }

  const versionKeyCandidates: Array<unknown> = [
    (meta as { version_of?: unknown }).version_of,
    (meta as { versionOf?: unknown }).versionOf,
    (meta as { replace_memory_id?: unknown }).replace_memory_id,
    (meta as { replaceMemoryId?: unknown }).replaceMemoryId,
  ];

  let versionOf: string | null = null;
  let versionGroupIdOverride: string | null = null;
  let versionIndexOverride: number | null = null;

  const versionTargetRaw = versionKeyCandidates.find(
    (value): value is string => typeof value === "string" && value.trim().length > 0,
  );

  if (versionTargetRaw) {
    const normalizedTarget = versionTargetRaw.trim();
    try {
      const base = await db
        .from("memories")
        .select<{
          id: string;
          owner_user_id: string | null;
          version_group_id: string | null;
          version_index: number | null;
        }>("id, owner_user_id, version_group_id, version_index")
        .eq("id", normalizedTarget)
        .maybeSingle();

      if (!base.error && base.data && base.data.owner_user_id === ownerId) {
        versionOf = base.data.id;
        versionGroupIdOverride = base.data.version_group_id ?? base.data.id;
        versionIndexOverride = (base.data.version_index ?? 1) + 1;

        if (versionGroupIdOverride) {
          try {
            const latest = await db
              .from("memories")
              .select<{ version_index: number | null }>("version_index")
              .eq("version_group_id", versionGroupIdOverride)
              .order("version_index", { ascending: false })
              .limit(1)
              .maybeSingle();

            if (!latest.error && latest.data && typeof latest.data.version_index === "number") {
              versionIndexOverride = latest.data.version_index + 1;
            }
          } catch (versionLookupError) {
            console.warn("memory version index resolve failed", versionLookupError);
          }
        }
      }
    } catch (versionResolveError) {
      console.warn("memory version resolve failed", versionResolveError);
    }
  }

  ["version_of", "versionOf", "replace_memory_id", "replaceMemoryId"].forEach((key) => {
    if (Object.prototype.hasOwnProperty.call(meta, key)) {
      delete (meta as Record<string, unknown>)[key];
    }
  });

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

  const versionGroupForUpdate = versionOf ? versionGroupIdOverride : null;

  const record: Record<string, unknown> = {
    owner_user_id: ownerId,
    kind,
    media_url: mediaUrl,
    media_type: mediaType,
    title: finalTitle ?? null,
    description: finalDescription ?? null,
    post_id: postId,
    meta,
    uploaded_by: ownerId,
    is_latest: true,
  };

  if (versionOf) {
    record.version_of = versionOf;
  }
  if (versionGroupIdOverride) {
    record.version_group_id = versionGroupIdOverride;
  }
  if (typeof versionIndexOverride === "number") {
    record.version_index = versionIndexOverride;
  }

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
      return null;
    }

    const inserted = result.data;
    const memoryId = toStringId(inserted?.id);
    if (!memoryId) return null;

    if (versionGroupForUpdate) {
      try {
        await db
          .from("memories")
          .update({ is_latest: false })
          .eq("version_group_id", versionGroupForUpdate)
          .neq("id", memoryId);
      } catch (latestUpdateError) {
        console.warn("memory latest flag update failed", latestUpdateError);
      }
    }

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

    return memoryId;
  } catch (error) {
    console.warn("memories insert error", error);
    return null;
  }
}

type MemoryKindFilter = {
  dbKinds: string[] | null;
  sourceIncludes: string[] | null;
  sourceExcludes: string[] | null;
};

const BANNER_SOURCE_TOKENS = ["capsule_banner", "banner", "capsule_tile", "tile", "promo_tile"];
const ASSET_SOURCE_TOKENS = [
  "store_banner",
  "store-banner",
  "logo",
  "capsule_logo",
  "avatar",
  "profile_avatar",
  "user_logo",
  "capsule_asset",
  "capsule_brand_asset",
];
const _UPLOAD_SOURCE_EXCLUDE_TOKENS = [...BANNER_SOURCE_TOKENS, ...ASSET_SOURCE_TOKENS];
const COMPOSER_IMAGE_TOKENS = ["composer_image", "ai_image", "image_generation"];
const COMPOSER_CREATION_TOKENS = ["composer_creation", "capsule_creation"];

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
  if (normalized === "composer_image") {
    return { dbKinds: ["upload"], sourceIncludes: COMPOSER_IMAGE_TOKENS, sourceExcludes: null };
  }
  if (normalized === "composer_creation") {
    return { dbKinds: ["upload"], sourceIncludes: COMPOSER_CREATION_TOKENS, sourceExcludes: null };
  }
  if (normalized === "post_memory") {
      return { dbKinds: null, sourceIncludes: ["post_memory"], sourceExcludes: null };
    }
    if (normalized === "upload") {
      return { dbKinds: ["upload"], sourceIncludes: null, sourceExcludes: null };
    }
  return { dbKinds: [normalized], sourceIncludes: null, sourceExcludes: null };
}

async function fetchLegacyMemoryItems(
  ownerId: string,
  filters: MemoryKindFilter,
  limit = DEFAULT_LIST_LIMIT,
  origin?: string | null,
  cursor?: string | null,
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
      .order("id", { ascending: false })
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
    const filteredBySource = normalized.filter((item) =>
      matchesSourceRules(item.meta, filters.sourceIncludes, filters.sourceExcludes),
    );
    const filtered = cursor
      ? filteredBySource.filter((item) => {
          if (!cursor) return true;
          const createdAt = (item as { created_at?: unknown }).created_at;
          if (typeof createdAt !== "string") return true;
          return createdAt < cursor;
        })
      : filteredBySource;
    const limited = filtered.slice(0, limit);
    return Promise.all(
      limited.map((item) => sanitizeMemoryItem(item as Record<string, unknown>, origin)),
    );
  }

  return [];
}

export async function listMemories({
  ownerId,
  kind,
  origin,
  limit = DEFAULT_LIST_LIMIT,
  cursor,
}: {
  ownerId: string;
  kind?: string | null;
  origin?: string | null;
  limit?: number | null;
  cursor?: string | null;
}) {
  const filters = resolveMemoryKindFilters(kind);
  const pageSize =
    typeof limit === "number" && limit > 0 ? Math.min(limit, DEFAULT_LIST_LIMIT) : DEFAULT_LIST_LIMIT;

  let builder = db
    .from("memories")
    .select<Record<string, unknown>>(MEMORY_FIELDS)
    .eq("owner_user_id", ownerId)
    .eq("is_latest", true)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(pageSize);

  if (filters.dbKinds && filters.dbKinds.length) {
    if (filters.dbKinds.length === 1) {
      builder = builder.eq("kind", filters.dbKinds[0]);
    } else {
      builder = builder.in("kind", filters.dbKinds);
    }
  }

  if (cursor && typeof cursor === "string") {
    builder = builder.lt("created_at", cursor);
  }

  const result = await builder.fetch();

  if (result.error) {
    if (isMissingTable(result.error)) {
      return fetchLegacyMemoryItems(ownerId, filters, pageSize, origin ?? null, cursor ?? null);
    }
    console.warn("memories list query failed", result.error);
    throw result.error;
  }

  const rows = result.data ?? [];
  const hasIncludes = Boolean(filters.sourceIncludes && filters.sourceIncludes.length);
  const hasExcludes = Boolean(filters.sourceExcludes && filters.sourceExcludes.length);
  const filteredRows = !hasIncludes && !hasExcludes ? rows : rows.filter((row) =>
    matchesSourceRules(
      (row as Record<string, unknown>).meta,
      filters.sourceIncludes,
      filters.sourceExcludes,
    ),
  );

  return Promise.all(
    filteredRows.map((row) => sanitizeMemoryItem(row as Record<string, unknown>, origin ?? null)),
  );
}

export async function searchMemories({
  ownerId,
  query,
  limit,
  page = 0,
  filters,
  origin,
}: {
  ownerId: string;
  query: string;
  limit: number;
  page?: number;
  filters?: { kinds?: string[] | null | undefined };
  origin?: string | null;
}) {
  const trimmed = query.trim();
  if (!trimmed) return [];

  const sanitizeHighlight = (value: unknown): string | null => {
    if (typeof value !== "string") return null;
    const escaped = value
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
    return escaped.replace(/&lt;(\/?)em&gt;/gi, "<$1em>");
  };

  const searchIndex = getSearchIndex();
  const highlightMap = new Map<string, string | null>();
  const algoliaRecordMap = new Map<string, SearchIndexRecord>();
  const candidateOrder: string[] = [];
  const ranking = new Map<string, number>();
  const timeRange = resolveQueryTimeRange(trimmed);

  const escapeLike = (value: string) => value.replace(/[%_]/g, "\\$&");

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
      const kindsFilter = (filters?.kinds ?? []).filter(
        (value): value is string => typeof value === "string" && value.trim().length > 0,
      );
      const hasKinds = kindsFilter.length > 0;
      const filtersForSearch =
        hasKinds || timeRange.since || timeRange.until
          ? {
              ...(hasKinds ? { kinds: kindsFilter } : {}),
              ...(timeRange.since ? { since: timeRange.since } : {}),
              ...(timeRange.until ? { until: timeRange.until } : {}),
            }
          : undefined;
      const matches = await searchIndex.search({
        ownerId,
        text: trimmed,
        limit: Math.max(limit * 3, limit),
        ...(filtersForSearch ? { filters: filtersForSearch } : {}),
      });
      matches.forEach((match, index) => {
        const score = (typeof match.score === "number" ? match.score : 0) - index * 0.001;
        addCandidate(match.id, score);
        if (match.highlight) {
          const safeHighlight = sanitizeHighlight(match.highlight);
          if (safeHighlight) {
            highlightMap.set(match.id, safeHighlight);
          }
        }
        if (match.record) {
          algoliaRecordMap.set(match.id, match.record);
        }
      });
    } catch (error) {
      console.warn("algolia memory query failed", error);
    }
  }

  // If the vector + algolia lookups missed, fall back to a lightweight lexical match on title/description.
  if (!candidateOrder.length) {
    const tokens = trimmed
      .toLowerCase()
      .split(/\s+/)
      .map((t) => t.trim())
      .filter((t) => t.length >= 3);
    const clauses: string[] = [];
    tokens.forEach((token) => {
      const escaped = escapeLike(token);
      clauses.push(`title.ilike.%${escaped}%`);
      clauses.push(`description.ilike.%${escaped}%`);
    });

    if (clauses.length) {
      try {
        let builder = db
          .from("memories")
          .select<{ id: string }>("id")
          .eq("owner_user_id", ownerId)
          .eq("is_latest", true);

        if (timeRange.since) {
          builder = builder.gte("created_at", timeRange.since);
        }
        if (timeRange.until) {
          builder = builder.lte("created_at", timeRange.until);
        }

        const result = await builder
          .or(clauses.join(","))
          .order("created_at", { ascending: false })
          .limit(Math.max(limit * 2, limit))
          .fetch();

        if (!result.error && Array.isArray(result.data)) {
          (result.data as Array<{ id: string | null | undefined }>).forEach((row, index) => {
            const id = typeof row?.id === "string" ? row.id : null;
            if (id) {
              // Lexical matches get a modest score boost; order preserves recency preference.
              addCandidate(id, 2 - index * 0.001);
            }
          });
        }
      } catch (error) {
        console.warn("memory lexical search fallback failed", error);
      }
    }
  }

  const hasTimeFilter = Boolean(timeRange.since || timeRange.until);

  // If a time filter was applied and we still have no candidates, retry Algolia + lexical search without the time constraint.
  if (hasTimeFilter && !candidateOrder.length && searchIndex) {
    try {
      const kindsFilter = (filters?.kinds ?? []).filter(
        (value): value is string => typeof value === "string" && value.trim().length > 0,
      );
      const hasKinds = kindsFilter.length > 0;
      const filtersForSearch = hasKinds ? { kinds: kindsFilter } : undefined;
      const matches = await searchIndex.search({
        ownerId,
        text: trimmed,
        limit: Math.max(limit * 3, limit),
        ...(filtersForSearch ? { filters: filtersForSearch } : {}),
      });
      matches.forEach((match, index) => {
        const score = (typeof match.score === "number" ? match.score : 0) - index * 0.001;
        addCandidate(match.id, score);
        if (match.highlight) {
          const safeHighlight = sanitizeHighlight(match.highlight);
          if (safeHighlight) {
            highlightMap.set(match.id, safeHighlight);
          }
        }
        if (match.record) {
          algoliaRecordMap.set(match.id, match.record);
        }
      });
    } catch (error) {
      console.warn("algolia memory query retry without time range failed", error);
    }

    if (!candidateOrder.length) {
      const tokens = trimmed
        .toLowerCase()
        .split(/\s+/)
        .map((t) => t.trim())
        .filter((t) => t.length >= 3);
      const clauses: string[] = [];
      tokens.forEach((token) => {
        const escaped = escapeLike(token);
        clauses.push(`title.ilike.%${escaped}%`);
        clauses.push(`description.ilike.%${escaped}%`);
      });

      if (clauses.length) {
        try {
          const result = await db
            .from("memories")
            .select<{ id: string }>("id")
            .eq("owner_user_id", ownerId)
            .eq("is_latest", true)
            .or(clauses.join(","))
            .order("created_at", { ascending: false })
            .limit(Math.max(limit * 2, limit))
            .fetch();

          if (!result.error && Array.isArray(result.data)) {
            (result.data as Array<{ id: string | null | undefined }>).forEach((row, index) => {
              const id = typeof row?.id === "string" ? row.id : null;
              if (id) {
                addCandidate(id, 2 - index * 0.001);
              }
            });
          }
        } catch (error) {
          console.warn("memory lexical search retry without time range failed", error);
        }
      }
    }
  }

  const safePage = Number.isFinite(page) && page > 0 ? Math.floor(page) : 0;
  const start = safePage * limit;
  const ids = candidateOrder.slice(start, start + limit);
  if (!ids.length) {
    const fallback = await listMemories({ ownerId, origin: origin ?? null });
    return fallback.slice(start, start + limit);
  }

  try {
    const result = await db
      .from("memories")
      .select<Record<string, unknown>>(MEMORY_FIELDS)
      .in("id", ids)
      .eq("is_latest", true)
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
      const sanitized = await Promise.all(
        ordered.map((row) => sanitizeMemoryItem(row as Record<string, unknown>, origin ?? null)),
      );
      if (filters?.kinds?.length) {
        const allowed = new Set(filters.kinds.map((kind) => kind.toLowerCase()));
        return sanitized.filter(
          (item) =>
            typeof item.kind === "string" && allowed.has(item.kind.toLowerCase()),
        );
      }
      return sanitized;
    }
  } catch (error) {
    console.warn("memory search hydrate failed", error);
  }

  const fallback = await listMemories({ ownerId, origin: origin ?? null });
  const safePageFallback = Number.isFinite(page) && page > 0 ? Math.floor(page) : 0;
  const startFallback = safePageFallback * limit;
  return fallback.slice(startFallback, startFallback + limit);
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
