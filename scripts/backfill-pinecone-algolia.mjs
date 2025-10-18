#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import process from "node:process";

import { createClient } from "@supabase/supabase-js";
import { Pinecone } from "@pinecone-database/pinecone";
import algoliasearch from "algoliasearch";

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

let algoliaIndex = null;
if (ALGOLIA_APP_ID && ALGOLIA_API_KEY) {
  try {
    const client = algoliasearch(ALGOLIA_APP_ID, ALGOLIA_API_KEY);
    const base = ALGOLIA_INDEX_PREFIX ? `${ALGOLIA_INDEX_PREFIX}_memories` : "memories";
    algoliaIndex = client.initIndex(base.toLowerCase());
  } catch (error) {
    console.error("Failed to initialise Algolia client:", error);
  }
}

if (!algoliaIndex) {
  console.warn("Algolia not configured; search index upserts will be skipped.");
}

function sanitizeArray(value, limit) {
  if (!Array.isArray(value)) return [];
  const results = [];
  for (const entry of value) {
    if (typeof entry !== "string") continue;
    const trimmed = entry.replace(/\s+/g, " ").trim();
    if (!trimmed) continue;
    results.push(trimmed.slice(0, limit));
    if (results.length >= 24) break;
  }
  return results;
}

const TITLE_LIMIT = 256;
const DESCRIPTION_LIMIT = 768;
const MEDIA_URL_LIMIT = 512;
const MEDIA_TYPE_LIMIT = 120;
const AUTHOR_LIMIT = 160;

function normalize(value, limit) {
  if (typeof value !== "string") return null;
  const trimmed = value.replace(/\s+/g, " ").trim();
  if (!trimmed) return null;
  return trimmed.length > limit ? `${trimmed.slice(0, limit - 3)}...` : trimmed;
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
  if (!algoliaIndex) return false;
  try {
    await algoliaIndex.saveObjects([record], { autoGenerateObjectIDIfNotExist: false });
    return true;
  } catch (error) {
    console.error("Algolia saveObjects failed", error);
    return false;
  }
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
  const tags = sanitizeArray(meta?.summary_tags, 48);
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

  return {
    objectID: String(row.id),
    ownerId: String(row.owner_user_id),
    title: typeof row.title === "string" ? row.title : null,
    description: typeof row.description === "string" ? row.description : null,
    kind: typeof row.kind === "string" ? row.kind : null,
    mediaUrl: typeof row.media_url === "string" ? row.media_url : null,
    createdAt,
    createdAt_ts: createdAtTs,
    tags: tags.length ? tags : null,
    facets: Object.keys(facets).length ? facets : null,
    extra: meta || null,
  };
}

function extractEmbeddingText(row, meta) {
  const summaryTags = sanitizeArray(meta?.summary_tags, 48);
  const parts = [];
  if (typeof row.title === "string") parts.push(row.title);
  if (typeof row.description === "string") parts.push(row.description);
  if (typeof row.media_type === "string") parts.push(row.media_type);
  summaryTags.forEach((tag) => parts.push(tag));
  if (meta && typeof meta === "object") {
    if (typeof meta.post_author_name === "string") parts.push(meta.post_author_name);
    if (typeof meta.post_excerpt === "string") parts.push(meta.post_excerpt);
  }
  return parts
    .map((value) => value.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join(" ");
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
