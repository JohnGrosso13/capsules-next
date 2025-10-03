import "server-only";

import { createAlgoliaClient, createAlgoliaSearchIndex } from "@/adapters/search/algolia";
import { serverEnv } from "@/lib/env/server";
import type { SearchIndex } from "@/ports/search-index";

let searchIndexInstance: SearchIndex | null | undefined;

function resolveIndexName(): string | null {
  if (!serverEnv.ALGOLIA_APP_ID || !serverEnv.ALGOLIA_API_KEY) return null;
  const prefix = (serverEnv.ALGOLIA_INDEX_PREFIX ?? "").trim();
  const base = prefix.length ? `${prefix}_memories` : "memories";
  return base.toLowerCase();
}

export function getSearchIndex(): SearchIndex | null {
  if (searchIndexInstance !== undefined) {
    return searchIndexInstance;
  }
  const indexName = resolveIndexName();
  if (!indexName) {
    searchIndexInstance = null;
    return null;
  }
  try {
    const client = createAlgoliaClient(serverEnv.ALGOLIA_APP_ID!, serverEnv.ALGOLIA_API_KEY!);
    searchIndexInstance = createAlgoliaSearchIndex(client, indexName);
  } catch (error) {
    console.warn("Algolia initialization failed", error);
    searchIndexInstance = null;
  }
  return searchIndexInstance;
}
