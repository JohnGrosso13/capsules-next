import type { RecordMetadata, ScoredPineconeRecord } from "@pinecone-database/pinecone";

import { getPineconeIndex, isPineconeEnabled } from "./client";

const TITLE_LIMIT = 256;
const DESCRIPTION_LIMIT = 768;
const MEDIA_URL_LIMIT = 512;
const MEDIA_TYPE_LIMIT = 120;

export type MemoryVectorMetadata = RecordMetadata & {
  ownerId: string;
  kind?: string;
  postId?: string;
  title?: string;
  description?: string;
  mediaUrl?: string;
  mediaType?: string;
  source?: string;
  postAuthorName?: string;
  postExcerpt?: string;
};

function normalize(value: string | null | undefined, limit: number) {
  if (!value) return null;
  const trimmed = value.replace(/\s+/g, " ").trim();
  if (!trimmed) return null;
  return trimmed.length > limit ? `${trimmed.slice(0, limit - 3)}...` : trimmed;
}

export async function upsertMemoryVector({
  id,
  ownerId,
  values,
  kind,
  postId,
  title,
  description,
  mediaUrl,
  mediaType,
  extra,
}: {
  id: string;
  ownerId: string;
  values: number[];
  kind?: string | null;
  postId?: string | null;
  title?: string | null;
  description?: string | null;
  mediaUrl?: string | null;
  mediaType?: string | null;
  extra?: Record<string, unknown> | null;
}) {
  if (!isPineconeEnabled()) return;
  if (!id || !ownerId || !Array.isArray(values) || !values.length) return;

  const index = getPineconeIndex<MemoryVectorMetadata>();
  if (!index) return;

  const metadata: MemoryVectorMetadata = { ownerId };

  if (kind) metadata.kind = kind;
  if (postId) metadata.postId = postId;

  const normalizedTitle = normalize(title, TITLE_LIMIT);
  if (normalizedTitle) metadata.title = normalizedTitle;

  const normalizedDescription = normalize(description, DESCRIPTION_LIMIT);
  if (normalizedDescription) metadata.description = normalizedDescription;

  const normalizedMediaUrl = normalize(mediaUrl, MEDIA_URL_LIMIT);
  if (normalizedMediaUrl) metadata.mediaUrl = normalizedMediaUrl;

  const normalizedMediaType = normalize(mediaType, MEDIA_TYPE_LIMIT);
  if (normalizedMediaType) metadata.mediaType = normalizedMediaType;

  if (extra && typeof extra === "object") {
    const source = typeof extra.source === "string" ? normalize(extra.source, MEDIA_TYPE_LIMIT) : null;
    if (source) metadata.source = source;

    const author = typeof extra.post_author_name === "string" ? normalize(extra.post_author_name, 160) : null;
    if (author) metadata.postAuthorName = author;

    const excerpt = typeof extra.post_excerpt === "string" ? normalize(extra.post_excerpt, DESCRIPTION_LIMIT) : null;
    if (excerpt) metadata.postExcerpt = excerpt;
  }

  try {
    await index.upsert([
      {
        id,
        values,
        metadata,
      },
    ]);
  } catch (error) {
    console.warn("Pinecone upsert failed", error);
  }
}

export async function deleteMemoryVectors(ids: string[]) {
  if (!isPineconeEnabled()) return;
  if (!Array.isArray(ids) || !ids.length) return;

  const index = getPineconeIndex();
  if (!index) return;

  try {
    await index.deleteMany(ids);
  } catch (error) {
    console.warn("Pinecone delete failed", error);
  }
}

export type MemoryVectorMatch = ScoredPineconeRecord<MemoryVectorMetadata>;

export async function queryMemoryVectors(ownerId: string, vector: number[], topK: number) {
  if (!isPineconeEnabled()) return [] as MemoryVectorMatch[];
  if (!ownerId || !Array.isArray(vector) || !vector.length) return [] as MemoryVectorMatch[];

  const index = getPineconeIndex<MemoryVectorMetadata>();
  if (!index) return [] as MemoryVectorMatch[];

  const k = Math.max(1, Math.min(topK, 200));

  try {
    const response = await index.query({
      vector,
      topK: k,
      includeMetadata: true,
      filter: { ownerId },
    });
    return Array.isArray(response?.matches) ? (response.matches as MemoryVectorMatch[]) : [];
  } catch (error) {
    console.warn("Pinecone query failed", error);
    return [] as MemoryVectorMatch[];
  }
}
