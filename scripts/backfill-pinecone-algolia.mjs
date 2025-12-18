#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import process from "node:process";

import { createClient } from "@supabase/supabase-js";
import { Pinecone } from "@pinecone-database/pinecone";
import { searchClient } from "@algolia/client-search";

function loadEnvFile(filePath) {
  if (!existsSync(filePath)) return;
  const content = readFileSync(filePath, "utf8");
  content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"))
    .forEach((line) => {
      const idx = line.indexOf("=");
      if (idx === -1) return;
      const key = line.slice(0, idx).trim();
      const value = line.slice(idx + 1).trim();
      if (!process.env[key]) {
        process.env[key] = value.replace(/^"|"$/g, "");
      }
    });
}

loadEnvFile(".env.local");
loadEnvFile(".env");

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_EMBED_MODEL = process.env.OPENAI_EMBED_MODEL || "text-embedding-3-large";
const OPENAI_EMBED_DIM =
  process.env.OPENAI_EMBED_DIM && Number.isFinite(Number(process.env.OPENAI_EMBED_DIM))
    ? Number(process.env.OPENAI_EMBED_DIM)
    : null;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Missing Supabase credentials. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}

if (!OPENAI_API_KEY) {
  console.error("Missing OPENAI_API_KEY environment variable.");
  process.exit(1);
}

const PINECONE_API_KEY = process.env.PINECONE_API_KEY ?? null;
const PINECONE_INDEX = process.env.PINECONE_INDEX ?? null;
const PINECONE_CONTROLLER_HOST =
  process.env.PINECONE_CONTROLLER_HOST ??
  process.env.PINECONE_HOST ??
  process.env.PINECONE_API_HOST ??
  null;
const PINECONE_NAMESPACE =
  process.env.PINECONE_NAMESPACE ?? process.env.PINECONE_PROJECT_NAMESPACE ?? null;

const ALGOLIA_APP_ID =
  process.env.ALGOLIA_APP_ID || process.env.NEXT_PUBLIC_ALGOLIA_APP_ID || null;
const ALGOLIA_API_KEY = process.env.ALGOLIA_API_KEY || null;
const ALGOLIA_INDEX_PREFIX =
  (process.env.ALGOLIA_INDEX_PREFIX || process.env.NEXT_PUBLIC_ALGOLIA_INDEX_PREFIX || "")
    .trim()
    .toLowerCase();

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

let pineconeIndex = null;
if (PINECONE_API_KEY && PINECONE_INDEX) {
  try {
    const options = { apiKey: PINECONE_API_KEY };
    if (PINECONE_CONTROLLER_HOST) {
      options.controllerHostUrl = PINECONE_CONTROLLER_HOST;
    }
    const pinecone = new Pinecone(options);
    pineconeIndex = pinecone.index(PINECONE_INDEX);
    if (PINECONE_NAMESPACE) {
      pineconeIndex = pineconeIndex.namespace(PINECONE_NAMESPACE);
    }
  } catch (error) {
    console.error("Failed to initialise Pinecone client:", error);
  }
}

if (!pineconeIndex) {
  console.warn("Pinecone not configured; vector backfill will be skipped.");
}

let algoliaClient = null;
let algoliaIndexName = null;
if (ALGOLIA_APP_ID && ALGOLIA_API_KEY) {
  try {
    algoliaClient = searchClient(ALGOLIA_APP_ID, ALGOLIA_API_KEY);
    const base = ALGOLIA_INDEX_PREFIX ? `${ALGOLIA_INDEX_PREFIX}_memories` : "memories";
    algoliaIndexName = base.toLowerCase();
  } catch (error) {
    console.error("Failed to initialise Algolia client:", error);
  }
}

if (!algoliaClient || !algoliaIndexName) {
  console.warn("Algolia not configured; search index upserts will be skipped.");
}


const TITLE_LIMIT = 256;
const DESCRIPTION_LIMIT = 768;
const MEDIA_URL_LIMIT = 512;
const MEDIA_TYPE_LIMIT = 120;
const AUTHOR_LIMIT = 160;
const EMBEDDING_TEXT_LIMIT = 6000;
const EMBEDDING_PART_LIMIT = 900;
const EMBEDDING_LONG_PART_LIMIT = 1600;

function normalize(value, limit) {
  if (typeof value !== "string") return null;
  const trimmed = value.replace(/\s+/g, " ").trim();
  if (!trimmed) return null;
  return trimmed.length > limit ? `${trimmed.slice(0, limit - 3)}...` : trimmed;
}

function normalizeEmbeddingPart(value, limit) {
  if (typeof value !== "string") return null;
  const trimmed = value.replace(/\s+/g, " ").trim();
  if (!trimmed) return null;
  if (!Number.isFinite(limit) || limit <= 0) return trimmed;
  return trimmed.length > limit ? trimmed.slice(0, limit) : trimmed;
}

function pushEmbeddingPart(parts, seen, value, limit) {
  const normalized = normalizeEmbeddingPart(value, limit);
  if (!normalized) return;
  const key = normalized.toLowerCase();
  if (seen.has(key)) return;
  seen.add(key);
  parts.push(normalized);
}

function pushEmbeddingArray(parts, seen, value, limit) {
  if (!Array.isArray(value)) return;
  value.forEach((entry) => pushEmbeddingPart(parts, seen, entry, limit));
}

function buildEmbeddingText({ kind, source, title, description, rawText, mediaType, meta }) {
  const parts = [];
  const seen = new Set();
  const safeMeta = meta && typeof meta === "object" ? meta : {};

  if (kind) pushEmbeddingPart(parts, seen, `kind: ${kind}`, 120);
  if (source) pushEmbeddingPart(parts, seen, `source: ${source}`, 160);
  if (mediaType) pushEmbeddingPart(parts, seen, mediaType, 120);

  pushEmbeddingPart(parts, seen, title, EMBEDDING_PART_LIMIT);
  pushEmbeddingPart(parts, seen, description, EMBEDDING_LONG_PART_LIMIT);
  pushEmbeddingPart(parts, seen, rawText, EMBEDDING_LONG_PART_LIMIT);

  pushEmbeddingPart(parts, seen, safeMeta.poll_question, EMBEDDING_PART_LIMIT);
  pushEmbeddingArray(parts, seen, safeMeta.poll_options, 80);

  pushEmbeddingPart(parts, seen, safeMeta.post_excerpt, EMBEDDING_LONG_PART_LIMIT);
  pushEmbeddingPart(parts, seen, safeMeta.post_author_name, 160);
  pushEmbeddingPart(parts, seen, safeMeta.prompt, EMBEDDING_LONG_PART_LIMIT);
  pushEmbeddingPart(parts, seen, safeMeta.ai_caption, EMBEDDING_LONG_PART_LIMIT);
  pushEmbeddingPart(parts, seen, safeMeta.caption, EMBEDDING_LONG_PART_LIMIT);
  pushEmbeddingPart(parts, seen, safeMeta.raw_text, EMBEDDING_LONG_PART_LIMIT);
  pushEmbeddingPart(parts, seen, safeMeta.original_text, EMBEDDING_LONG_PART_LIMIT);
  pushEmbeddingPart(parts, seen, safeMeta.transcript, EMBEDDING_LONG_PART_LIMIT);

  pushEmbeddingArray(parts, seen, safeMeta.summary_tags, 64);

  if (safeMeta.summary_entities && typeof safeMeta.summary_entities === "object") {
    Object.values(safeMeta.summary_entities).forEach((value) => {
      pushEmbeddingArray(parts, seen, value, 80);
    });
  }

  const combined = parts.join("\n").trim();
  if (!combined) return null;
  return combined.length > EMBEDDING_TEXT_LIMIT ? combined.slice(0, EMBEDDING_TEXT_LIMIT) : combined;
}

async function embedText(text) {
  const trimmed = typeof text === "string" ? text.trim() : "";
  if (!trimmed) return null;
  const body = {
    model: OPENAI_EMBED_MODEL,
    input: trimmed.slice(0, 8000),
    encoding_format: "float",
  };
  if (OPENAI_EMBED_DIM) {
    body.dimensions = OPENAI_EMBED_DIM;
  }
  const response = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify(body),
  });

  const json = await response.json().catch(() => null);
  if (!response.ok) {
    console.error("Embedding request failed", json || response.statusText);
    return null;
  }
  const embedding = json?.data?.[0]?.embedding;
  return Array.isArray(embedding) ? embedding : null;
}

async function ensurePineconeVector(row, embeddingText, metadata) {
  if (!pineconeIndex) return false;
  try {
    const fetchResult = await pineconeIndex.fetch([row.id]);
    const found =
      fetchResult &&
      fetchResult.records &&
      (fetchResult.records[row.id] || fetchResult.records[String(row.id)]);
    if (found) {
      return false;
    }
  } catch (error) {
    console.warn("Pinecone fetch failed", error);
  }

  let embedding = null;
  try {
    embedding = await embedText(embeddingText);
  } catch (error) {
    console.warn("Embedding generation failed", error);
  }
  if (!embedding || !embedding.length) {
    return false;
  }

  try {
    await pineconeIndex.upsert([
      {
        id: String(row.id),
        values: embedding,
        metadata,
      },
    ]);
    return true;
  } catch (error) {
    console.error("Pinecone upsert failed", error);
    return false;
  }
}

async function ensureAlgoliaRecord(record) {
  if (!algoliaClient || !algoliaIndexName) return false;
  try {
    await algoliaClient.saveObjects({ indexName: algoliaIndexName, objects: [record] });
    return true;
  } catch (error) {
    console.error("Algolia saveObjects failed", error);
    return false;
  }
}

const ALGOLIA_EXTRA_LONG_LIMIT = 640;
const ALGOLIA_EXTRA_OPTION_LIMIT = 16;
const ALGOLIA_EXTRA_ENTITY_LIMIT = 8;
const ALGOLIA_TAG_LIMIT = 24;

function sanitizeExtraText(value, limit) {
  if (typeof value !== "string") return null;
  const trimmed = value.replace(/\s+/g, " ").trim();
  if (!trimmed) return null;
  if (!Number.isFinite(limit) || limit <= 0) return trimmed;
  return trimmed.length > limit ? trimmed.slice(0, limit) : trimmed;
}

function sanitizeExtraArray(value, limit, max) {
  if (!Array.isArray(value)) return [];
  const results = [];
  for (const entry of value) {
    if (typeof entry !== "string") continue;
    const trimmed = entry.replace(/\s+/g, " ").trim();
    if (!trimmed) continue;
    results.push(trimmed.length > limit ? trimmed.slice(0, limit) : trimmed);
    if (results.length >= max) break;
  }
  return results;
}

function buildAlgoliaExtra(meta) {
  if (!meta || typeof meta !== "object") return null;
  const extra = {};

  const source = sanitizeExtraText(meta.source, 120);
  if (source) extra.source = source;

  const pollQuestion = sanitizeExtraText(meta.poll_question, 200);
  if (pollQuestion) extra.poll_question = pollQuestion;

  const pollOptions = sanitizeExtraArray(meta.poll_options, 80, ALGOLIA_EXTRA_OPTION_LIMIT);
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

  const pollCreated = sanitizeExtraText(meta.poll_created_at, 48);
  if (pollCreated) extra.poll_created_at = pollCreated;

  const pollUpdated = sanitizeExtraText(meta.poll_updated_at, 48);
  if (pollUpdated) extra.poll_updated_at = pollUpdated;

  const postExcerpt = sanitizeExtraText(meta.post_excerpt, ALGOLIA_EXTRA_LONG_LIMIT);
  if (postExcerpt) extra.post_excerpt = postExcerpt;

  const postAuthor = sanitizeExtraText(meta.post_author_name, 160);
  if (postAuthor) extra.post_author_name = postAuthor;

  const prompt = sanitizeExtraText(meta.prompt, ALGOLIA_EXTRA_LONG_LIMIT);
  if (prompt) extra.prompt = prompt;

  const aiCaption = sanitizeExtraText(meta.ai_caption, ALGOLIA_EXTRA_LONG_LIMIT);
  if (aiCaption) extra.ai_caption = aiCaption;

  const caption = sanitizeExtraText(meta.caption, ALGOLIA_EXTRA_LONG_LIMIT);
  if (caption) extra.caption = caption;

  const postClientId = sanitizeExtraText(meta.post_client_id, 80);
  if (postClientId) extra.post_client_id = postClientId;

  const postRecordId = sanitizeExtraText(meta.post_record_id, 80);
  if (postRecordId) extra.post_record_id = postRecordId;

  const summaryTags = sanitizeExtraArray(meta.summary_tags, 48, ALGOLIA_TAG_LIMIT);
  if (summaryTags.length) extra.summary_tags = summaryTags;

  if (meta.summary_entities && typeof meta.summary_entities === "object") {
    const entities = {};
    for (const [key, value] of Object.entries(meta.summary_entities)) {
      const items = sanitizeExtraArray(value, 64, ALGOLIA_EXTRA_ENTITY_LIMIT);
      if (items.length) {
        entities[key] = items;
      }
    }
    if (Object.keys(entities).length) {
      extra.summary_entities = entities;
    }
  }

  if (meta.summary_time && typeof meta.summary_time === "object") {
    const time = meta.summary_time;
    const timePayload = {};
    const isoDate = sanitizeExtraText(time.isoDate ?? time.iso_date, 32);
    if (isoDate) timePayload.isoDate = isoDate;
    if (typeof time.year === "number" && Number.isFinite(time.year)) {
      timePayload.year = time.year;
    }
    if (typeof time.month === "number" && Number.isFinite(time.month)) {
      timePayload.month = time.month;
    }
    const holiday = sanitizeExtraText(time.holiday, 48);
    if (holiday) timePayload.holiday = holiday;
    const relative = sanitizeExtraText(time.relative, 48);
    if (relative) timePayload.relative = relative;
    if (Object.keys(timePayload).length) {
      extra.summary_time = timePayload;
    }
  }

  return Object.keys(extra).length ? extra : null;
}

function buildVectorMetadata(row, meta) {
  const metadata = { ownerId: String(row.owner_user_id) };
  if (typeof row.kind === "string" && row.kind.trim()) {
    metadata.kind = row.kind.trim();
  }
  if (typeof row.post_id === "string" && row.post_id.trim()) {
    metadata.postId = row.post_id.trim();
  }

  const normalizedTitle = normalize(row.title, TITLE_LIMIT);
  if (normalizedTitle) metadata.title = normalizedTitle;

  const normalizedDescription = normalize(row.description, DESCRIPTION_LIMIT);
  if (normalizedDescription) metadata.description = normalizedDescription;

  const normalizedMediaUrl = normalize(row.media_url, MEDIA_URL_LIMIT);
  if (normalizedMediaUrl) metadata.mediaUrl = normalizedMediaUrl;

  const normalizedMediaType = normalize(row.media_type, MEDIA_TYPE_LIMIT);
  if (normalizedMediaType) metadata.mediaType = normalizedMediaType;

  if (meta && typeof meta === "object") {
    const source =
      typeof meta.source === "string" ? normalize(meta.source, MEDIA_TYPE_LIMIT) : null;
    if (source) metadata.source = source;

    const author =
      typeof meta.post_author_name === "string"
        ? normalize(meta.post_author_name, AUTHOR_LIMIT)
        : null;
    if (author) metadata.postAuthorName = author;

    const excerpt =
      typeof meta.post_excerpt === "string"
        ? normalize(meta.post_excerpt, DESCRIPTION_LIMIT)
        : null;
    if (excerpt) metadata.postExcerpt = excerpt;
  }

  return metadata;
}

function buildAlgoliaRecord(row, meta) {
  const tags = sanitizeExtraArray(meta?.summary_tags, 48, ALGOLIA_TAG_LIMIT);
  const createdAt =
    typeof row.created_at === "string" && row.created_at.trim() ? row.created_at.trim() : null;
  const createdAtTs = createdAt ? Date.parse(createdAt) || null : null;
  const facets = {};
  const source = typeof meta?.source === "string" ? meta.source.trim() : null;
  if (source) {
    facets.source = source;
  }
  const holiday =
    meta?.summary_time && typeof meta.summary_time === "object"
      ? meta.summary_time.holiday
      : null;
  if (typeof holiday === "string" && holiday.trim()) {
    facets.holiday = holiday.trim();
  }

  const title = normalize(row.title, TITLE_LIMIT);
  const description = normalize(row.description, DESCRIPTION_LIMIT);
  const extra = buildAlgoliaExtra(meta);

  return {
    objectID: String(row.id),
    ownerId: String(row.owner_user_id),
    title: title || null,
    description: description || null,
    kind: typeof row.kind === "string" ? row.kind : null,
    mediaUrl: typeof row.media_url === "string" ? row.media_url : null,
    createdAt,
    createdAt_ts: createdAtTs,
    tags: tags.length ? tags : null,
    facets: Object.keys(facets).length ? facets : null,
    extra: extra || null,
  };
}

function extractEmbeddingText(row, meta) {
  return buildEmbeddingText({
    kind: typeof row.kind === "string" ? row.kind.trim() : null,
    source: typeof meta?.source === "string" ? meta.source.trim() : null,
    title: typeof row.title === "string" ? row.title : null,
    description: typeof row.description === "string" ? row.description : null,
    rawText: typeof meta?.raw_text === "string" ? meta.raw_text : null,
    mediaType: typeof row.media_type === "string" ? row.media_type : null,
    meta,
  });
}

async function main() {
  let total = 0;
  let pineconeUpserts = 0;
  let algoliaUpserts = 0;

  const pageSize = 200;
  let from = 0;

  console.log("Scanning Supabase memories for Pinecone/Algolia backfill...");

  for (;;) {
    const { data, error } = await supabase
      .from("memories")
      .select(
        "id, owner_user_id, kind, post_id, title, description, media_url, media_type, meta, created_at",
      )
      .order("created_at", { ascending: true })
      .range(from, from + pageSize - 1);

    if (error) {
      console.error("Supabase select error", error);
      process.exit(1);
    }

    if (!data || !data.length) {
      break;
    }

    for (const row of data) {
      total += 1;
      const meta =
        (row.meta && typeof row.meta === "object" ? { ...row.meta } : {}) ?? {};
      if (Object.prototype.hasOwnProperty.call(meta, "embedding")) {
        delete meta.embedding;
      }
      const embeddingText = extractEmbeddingText(row, meta);
      if (!embeddingText) {
        continue;
      }

      const metadata = buildVectorMetadata(row, meta);
      const needsPinecone = await ensurePineconeVector(row, embeddingText, metadata);
      if (needsPinecone) {
        pineconeUpserts += 1;
      }

      const algoliaRecord = buildAlgoliaRecord(row, meta);
      const algoliaResult = await ensureAlgoliaRecord(algoliaRecord);
      if (algoliaResult) {
        algoliaUpserts += 1;
      }
    }

    from += data.length;
  }

  console.log(
    `Processed ${total} memories. Pinecone upserts: ${pineconeUpserts}. Algolia updates: ${algoliaUpserts}.`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});


