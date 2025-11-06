import "server-only";

import type { RecordMetadata } from "@pinecone-database/pinecone";
import type { VectorStore } from "@/ports/vector-store";

let vectorStorePromise: Promise<VectorStore<RecordMetadata> | null> | null = null;

async function loadVectorStore(): Promise<VectorStore<RecordMetadata> | null> {
  const runtime =
    typeof process !== "undefined" && process && typeof process.env === "object"
      ? process.env.NEXT_RUNTIME
      : undefined;
  if (runtime === "edge") {
    return null;
  }

  try {
    const { getPineconeVectorStore } = await import("../adapters/vector/pinecone");
    return getPineconeVectorStore();
  } catch (error) {
    console.warn("Vector store initialization failed; falling back to null store.", error);
    return null;
  }
}

export async function getVectorStore<T extends RecordMetadata = RecordMetadata>(): Promise<
  VectorStore<T> | null
> {
  if (!vectorStorePromise) {
    vectorStorePromise = loadVectorStore();
  }
  const store = await vectorStorePromise;
  return (store as VectorStore<T> | null) ?? null;
}

export function getVectorVendor(): string {
  return "pinecone";
}
