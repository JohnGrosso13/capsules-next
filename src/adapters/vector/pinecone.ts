import type { ScoredPineconeRecord } from "@pinecone-database/pinecone";

import { getPineconeIndex, isPineconeEnabled } from "@/lib/pinecone/client";
import type {
  VectorMatch,
  VectorQuery,
  VectorRecord,
  VectorStore,
} from "@/ports/vector-store";

function toVectorMatches<T extends Record<string, unknown>>(
  matches: readonly ScoredPineconeRecord<T>[] | undefined,
): VectorMatch<T>[] {
  if (!Array.isArray(matches)) return [];
  return matches.map((match) => ({
    id: String(match.id),
    score: typeof match.score === "number" ? match.score : 0,
    metadata: (match.metadata ?? undefined) as T | undefined,
  }));
}

class PineconeVectorStore<TMeta extends Record<string, unknown>> implements VectorStore<TMeta> {
  async upsert(records: VectorRecord<TMeta>[]): Promise<void> {
    if (!isPineconeEnabled()) return;
    if (!Array.isArray(records) || !records.length) return;
    const index = getPineconeIndex<TMeta>();
    if (!index) return;
    const payload = records
      .filter((record) => record && record.id && Array.isArray(record.values) && record.values.length)
      .map((record) => ({
        id: record.id,
        values: record.values,
        metadata: record.metadata ?? undefined,
      }));
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
      const response = await index.query({
        vector,
        topK: k,
        includeMetadata: true,
        filter: filter as Record<string, unknown> | undefined,
      });
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

const pineconeStore = new PineconeVectorStore<Record<string, unknown>>();

export function getPineconeVectorStore(): VectorStore<Record<string, unknown>> {
  return pineconeStore;
}
