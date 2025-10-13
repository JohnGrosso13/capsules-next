import "server-only";

import { getPineconeVectorStore } from "@/adapters/vector/pinecone";
import type { RecordMetadata } from "@pinecone-database/pinecone";
import type { VectorStore } from "@/ports/vector-store";

let vectorStoreInstance: VectorStore<RecordMetadata> | null = null;

function getOrCreateVectorStore(): VectorStore<RecordMetadata> {
  if (!vectorStoreInstance) {
    vectorStoreInstance = getPineconeVectorStore();
  }
  return vectorStoreInstance;
}

export function getVectorStore<T extends RecordMetadata = RecordMetadata>(): VectorStore<T> | null {
  return getOrCreateVectorStore() as VectorStore<T>;
}

export function getVectorVendor(): string {
  return "pinecone";
}
