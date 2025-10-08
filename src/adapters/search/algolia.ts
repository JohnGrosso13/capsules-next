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
  if (!error || typeof error !== "object") {
    return false;
  }
  const candidate = error as {
    status?: unknown;
    message?: unknown;
    name?: unknown;
    stack?: unknown;
  };
  const message = typeof candidate.message === "string" ? candidate.message : "";
  const normalizedMessage = message.toLowerCase();
  if (normalizedMessage.includes("not enough rights") || normalizedMessage.includes("insufficient permissions")) {
    return true;
  }
  const stack = typeof candidate.stack === "string" ? candidate.stack.toLowerCase() : "";
  if (stack.includes("not enough rights") || stack.includes("insufficient permissions")) {
    return true;
  }
  const status =
    typeof candidate.status === "number"
      ? candidate.status
      : typeof candidate.status === "string"
        ? Number(candidate.status)
        : null;
  if (typeof status === "number" && (status === 401 || status === 403)) {
    return true;
  }
  if (candidate.name === "ApiError" && normalizedMessage.includes("not enough rights")) {
    return true;
  }
  return false;
}

function getErrorSummary(error: unknown): string {
  if (error instanceof Error && typeof error.message === "string") {
    return error.message;
  }
  if (error && typeof error === "object" && "message" in error && typeof (error as { message?: unknown }).message === "string") {
    return String((error as { message: string }).message);
  }
  if (error === null || error === undefined) {
    return "Unknown error";
  }
  return String(error);
}
export function createAlgoliaSearchIndex(
  client: SearchClient,
  indexName: string,
): SearchIndex {
  let writesDisabled = false;
  let permissionWarningLogged = false;

  const handlePermissionError = (action: "upsert" | "delete", error: unknown): boolean => {
    if (!isAlgoliaPermissionError(error)) {
      return false;
    }
    writesDisabled = true;
    if (!permissionWarningLogged) {
      permissionWarningLogged = true;
      const summary = getErrorSummary(error);
      // Avoid spamming logs in dev environments when a search-only key is used.
      console.warn(
        `Algolia write operations disabled for index "${indexName}" (${action}): ${summary}`,
        error,
      );
    }
    return true;
  };

  return {
    async upsert(records: SearchIndexRecord[]) {
      if (!records.length || writesDisabled) return;
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
        if (!handlePermissionError("upsert", error)) {
          throw error;
        }
      }
    },
    async delete(ids: string[]) {
      if (!ids.length || writesDisabled) return;
      try {
        await client.deleteObjects({ indexName, objectIDs: ids });
      } catch (error) {
        if (!handlePermissionError("delete", error)) {
          throw error;
        }
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
