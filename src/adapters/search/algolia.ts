import algoliasearch, { type SearchClient } from "algoliasearch";

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

export function createAlgoliaSearchIndex(
  client: SearchClient,
  indexName: string,
): SearchIndex {
  const index = client.initIndex(indexName);

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
      await index.saveObjects(payload, { autoGenerateObjectIDIfNotExist: false });
    },
    async delete(ids: string[]) {
      if (!ids.length) return;
      await index.deleteObjects(ids);
    },
    async search(query: SearchIndexQuery) {
      const params: Record<string, unknown> = {
        hitsPerPage: query.limit,
        filters: buildFilters(query),
      };
      const response = await index.search<Record<string, unknown>>(query.text || "", params);
      const matches: SearchIndexMatch[] = [];
      const total = response.hits?.length ?? 0;
      response.hits?.forEach((hit, index) => {
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
  return algoliasearch(appId, apiKey);
}
