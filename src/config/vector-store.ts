import "server-only";

import { getPineconeVectorStore } from "@/adapters/vector/pinecone";
import type { VectorStore } from "@/ports/vector-store";

const vectorVendor = process.env.VECTOR_VENDOR ?? "pinecone";

let vectorStoreInstance: VectorStore<Record<string, unknown>> | null = null;

switch (vectorVendor) {
  case "pinecone":
  case "":
  case undefined:
    vectorStoreInstance = getPineconeVectorStore();
    break;
  default:
    console.warn(`Unknown vector vendor "${vectorVendor}". Vector store disabled.`);
    vectorStoreInstance = null;
}

export function getVectorStore<T extends Record<string, unknown> = Record<string, unknown>>():
  | VectorStore<T>
  | null {
  return vectorStoreInstance as VectorStore<T> | null;
}

export function getVectorVendor(): string {
  return vectorVendor;
}
