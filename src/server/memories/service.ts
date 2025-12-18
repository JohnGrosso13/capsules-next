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
  "id, owner_user_id, owner_capsule_id, owner_type, kind, post_id, title, description, media_url, media_type, meta, created_at, uploaded_by, last_viewed_by, last_viewed_at, view_count, version_group_id, version_of, version_index, is_latest";

type MemoryRow = {
  id: string;
  owner_user_id: string | null;
  owner_capsule_id?: string | null;
  owner_type?: string | null;
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

type MemoryOwnerType = "user" | "capsule";

type NormalizedMemoryOwner = {
  ownerType: MemoryOwnerType;
  ownerId: string;
  ownerUserId: string | null;
  ownerCapsuleId: string | null;
  uploadedBy: string | null;
};

function normalizeMemoryOwner(params: {
  ownerId: string;
  ownerType?: MemoryOwnerType | null;
  uploadedBy?: string | null;
}): NormalizedMemoryOwner {
  const ownerId =
    typeof params.ownerId === "string" && params.ownerId.trim().length
      ? params.ownerId.trim()
      : null;
  if (!ownerId) {
    throw new Error("ownerId is required when indexing or querying memories");
  }
  const resolvedType: MemoryOwnerType =
    params.ownerType === "capsule" ? "capsule" : "user";
  const ownerUserId = resolvedType === "user" ? ownerId : null;
  const ownerCapsuleId = resolvedType === "capsule" ? ownerId : null;
  const normalizedUploadedBy =
    typeof params.uploadedBy === "string" && params.uploadedBy.trim().length
      ? params.uploadedBy.trim()
      : ownerUserId;

  return {
    ownerType: resolvedType,
    ownerId,
    ownerUserId,
    ownerCapsuleId,
    uploadedBy: normalizedUploadedBy ?? null,
  };
}

function applyOwnerScope<T>(
  builder: DatabaseQueryBuilder<T>,
  owner: NormalizedMemoryOwner,
): DatabaseQueryBuilder<T> {
  const column = owner.ownerType === "capsule" ? "owner_capsule_id" : "owner_user_id";
  return builder.eq(column, owner.ownerId).eq("owner_type", owner.ownerType);
}

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

const ALGOLIA_EXTRA_LONG_LIMIT = 640;
const ALGOLIA_EXTRA_OPTION_LIMIT = 16;
const ALGOLIA_EXTRA_ENTITY_LIMIT = 8;
const ALGOLIA_TAG_LIMIT = 24;
const ALGOLIA_TITLE_LIMIT = 200;
const ALGOLIA_DESCRIPTION_LIMIT = 800;

function sanitizeAlgoliaText(value: unknown, limit: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.replace(/\s+/g, " ").trim();
  if (!trimmed.length) return null;
  if (!Number.isFinite(limit) || limit <= 0) return trimmed;
  return trimmed.length > limit ? trimmed.slice(0, limit) : trimmed;
}

function sanitizeAlgoliaArray(value: unknown, limit: number, max: number): string[] {
  if (!Array.isArray(value)) return [];
  const results: string[] = [];
  for (const entry of value) {
    if (typeof entry !== "string") continue;
    const trimmed = entry.replace(/\s+/g, " ").trim();
    if (!trimmed.length) continue;
    results.push(trimmed.length > limit ? trimmed.slice(0, limit) : trimmed);
    if (results.length >= max) break;
  }
  return results;
}

function buildAlgoliaExtra(meta: Record<string, unknown> | null): Record<string, unknown> | null {
  if (!meta || typeof meta !== "object" || Array.isArray(meta)) return null;
  const extra: Record<string, unknown> = {};

  const source = sanitizeAlgoliaText(meta.source, 120);
  if (source) extra.source = source;

  const pollQuestion = sanitizeAlgoliaText(meta.poll_question, 200);
  if (pollQuestion) extra.poll_question = pollQuestion;

  const pollOptions = sanitizeAlgoliaArray(meta.poll_options, 80, ALGOLIA_EXTRA_OPTION_LIMIT);
  if (pollOptions.length) extra.poll_options = pollOptions;

  if (Array.isArray(meta.poll_counts)) {
    const counts = meta.poll_counts
      .filter((value) => typeof value === "number" && Number.isFinite(value))
      .slice(0, pollOptions.length || ALGOLIA_EXTRA_OPTION_LIMIT)
      .map((value) => Math.max(0, Math.trunc(value)));
    if (counts.length) extra.poll_counts = counts;
  }

  if (typeof meta.poll_total_votes === "number" && Number.isFinite(meta.poll_total_votes)) {
    extra.poll_total_votes = Math.max(0, Math.trunc(meta.poll_total_votes));
  }

  const pollCreated = sanitizeAlgoliaText(meta.poll_created_at, 48);
  if (pollCreated) extra.poll_created_at = pollCreated;

  const pollUpdated = sanitizeAlgoliaText(meta.poll_updated_at, 48);
  if (pollUpdated) extra.poll_updated_at = pollUpdated;

  const postExcerpt = sanitizeAlgoliaText(meta.post_excerpt, ALGOLIA_EXTRA_LONG_LIMIT);
  if (postExcerpt) extra.post_excerpt = postExcerpt;

  const postAuthor = sanitizeAlgoliaText(meta.post_author_name, 160);
  if (postAuthor) extra.post_author_name = postAuthor;

  const prompt = sanitizeAlgoliaText(meta.prompt, ALGOLIA_EXTRA_LONG_LIMIT);
  if (prompt) extra.prompt = prompt;

  const aiCaption = sanitizeAlgoliaText(meta.ai_caption, ALGOLIA_EXTRA_LONG_LIMIT);
  if (aiCaption) extra.ai_caption = aiCaption;

  const caption = sanitizeAlgoliaText(meta.caption, ALGOLIA_EXTRA_LONG_LIMIT);
  if (caption) extra.caption = caption;

  const postClientId = sanitizeAlgoliaText(meta.post_client_id, 80);
  if (postClientId) extra.post_client_id = postClientId;

  const postRecordId = sanitizeAlgoliaText(meta.post_record_id, 80);
  if (postRecordId) extra.post_record_id = postRecordId;

  const summaryTags = sanitizeAlgoliaArray(meta.summary_tags, 48, ALGOLIA_TAG_LIMIT);
  if (summaryTags.length) extra.summary_tags = summaryTags;

  if (meta.summary_entities && typeof meta.summary_entities === "object") {
    const entities: Record<string, string[]> = {};
    for (const [key, value] of Object.entries(meta.summary_entities as Record<string, unknown>)) {
      const items = sanitizeAlgoliaArray(value, 64, ALGOLIA_EXTRA_ENTITY_LIMIT);
      if (items.length) {
        entities[key] = items;
      }
    }
    if (Object.keys(entities).length) {
      extra.summary_entities = entities;
    }
  }

  if (meta.summary_time && typeof meta.summary_time === "object") {
    const time = meta.summary_time as Record<string, unknown>;
    const timePayload: Record<string, unknown> = {};
    const isoDate = sanitizeAlgoliaText(time.isoDate ?? time.iso_date, 32);
    if (isoDate) timePayload.isoDate = isoDate;
    if (typeof time.year === "number" && Number.isFinite(time.year)) {
      timePayload.year = time.year;
    }
    if (typeof time.month === "number" && Number.isFinite(time.month)) {
      timePayload.month = time.month;
    }
    const holiday = sanitizeAlgoliaText(time.holiday, 48);
    if (holiday) timePayload.holiday = holiday;
    const relative = sanitizeAlgoliaText(time.relative, 48);
    if (relative) timePayload.relative = relative;
    if (Object.keys(timePayload).length) {
      extra.summary_time = timePayload;
    }
  }

  return Object.keys(extra).length ? extra : null;
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

const EMBEDDING_TEXT_LIMIT = 6000;
const EMBEDDING_PART_LIMIT = 900;
const EMBEDDING_LONG_PART_LIMIT = 1600;

function normalizeEmbeddingPart(value: unknown, limit: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.replace(/\s+/g, " ").trim();
  if (!trimmed.length) return null;
  if (!Number.isFinite(limit) || limit <= 0) return trimmed;
  return trimmed.length > limit ? trimmed.slice(0, limit) : trimmed;
}

function pushEmbeddingPart(
  parts: string[],
  seen: Set<string>,
  value: unknown,
  limit: number,
) {
  const normalized = normalizeEmbeddingPart(value, limit);
  if (!normalized) return;
  const key = normalized.toLowerCase();
  if (seen.has(key)) return;
  seen.add(key);
  parts.push(normalized);
}

function pushEmbeddingArray(
  parts: string[],
  seen: Set<string>,
  value: unknown,
  limit: number,
) {
  if (!Array.isArray(value)) return;
  value.forEach((entry) => pushEmbeddingPart(parts, seen, entry, limit));
}

function buildEmbeddingText(options: {
  kind?: string | null;
  source?: string | null;
  title?: string | null;
  description?: string | null;
  rawText?: string | null;
  mediaType?: string | null;
  meta?: Record<string, unknown> | null;
}): string | null {
  const parts: string[] = [];
  const seen = new Set<string>();
  const meta = options.meta ?? {};

  if (options.kind) pushEmbeddingPart(parts, seen, `kind: ${options.kind}`, 120);
  if (options.source) pushEmbeddingPart(parts, seen, `source: ${options.source}`, 160);
  if (options.mediaType) pushEmbeddingPart(parts, seen, options.mediaType, 120);

  pushEmbeddingPart(parts, seen, options.title, EMBEDDING_PART_LIMIT);
  pushEmbeddingPart(parts, seen, options.description, EMBEDDING_LONG_PART_LIMIT);
  pushEmbeddingPart(parts, seen, options.rawText, EMBEDDING_LONG_PART_LIMIT);

  pushEmbeddingPart(parts, seen, meta.poll_question, EMBEDDING_PART_LIMIT);
  pushEmbeddingArray(parts, seen, meta.poll_options, 80);

  pushEmbeddingPart(parts, seen, meta.post_excerpt, EMBEDDING_LONG_PART_LIMIT);
  pushEmbeddingPart(parts, seen, meta.post_author_name, 160);
  pushEmbeddingPart(parts, seen, meta.prompt, EMBEDDING_LONG_PART_LIMIT);
  pushEmbeddingPart(parts, seen, meta.ai_caption, EMBEDDING_LONG_PART_LIMIT);
  pushEmbeddingPart(parts, seen, meta.caption, EMBEDDING_LONG_PART_LIMIT);
  pushEmbeddingPart(parts, seen, meta.raw_text, EMBEDDING_LONG_PART_LIMIT);
  pushEmbeddingPart(parts, seen, meta.original_text, EMBEDDING_LONG_PART_LIMIT);
  pushEmbeddingPart(parts, seen, meta.transcript, EMBEDDING_LONG_PART_LIMIT);

  pushEmbeddingArray(parts, seen, meta.summary_tags, 64);

  if (meta.summary_entities && typeof meta.summary_entities === "object") {
    Object.values(meta.summary_entities as Record<string, unknown>).forEach((value) => {
      pushEmbeddingArray(parts, seen, value, 80);
    });
  }

  const combined = parts.join("\n").trim();
  if (!combined.length) return null;
  return combined.length > EMBEDDING_TEXT_LIMIT ? combined.slice(0, EMBEDDING_TEXT_LIMIT) : combined;
}

const TOKEN_MIN_LENGTH = 3;
const RRF_K = 60;
const VECTOR_RRF_WEIGHT = 1;
const ALGOLIA_RRF_WEIGHT = 0.9;
const LEXICAL_RRF_WEIGHT = 0.55;
const VECTOR_SCORE_WEIGHT = 0.02;
const TOKEN_SCORE_WEIGHT = 0.0035;
const TOKEN_SCORE_CAP = 0.06;
const INTENT_BOOST = 0.02;
const MAX_CANDIDATE_POOL = 120;
const CANDIDATE_MULTIPLIER = 5;

function normalizeSearchToken(value: string): string | null {
  const cleaned = value.toLowerCase().replace(/[^a-z0-9#@]/g, "");
  if (!cleaned.length) return null;
  if (cleaned.length >= TOKEN_MIN_LENGTH || /\d/.test(cleaned)) return cleaned;
  return null;
}

function singularizeToken(token: string): string | null {
  if (token.endsWith("ies") && token.length > 4) return `${token.slice(0, -3)}y`;
  if (token.endsWith("es") && token.length > 4) return token.slice(0, -2);
  if (token.endsWith("s") && token.length > 3 && !token.endsWith("ss")) {
    return token.slice(0, -1);
  }
  return null;
}

function tokenizeSearchQuery(query: string): string[] {
  const tokens = new Set<string>();
  query
    .split(/\s+/)
    .map((token) => token.trim())
    .filter(Boolean)
    .forEach((token) => {
      const normalized = normalizeSearchToken(token);
      if (!normalized) return;
      tokens.add(normalized);
      const singular = singularizeToken(normalized);
      if (singular) tokens.add(singular);
    });
  return Array.from(tokens);
}

function scoreTokenMatches(text: string | null | undefined, tokens: string[]): number {
  if (!text || !tokens.length) return 0;
  const lower = text.toLowerCase();
  let score = 0;
  tokens.forEach((token) => {
    if (!token) return;
    if (lower === token) {
      score += 6;
    } else if (lower.startsWith(token)) {
      score += 4;
    } else if (lower.includes(token)) {
      score += 2;
    }
  });
  return score;
}

type MemoryIntent = {
  poll: boolean;
  post: boolean;
  image: boolean;
  video: boolean;
  audio: boolean;
  file: boolean;
};

const INTENT_TOKENS = {
  poll: new Set(["poll", "vote", "votes", "voting", "survey", "ballot"]),
  post: new Set(["post", "posts", "comment", "comments", "reply", "replies", "thread", "threads"]),
  image: new Set(["photo", "photos", "image", "images", "pic", "pics", "picture", "pictures"]),
  video: new Set(["video", "videos", "clip", "clips", "recording", "recordings"]),
  audio: new Set(["audio", "song", "songs", "voice", "podcast", "podcasts"]),
  file: new Set(["file", "files", "pdf", "ppt", "pptx", "slides", "doc", "docs", "document", "documents"]),
};

function detectMemoryIntent(tokens: string[]): MemoryIntent {
  const tokenSet = new Set(tokens);
  const has = (set: Set<string>) => Array.from(set).some((entry) => tokenSet.has(entry));
  return {
    poll: has(INTENT_TOKENS.poll),
    post: has(INTENT_TOKENS.post),
    image: has(INTENT_TOKENS.image),
    video: has(INTENT_TOKENS.video),
    audio: has(INTENT_TOKENS.audio),
    file: has(INTENT_TOKENS.file),
  };
}

function scoreIntentBoost(
  intent: MemoryIntent,
  item: Record<string, unknown>,
): number {
  if (
    !intent.poll &&
    !intent.post &&
    !intent.image &&
    !intent.video &&
    !intent.audio &&
    !intent.file
  ) {
    return 0;
  }
  const kind =
    typeof item.kind === "string" && item.kind.trim().length
      ? item.kind.trim().toLowerCase()
      : null;
  const meta = (item.meta ?? {}) as Record<string, unknown>;
  const source =
    typeof meta.source === "string" && meta.source.trim().length
      ? meta.source.trim().toLowerCase()
      : null;
  const mediaTypeRaw =
    typeof item.media_type === "string"
      ? item.media_type
      : typeof item.mediaType === "string"
        ? item.mediaType
        : null;
  const mediaType = mediaTypeRaw ? mediaTypeRaw.toLowerCase() : null;

  let boost = 0;
  if (intent.poll && (kind === "poll" || source === "post_poll")) {
    boost += INTENT_BOOST;
  }
  if (intent.post && (kind === "post" || source === "post_memory")) {
    boost += INTENT_BOOST * 0.8;
  }
  if (intent.image && (mediaType?.startsWith("image/") || source === "post_attachment")) {
    boost += INTENT_BOOST * 0.7;
  }
  if (intent.video && (mediaType?.startsWith("video/") || source === "post_attachment")) {
    boost += INTENT_BOOST * 0.7;
  }
  if (intent.audio && mediaType?.startsWith("audio/")) {
    boost += INTENT_BOOST * 0.6;
  }
  if (intent.file && mediaType && /(pdf|ppt|presentation|msword|spreadsheet|excel)/.test(mediaType)) {
    boost += INTENT_BOOST * 0.6;
  }
  return boost;
}

function scoreMemoryTokens(item: Record<string, unknown>, tokens: string[]): number {
  if (!tokens.length) return 0;
  const title = typeof item.title === "string" ? item.title : null;
  const description = typeof item.description === "string" ? item.description : null;
  const meta = (item.meta ?? {}) as Record<string, unknown>;

  let score = 0;
  score += scoreTokenMatches(title, tokens) * 2;
  score += scoreTokenMatches(description, tokens);

  if (typeof meta.poll_question === "string") {
    score += scoreTokenMatches(meta.poll_question, tokens);
  }
  if (Array.isArray(meta.poll_options)) {
    (meta.poll_options as unknown[]).forEach((option) => {
      if (typeof option === "string") {
        score += scoreTokenMatches(option, tokens);
      }
    });
  }
  if (Array.isArray(meta.summary_tags)) {
    (meta.summary_tags as unknown[]).forEach((tag) => {
      if (typeof tag === "string") {
        score += scoreTokenMatches(tag, tokens);
      }
    });
  }
  if (meta.summary_entities && typeof meta.summary_entities === "object") {
    Object.values(meta.summary_entities as Record<string, unknown>).forEach((value) => {
      if (Array.isArray(value)) {
        value.forEach((entry) => {
          if (typeof entry === "string") {
            score += scoreTokenMatches(entry, tokens);
          }
        });
      }
    });
  }
  if (typeof meta.post_excerpt === "string") {
    score += scoreTokenMatches(meta.post_excerpt, tokens);
  }
  if (typeof meta.ai_caption === "string") {
    score += scoreTokenMatches(meta.ai_caption, tokens);
  }
  return score;
}

function isWithinTimeRange(createdAt: string | null | undefined, range: QueryTimeRange): boolean {
  if (!range.since && !range.until) return true;
  if (!createdAt) return true;
  const createdTs = Date.parse(createdAt);
  if (!Number.isFinite(createdTs)) return true;
  if (range.since) {
    const sinceTs = Date.parse(range.since);
    if (Number.isFinite(sinceTs) && createdTs < sinceTs) return false;
  }
  if (range.until) {
    const untilTs = Date.parse(range.until);
    if (Number.isFinite(untilTs) && createdTs > untilTs) return false;
  }
  return true;
}

export async function indexMemory({
  ownerId,
  ownerType = "user",
  uploadedBy,
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
  ownerType?: MemoryOwnerType | null;
  uploadedBy?: string | null;
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

  const owner = normalizeMemoryOwner({
    ownerId,
    ownerType,
    uploadedBy: uploadedBy ?? null,
  });

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
          owner_capsule_id: string | null;
          owner_type: string | null;
          version_group_id: string | null;
          version_index: number | null;
        }>("id, owner_user_id, owner_capsule_id, owner_type, version_group_id, version_index")
        .eq("id", normalizedTarget)
        .maybeSingle();

      if (!base.error && base.data) {
        const baseOwnerType: MemoryOwnerType =
          base.data.owner_type === "capsule" ? "capsule" : "user";
        const baseOwnerId =
          baseOwnerType === "capsule" ? base.data.owner_capsule_id : base.data.owner_user_id;

        const isSameOwner =
          baseOwnerType === owner.ownerType && baseOwnerId === owner.ownerId;

        if (isSameOwner) {
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
    owner_user_id: owner.ownerUserId,
    owner_capsule_id: owner.ownerCapsuleId,
    owner_type: owner.ownerType,
    kind,
    media_url: mediaUrl,
    media_type: mediaType,
    title: finalTitle ?? null,
    description: finalDescription ?? null,
    post_id: postId,
    meta,
    uploaded_by: owner.uploadedBy,
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

  const text =
    buildEmbeddingText({
      kind,
      source: effectiveSource ?? null,
      title: finalTitle ?? null,
      description: finalDescription ?? null,
      rawText: typeof rawText === "string" ? rawText : null,
      mediaType,
      meta,
    }) ??
    [finalTitle, finalDescription, mediaType]
      .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
      .join(" ");
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
          ownerId: owner.ownerId,
          ownerType: owner.ownerType,
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
        const tagsForSearch = sanitizeAlgoliaArray(meta.summary_tags, 48, ALGOLIA_TAG_LIMIT);
        const searchRecord: SearchIndexRecord = {
          id: memoryId,
          ownerId: owner.ownerId,
          ownerType: owner.ownerType,
          title: sanitizeAlgoliaText(finalTitle ?? null, ALGOLIA_TITLE_LIMIT),
          description: sanitizeAlgoliaText(finalDescription ?? null, ALGOLIA_DESCRIPTION_LIMIT),
          kind,
          mediaUrl,
          createdAt: typeof inserted?.created_at === "string" ? inserted?.created_at : null,
          tags: tagsForSearch.length ? tagsForSearch : null,
          facets: {
            source: effectiveSource ?? undefined,
            holiday:
              meta.summary_time &&
              typeof (meta.summary_time as Record<string, unknown>).holiday === "string"
                ? ((meta.summary_time as Record<string, unknown>).holiday as string)
                : undefined,
          },
          extra: buildAlgoliaExtra(meta),
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
  ownerType = "user",
  kind,
  origin,
  limit = DEFAULT_LIST_LIMIT,
  cursor,
}: {
  ownerId: string;
  ownerType?: MemoryOwnerType | null;
  kind?: string | null;
  origin?: string | null;
  limit?: number | null;
  cursor?: string | null;
}) {
  const filters = resolveMemoryKindFilters(kind);
  const pageSize =
    typeof limit === "number" && limit > 0 ? Math.min(limit, DEFAULT_LIST_LIMIT) : DEFAULT_LIST_LIMIT;
  const owner = normalizeMemoryOwner({ ownerId, ownerType });

  let builder = applyOwnerScope(
    db
      .from("memories")
      .select<Record<string, unknown>>(MEMORY_FIELDS)
      .eq("is_latest", true)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(pageSize),
    owner,
  );

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
    if (isMissingTable(result.error) && owner.ownerType === "user") {
      return fetchLegacyMemoryItems(owner.ownerId, filters, pageSize, origin ?? null, cursor ?? null);
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
  ownerType = "user",
  query,
  limit,
  page = 0,
  filters,
  origin,
  useEmbedding = true,
}: {
  ownerId: string;
  ownerType?: MemoryOwnerType | null;
  query: string;
  limit: number;
  page?: number;
  filters?: { kinds?: string[] | null | undefined };
  origin?: string | null;
  useEmbedding?: boolean;
}) {
  const trimmed = query.trim();
  if (!trimmed) return [];

  const owner = normalizeMemoryOwner({ ownerId, ownerType });

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
  const candidateScores = new Map<
    string,
    { score: number; vectorScore?: number; sources: Set<string> }
  >();
  const timeRange = resolveQueryTimeRange(trimmed);
  const tokens = tokenizeSearchQuery(trimmed);
  const intent = detectMemoryIntent(tokens);

  const escapeLike = (value: string) => value.replace(/[%_]/g, "\\$&");

  const recordCandidate = (
    id: unknown,
    rank: number,
    weight: number,
    source: string,
    vectorScore?: number,
  ) => {
    if (typeof id !== "string" || !id.trim().length) return;
    const key = id.trim();
    const existing = candidateScores.get(key) ?? { score: 0, sources: new Set<string>() };
    existing.score += weight / (RRF_K + rank);
    existing.sources.add(source);
    if (typeof vectorScore === "number" && Number.isFinite(vectorScore)) {
      existing.vectorScore =
        typeof existing.vectorScore === "number"
          ? Math.max(existing.vectorScore, vectorScore)
          : vectorScore;
    }
    candidateScores.set(key, existing);
  };

  let embedding: number[] | null = null;
  if (useEmbedding) {
    try {
      embedding = await embedText(trimmed);
    } catch (error) {
      console.warn("memory query embed failed", error);
    }
  }

  if (embedding) {
    try {
      const matches = await queryMemoryVectors(
        owner.ownerId,
        embedding,
        Math.max(limit * 3, limit),
        owner.ownerType === "capsule" ? owner.ownerType : undefined,
      );
      matches.forEach((match, index) => {
        recordCandidate(match.id, index + 1, VECTOR_RRF_WEIGHT, "vector", match.score ?? undefined);
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
        ownerId: owner.ownerId,
        ...(owner.ownerType === "capsule" ? { ownerType: owner.ownerType } : {}),
        text: trimmed,
        limit: Math.max(limit * 3, limit),
        ...(filtersForSearch ? { filters: filtersForSearch } : {}),
      });
      matches.forEach((match, index) => {
        recordCandidate(match.id, index + 1, ALGOLIA_RRF_WEIGHT, "algolia");
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

  const desiredCandidates = Math.max(limit * 3, 24);

  if (candidateScores.size < desiredCandidates) {
    const clauses: string[] = [];
    tokens.forEach((token) => {
      const escaped = escapeLike(token);
      clauses.push(`title.ilike.%${escaped}%`);
      clauses.push(`description.ilike.%${escaped}%`);
    });

        if (clauses.length) {
      try {
        let builder = applyOwnerScope(
          db.from("memories").select<{ id: string }>("id").eq("is_latest", true),
          owner,
        );

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
              recordCandidate(id, index + 1, LEXICAL_RRF_WEIGHT, "lexical");
            }
          });
        }
      } catch (error) {
        console.warn("memory lexical search fallback failed", error);
      }
    }
  }

  const hasTimeFilter = Boolean(timeRange.since || timeRange.until);

  if (hasTimeFilter && candidateScores.size === 0 && searchIndex) {
    try {
      const kindsFilter = (filters?.kinds ?? []).filter(
        (value): value is string => typeof value === "string" && value.trim().length > 0,
      );
      const hasKinds = kindsFilter.length > 0;
      const filtersForSearch = hasKinds ? { kinds: kindsFilter } : undefined;
      const matches = await searchIndex.search({
        ownerId: owner.ownerId,
        ...(owner.ownerType === "capsule" ? { ownerType: owner.ownerType } : {}),
        text: trimmed,
        limit: Math.max(limit * 3, limit),
        ...(filtersForSearch ? { filters: filtersForSearch } : {}),
      });
      matches.forEach((match, index) => {
        recordCandidate(match.id, index + 1, ALGOLIA_RRF_WEIGHT, "algolia");
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

    if (candidateScores.size === 0) {
      const clauses: string[] = [];
      tokens.forEach((token) => {
        const escaped = escapeLike(token);
        clauses.push(`title.ilike.%${escaped}%`);
        clauses.push(`description.ilike.%${escaped}%`);
      });

      if (clauses.length) {
        try {
          const result = await applyOwnerScope(
            db.from("memories").select<{ id: string }>("id").eq("is_latest", true),
            owner,
          )
            .or(clauses.join(","))
            .order("created_at", { ascending: false })
            .limit(Math.max(limit * 2, limit))
            .fetch();

          if (!result.error && Array.isArray(result.data)) {
            (result.data as Array<{ id: string | null | undefined }>).forEach((row, index) => {
              const id = typeof row?.id === "string" ? row.id : null;
              if (id) {
                recordCandidate(id, index + 1, LEXICAL_RRF_WEIGHT, "lexical");
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

  if (!candidateScores.size) {
    const fallback = await listMemories({
      ownerId: owner.ownerId,
      ownerType: owner.ownerType,
      origin: origin ?? null,
    });
    return fallback.slice(start, start + limit);
  }

  const sortedCandidates = Array.from(candidateScores.entries())
    .map(([id, entry]) => ({ id, entry }))
    .sort((a, b) => b.entry.score - a.entry.score);

  const poolTarget = Math.max((safePage + 1) * limit, limit * CANDIDATE_MULTIPLIER, 24);
  const poolSize = Math.min(sortedCandidates.length, Math.min(poolTarget, MAX_CANDIDATE_POOL));
  const candidateIds = sortedCandidates.slice(0, poolSize).map((entry) => entry.id);

  if (!candidateIds.length) {
    const fallback = await listMemories({
      ownerId: owner.ownerId,
      ownerType: owner.ownerType,
      origin: origin ?? null,
    });
    return fallback.slice(start, start + limit);
  }

  try {
    const result = await db
      .from("memories")
      .select<Record<string, unknown>>(MEMORY_FIELDS)
      .in("id", candidateIds)
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

    const scoredRows: Array<{ id: string; score: number; createdAt: string | null; row: Record<string, unknown> }> = [];

    candidateIds.forEach((id, index) => {
      const baseEntry = candidateScores.get(id);
      const baseScore =
        (baseEntry?.score ?? 0) +
        (typeof baseEntry?.vectorScore === "number" ? baseEntry.vectorScore * VECTOR_SCORE_WEIGHT : 0);

      const row = map.get(id);
      const record = algoliaRecordMap.get(id);
      const resolvedRow =
        row ??
        (record
          ? ({
              id,
              kind: record.kind ?? null,
              media_url: record.mediaUrl ?? null,
              media_type: null,
              title: record.title ?? null,
              description: record.description ?? null,
              created_at: record.createdAt ?? null,
              meta: record.extra ?? null,
            } as Record<string, unknown>)
          : null);

      if (!resolvedRow) return;

      const createdAt =
        typeof resolvedRow.created_at === "string"
          ? resolvedRow.created_at
          : typeof resolvedRow.createdAt === "string"
            ? resolvedRow.createdAt
            : null;

      if (!isWithinTimeRange(createdAt, timeRange)) return;

      const tokenScore = scoreMemoryTokens(resolvedRow, tokens);
      const tokenBoost = Math.min(tokenScore * TOKEN_SCORE_WEIGHT, TOKEN_SCORE_CAP);
      const intentBoost = scoreIntentBoost(intent, resolvedRow);
      const finalScore = baseScore + tokenBoost + intentBoost;

      const meta =
        resolvedRow.meta && typeof resolvedRow.meta === "object" && !Array.isArray(resolvedRow.meta)
          ? (resolvedRow.meta as Record<string, unknown>)
          : {};
      const mergedMeta = { ...meta };
      const highlight = highlightMap.get(id);
      if (highlight && !mergedMeta.search_highlight) {
        mergedMeta.search_highlight = highlight;
      }
      mergedMeta.search_score = finalScore;
      mergedMeta.search_rank = index + 1;
      if (baseEntry?.sources) {
        mergedMeta.search_sources = Array.from(baseEntry.sources);
      }
      resolvedRow.meta = mergedMeta;
      resolvedRow.relevanceScore = finalScore;

      scoredRows.push({
        id,
        score: finalScore,
        createdAt,
        row: resolvedRow,
      });
    });

    if (scoredRows.length) {
      scoredRows.sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        const aTs = a.createdAt ? Date.parse(a.createdAt) : NaN;
        const bTs = b.createdAt ? Date.parse(b.createdAt) : NaN;
        if (Number.isFinite(aTs) && Number.isFinite(bTs) && bTs !== aTs) {
          return bTs - aTs;
        }
        return a.id.localeCompare(b.id);
      });

      const pagedRows = scoredRows.slice(start, start + limit).map((entry) => entry.row);
      const sanitized = await Promise.all(
        pagedRows.map((row) => sanitizeMemoryItem(row as Record<string, unknown>, origin ?? null)),
      );
      if (filters?.kinds?.length) {
        const allowed = new Set(filters.kinds.map((kind) => kind.toLowerCase()));
        return sanitized.filter(
          (item) => typeof item.kind === "string" && allowed.has(item.kind.toLowerCase()),
        );
      }
      return sanitized;
    }
  } catch (error) {
    console.warn("memory search hydrate failed", error);
  }

  const fallback = await listMemories({
    ownerId: owner.ownerId,
    ownerType: owner.ownerType,
    origin: origin ?? null,
  });
  const startFallback = start;
  return fallback.slice(startFallback, startFallback + limit);
}

export async function deleteMemories({
  ownerId,
  ownerType = "user",
  body,
}: {
  ownerId: string;
  ownerType?: MemoryOwnerType | null;
  body: Record<string, unknown>;
}) {
  const owner = normalizeMemoryOwner({ ownerId, ownerType });
  const ids = Array.isArray(body.ids) ? body.ids.map(String).filter(Boolean) : [];
  const urls = Array.isArray(body.urls) ? body.urls.map(String).filter(Boolean) : [];
  const kind = typeof body.kind === "string" && body.kind.trim().length ? body.kind.trim() : null;
  const deleteAll = Boolean(body.all);

  const applyMemoryFilters = <T>(builder: DatabaseQueryBuilder<T>): DatabaseQueryBuilder<T> => {
    let scoped = applyOwnerScope(builder, owner);
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

  const deleteLegacyRecords =
    owner.ownerType === "user"
      ? async (
          configure: (builder: DatabaseQueryBuilder<MemoryIdRow>) => DatabaseQueryBuilder<MemoryIdRow>,
          logContext: string,
        ): Promise<number> => {
          try {
            let builder = db
              .from("memory_items")
              .delete<MemoryIdRow>({ count: "exact" })
              .eq("owner_user_id", owner.ownerId);

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
        }
      : null;

  if (deleteLegacyRecords) {
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
  }

  return { memories: deletedMemories, legacy: deletedLegacy };
}
