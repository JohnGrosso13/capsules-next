import type {
  PineconeRecord,
  QueryOptions as PineconeQueryOptions,
  RecordMetadata,
  ScoredPineconeRecord,
} from "@pinecone-database/pinecone";

import { getPineconeIndex, isPineconeEnabled } from "@/lib/pinecone/client";
import type { VectorMatch, VectorQuery, VectorRecord, VectorStore } from "@/ports/vector-store";

function toVectorMatches<T extends RecordMetadata>(
  matches: readonly ScoredPineconeRecord<T>[] | undefined,
): VectorMatch<T>[] {
  if (!Array.isArray(matches)) return [];
  return matches.map((match) => {
    const base: VectorMatch<T> = {
      id: String(match.id),
      score: typeof match.score === "number" ? match.score : 0,
    };
    if (match.metadata) {
      base.metadata = match.metadata as T;
    }
    return base;
  });
}

class PineconeVectorStore<TMeta extends RecordMetadata> implements VectorStore<TMeta> {
  async upsert(records: VectorRecord<TMeta>[]): Promise<void> {
    if (!isPineconeEnabled()) return;
    if (!Array.isArray(records) || !records.length) return;
    const index = getPineconeIndex<TMeta>();
    if (!index) return;
    const payload: PineconeRecord<TMeta>[] = [];
    for (const record of records) {
      if (!record || !record.id || !Array.isArray(record.values) || !record.values.length) continue;
      const entry: PineconeRecord<TMeta> = {
        id: record.id,
        values: record.values,
      };
      if (record.metadata) {
        entry.metadata = record.metadata;
      }
      payload.push(entry);
    }
    if (!payload.length) return;
    try {
      await index.upsert(payload);
    } catch (error) {
      console.warn("Pinecone upsert failed", error);
    }
  }

  async query(params: VectorQuery<TMeta>): Promise<VectorMatch<TMeta>[]> {
    const { vector, topK, filter } = params;
    if (!isPineconeEnabled()) return [];
    if (!Array.isArray(vector) || !vector.length) return [];
    const index = getPineconeIndex<TMeta>();
    if (!index) return [];
    const k = Math.max(1, Math.min(topK ?? 1, 200));
    try {
      const queryOptions: PineconeQueryOptions = {
        vector,
        topK: k,
        includeMetadata: true,
        ...(filter && Object.keys(filter).length ? { filter: filter as object } : {}),
      };
      const response = await index.query(queryOptions);
      return toVectorMatches(response?.matches as ScoredPineconeRecord<TMeta>[] | undefined);
    } catch (error) {
      console.warn("Pinecone query failed", error);
      return [];
    }
  }

  async delete(ids: string[]): Promise<void> {
    if (!isPineconeEnabled()) return;
    if (!Array.isArray(ids) || !ids.length) return;
    const index = getPineconeIndex<TMeta>();
    if (!index) return;
    try {
      await index.deleteMany(ids);
    } catch (error) {
      console.warn("Pinecone delete failed", error);
    }
  }
}

const pineconeStore = new PineconeVectorStore<RecordMetadata>();

export function getPineconeVectorStore(): VectorStore<RecordMetadata> {
  return pineconeStore;
}
