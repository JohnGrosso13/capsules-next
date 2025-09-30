import { type SearchClient, searchClient } from "@algolia/client-search";

import type {
  SearchIndex,
  SearchIndexMatch,
  SearchIndexQuery,
  SearchIndexRecord,
} from "@/ports/search-index";

function buildFilters(query: SearchIndexQuery): string {
  const filters: string[] = [`ownerId:${JSON.stringify(query.ownerId)}`];
  const { filters: f } = query;
  if (f?.kinds?.length) {
    const kindFilters = f.kinds.map((kind) => `kind:${JSON.stringify(kind)}`);
    filters.push(`(${kindFilters.join(" OR ")})`);
  }
  if (f?.tags?.length) {
    const tagFilters = f.tags.map((tag) => `tags:${JSON.stringify(tag)}`);
    filters.push(`(${tagFilters.join(" OR ")})`);
  }
  if (f?.since) {
    filters.push(`createdAt_ts>=${Date.parse(f.since) || 0}`);
  }
  if (f?.until) {
    filters.push(`createdAt_ts<=${Date.parse(f.until) || 0}`);
  }
  return filters.join(" AND ");
}

function isAlgoliaPermissionError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const maybe = error as { status?: number | null; message?: unknown };
  const message = typeof maybe.message === "string" ? maybe.message.toLowerCase() : "";
  if (message.includes("not enough rights")) return true;
  if (typeof maybe.status === "number" && (maybe.status === 400 || maybe.status === 403)) {
    return (
      message.includes("forbidden") ||
      message.includes("not authorized") ||
      message.includes("not enough rights")
    );
  }
  return false;
}
export function createAlgoliaSearchIndex(
  client: SearchClient,
  indexName: string,
): SearchIndex {

  return {
    async upsert(records: SearchIndexRecord[]) {
      if (!records.length) return;
      const payload = records.map((record) => {
        const createdAtIso = record.createdAt ?? null;
        const createdAtTs = createdAtIso ? Date.parse(createdAtIso) || null : null;
        return {
          objectID: record.id,
          ownerId: record.ownerId,
          title: record.title ?? null,
          description: record.description ?? null,
          kind: record.kind ?? null,
          mediaUrl: record.mediaUrl ?? null,
          tags: record.tags ?? null,
          facets: record.facets ?? null,
          extra: record.extra ?? null,
          createdAt: createdAtIso,
          createdAt_ts: createdAtTs,
        };
      });
      try {
        await client.saveObjects({ indexName, objects: payload });
      } catch (error) {
        if (isAlgoliaPermissionError(error)) {
          console.warn("search index upsert skipped: insufficient Algolia permissions", error);
          return;
        }
        throw error;
      }
    },
    async delete(ids: string[]) {
      if (!ids.length) return;
      try {
        await client.deleteObjects({ indexName, objectIDs: ids });
      } catch (error) {
        if (isAlgoliaPermissionError(error)) {
          console.warn("search index delete skipped: insufficient Algolia permissions", error);
          return;
        }
        throw error;
      }
    },
    async search(query: SearchIndexQuery) {
      const response = await client.searchSingleIndex<Record<string, unknown>>({
        indexName,
        searchParams: {
          query: query.text || "",
          hitsPerPage: query.limit,
          filters: buildFilters(query),
        },
      });
      const matches: SearchIndexMatch[] = [];
      const total = response.hits?.length ?? 0;
      response.hits?.forEach((hit: Record<string, unknown>, index: number) => {
        const objectID = typeof hit.objectID === "string" ? hit.objectID : String(hit.objectID ?? "");
        const match: SearchIndexMatch = {
          id: objectID,
          score: total ? total - index : 1,
        };
        const highlightSource = (hit._highlightResult as Record<string, { value?: string }> | undefined) ?? null;
        if (highlightSource) {
          match.highlight = highlightSource.description?.value ?? highlightSource.title?.value ?? null;
        }
        const data = hit as Record<string, unknown>;
        const tags = Array.isArray(data.tags)
          ? (data.tags as unknown[]).filter((value): value is string => typeof value === "string")
          : null;
        const extra =
          data.extra && typeof data.extra === "object" && !Array.isArray(data.extra)
            ? (data.extra as Record<string, unknown>)
            : null;
        match.record = {
          id: objectID,
          ownerId: typeof data.ownerId === "string" ? data.ownerId : String(data.ownerId ?? ""),
          title: typeof data.title === "string" ? data.title : null,
          description: typeof data.description === "string" ? data.description : null,
          kind: typeof data.kind === "string" ? data.kind : null,
          mediaUrl: typeof data.mediaUrl === "string" ? data.mediaUrl : null,
          createdAt: typeof data.createdAt === "string" ? data.createdAt : null,
          tags,
          facets: null,
          extra,
        };
        matches.push(match);
      });
      return matches;
    },
  };
}

export function createAlgoliaClient(appId: string, apiKey: string): SearchClient {
  return searchClient(appId, apiKey);
}
