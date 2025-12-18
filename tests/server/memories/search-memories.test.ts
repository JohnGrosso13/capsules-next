import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

type Row = Record<string, unknown>;
type TableMap = Record<string, Row[]>;

type Filter =
  | { kind: "eq"; column: string; value: unknown }
  | { kind: "in"; column: string; value: unknown[] }
  | { kind: "gte"; column: string; value: unknown }
  | { kind: "lte"; column: string; value: unknown };

type OrFilter = { column: string; value: string };

function createFakeDatabase(tables: TableMap) {
  const reset = () => {
    for (const key of Object.keys(tables)) {
      delete tables[key];
    }
  };

  const applyFilters = (rows: Row[], filters: Filter[], orFilters: OrFilter[]) => {
    const matchesAnd = rows.filter((row) =>
      filters.every((filter) => {
        const value = row[filter.column];
        switch (filter.kind) {
          case "eq":
            return value === filter.value;
          case "in":
            return filter.value.includes(value);
          case "gte":
            return new Date(String(value)).getTime() >= new Date(String(filter.value)).getTime();
          case "lte":
            return new Date(String(value)).getTime() <= new Date(String(filter.value)).getTime();
          default:
            return true;
        }
      }),
    );

    if (!orFilters.length) return matchesAnd;
    return matchesAnd.filter((row) =>
      orFilters.some((filter) => {
        const haystack = String(row[filter.column] ?? "").toLowerCase();
        return haystack.includes(filter.value);
      }),
    );
  };

  const parseOrFilters = (expression: string): OrFilter[] => {
    return expression
      .split(",")
      .map((clause) => clause.trim())
      .map((clause) => {
        const [column, operator, ...rest] = clause.split(".");
        if (operator !== "ilike" || !column) return null;
        const raw = rest.join(".");
        const value = raw.replace(/%/g, "").toLowerCase();
        if (!value) return null;
        return { column, value };
      })
      .filter((entry): entry is OrFilter => Boolean(entry));
  };

  const client = {
    from(table: string) {
      const filters: Filter[] = [];
      const orFilters: OrFilter[] = [];
      let orderBy: { column: string; ascending: boolean } | null = null;
      let limitCount: number | null = null;
      let operation: "select" | "insert" | "update" | "delete" = "select";
      let values: unknown = null;

      const builder = {
        select(_columns?: string) {
          return builder;
        },
        insert(payload: unknown) {
          operation = "insert";
          values = payload;
          return builder;
        },
        update(payload: unknown) {
          operation = "update";
          values = payload;
          return builder;
        },
        delete() {
          operation = "delete";
          return builder;
        },
        eq(column: string, value: unknown) {
          filters.push({ kind: "eq", column, value });
          return builder;
        },
        in(column: string, value: unknown[]) {
          filters.push({ kind: "in", column, value });
          return builder;
        },
        gte(column: string, value: unknown) {
          filters.push({ kind: "gte", column, value });
          return builder;
        },
        lte(column: string, value: unknown) {
          filters.push({ kind: "lte", column, value });
          return builder;
        },
        or(expression: string) {
          orFilters.push(...parseOrFilters(expression));
          return builder;
        },
        order(column: string, options?: { ascending?: boolean }) {
          orderBy = { column, ascending: options?.ascending !== false };
          return builder;
        },
        limit(count: number) {
          limitCount = count;
          return builder;
        },
        async fetch() {
          const store = (tables[table] ??= []);
          let working = applyFilters([...store], filters, orFilters);

          if (operation === "insert") {
            const payloads = Array.isArray(values) ? values : [values];
            const affected: Row[] = [];
            for (const payload of payloads) {
              const record: Row = { ...(payload as Row) };
              if (!record.id) {
                record.id = `id-${store.length + affected.length + 1}`;
              }
              store.push(record);
              affected.push(record);
            }
            working = affected;
          } else if (operation === "update") {
            const updated: Row[] = [];
            for (const row of store) {
              if (applyFilters([row], filters, orFilters).length) {
                const next: Row = { ...row, ...(values as Row) };
                Object.assign(row, next);
                updated.push(next);
              }
            }
            working = updated;
          } else if (operation === "delete") {
            const toDelete = new Set(
              applyFilters([...store], filters, orFilters)
                .map((row) => row.id)
                .filter((id): id is string => typeof id === "string" && id.length > 0),
            );
            for (let i = store.length - 1; i >= 0; i -= 1) {
              const row = store[i]!;
              const key = row.id as string | undefined;
              if (key && toDelete.has(key)) {
                store.splice(i, 1);
              }
            }
            working = [];
          }

          if (orderBy) {
            working.sort((a, b) => {
              const aVal = a[orderBy!.column] as string | number | null | undefined;
              const bVal = b[orderBy!.column] as string | number | null | undefined;
              const normalize = (val: string | number | null | undefined) => {
                if (typeof val === "number") return val;
                if (typeof val === "string") return val;
                return "";
              };
              const normA = normalize(aVal);
              const normB = normalize(bVal);
              if (normA === normB) return 0;
              return orderBy!.ascending ? (normA < normB ? -1 : 1) : normA > normB ? -1 : 1;
            });
          }

          if (typeof limitCount === "number") {
            working = working.slice(0, limitCount);
          }

          return { data: working, error: null };
        },
      };

      return builder;
    },
  };

  return { client, reset, tables };
}

const mockVectorState = vi.hoisted(() => ({
  matches: [] as Array<{ id: string; score?: number }>,
}));

const mockAlgoliaState = vi.hoisted(() => ({
  matches: [] as Array<{
    id: string;
    score: number;
    highlight?: string | null;
    record?: Record<string, unknown>;
  }>,
}));

const tables: TableMap = {};
const { client, reset } = createFakeDatabase(tables);

vi.mock("@/config/database", () => ({
  getDatabaseAdminClient: () => client,
}));

vi.mock("@/lib/ai/openai", () => ({
  embedText: vi.fn(async () => [0.12, 0.33]),
}));

vi.mock("@/services/memories/vector-store", () => ({
  queryMemoryVectors: vi.fn(async () => mockVectorState.matches),
  upsertMemoryVector: vi.fn(async () => undefined),
  deleteMemoryVectors: vi.fn(async () => undefined),
}));

const searchIndex = {
  search: vi.fn(async () => mockAlgoliaState.matches),
  upsert: vi.fn(async () => undefined),
  delete: vi.fn(async () => undefined),
};

vi.mock("@/config/search-index", () => ({
  getSearchIndex: () => searchIndex,
}));

describe("searchMemories hybrid ranking", () => {
  beforeEach(() => {
    reset();
    mockVectorState.matches = [];
    mockAlgoliaState.matches = [];
    searchIndex.search.mockClear();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("boosts dinosaur poll over irrelevant poll even when sources rank it lower", async () => {
    tables.memories = [
      {
        id: "poll-1",
        owner_user_id: "user-1",
        is_latest: true,
        kind: "poll",
        title: "Dinosaur Showdown",
        description: "A poll about which dinosaur reigns supreme.",
        meta: {
          poll_question: "Which dinosaur wins?",
          poll_options: ["T-Rex", "Velociraptor"],
          summary_tags: ["poll", "dinosaur"],
        },
        created_at: "2025-10-25T12:00:00.000Z",
      },
      {
        id: "poll-2",
        owner_user_id: "user-1",
        is_latest: true,
        kind: "poll",
        title: "Best Soccer Player Poll",
        description: "A poll about the best current soccer player.",
        meta: {
          poll_question: "Who is the best player?",
          poll_options: ["Mbappe", "Messi"],
          summary_tags: ["poll", "soccer"],
        },
        created_at: "2025-12-13T12:00:00.000Z",
      },
    ];

    mockVectorState.matches = [
      { id: "poll-2", score: 0.9 },
      { id: "poll-1", score: 0.85 },
    ];

    mockAlgoliaState.matches = [
      { id: "poll-2", score: 2 },
      { id: "poll-1", score: 1 },
    ];

    const { searchMemories } = await import("@/server/memories/service");
    const results = await searchMemories({
      ownerId: "user-1",
      query: "poll about dinosaurs",
      limit: 5,
    });

    expect(results[0]?.id).toBe("poll-1");
    const meta = results[0]?.meta as Record<string, unknown>;
    expect(meta?.search_sources).toContain("vector");
    expect(meta?.search_sources).toContain("algolia");
    expect(typeof results[0]?.relevanceScore).toBe("number");
  });

  it("returns algolia-only results when embeddings are disabled", async () => {
    mockAlgoliaState.matches = [
      {
        id: "doc-1",
        score: 1,
        record: {
          id: "doc-1",
          ownerId: "user-1",
          title: "Dino Poll",
          description: "Vote for the best dinosaur.",
          kind: "poll",
          createdAt: "2025-10-25T12:00:00.000Z",
          mediaUrl: null,
          tags: ["poll", "dinosaur"],
          facets: null,
          extra: { poll_question: "Best dinosaur?" },
        },
      },
    ];

    const { searchMemories } = await import("@/server/memories/service");
    const results = await searchMemories({
      ownerId: "user-1",
      query: "dinosaurs poll",
      limit: 3,
      useEmbedding: false,
    });

    expect(results[0]?.id).toBe("doc-1");
    const meta = results[0]?.meta as Record<string, unknown>;
    expect(meta?.search_sources).toContain("algolia");
    expect(typeof meta?.search_score).toBe("number");
  });
});
