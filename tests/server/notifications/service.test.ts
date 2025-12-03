import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

import {
  createNotification,
  updateNotificationSettings,
} from "@/server/notifications/service";
import { PATCH as patchNotifications } from "@/app/api/notifications/route";

type Row = Record<string, unknown>;
type TableMap = Record<string, Row[]>;

type Filter =
  | { kind: "eq"; column: string; value: unknown }
  | { kind: "lt"; column: string; value: unknown }
  | { kind: "is"; column: string; value: unknown }
  | { kind: "in"; column: string; value: unknown[] };

function createFakeDatabase(tables: TableMap) {
  const reset = () => {
    for (const key of Object.keys(tables)) {
      delete tables[key];
    }
  };

  const applyFilters = (rows: Row[], filters: Filter[]) => {
    return rows.filter((row) =>
      filters.every((filter) => {
        const value = row[filter.column];
        switch (filter.kind) {
          case "eq":
            return value === filter.value;
          case "lt":
            return new Date(String(value)).getTime() < new Date(String(filter.value)).getTime();
          case "is":
            return filter.value === null ? value === null : value === filter.value;
          case "in":
            return filter.value.includes(value);
          default:
            return true;
        }
      }),
    );
  };

  const client = {
    from(table: string) {
      const filters: Filter[] = [];
      let orderBy: { column: string; ascending: boolean } | null = null;
      let limitCount: number | null = null;
      let rangeArgs: { from: number; to: number } | null = null;
      let selectCount: string | null = null;
      let selectHead = false;
      let operation: "select" | "insert" | "update" | "upsert" | "delete" = "select";
      let values: unknown = null;

      const builder = {
        select(_columns?: string, options?: Record<string, unknown>) {
          selectCount = (options?.count as string) ?? null;
          selectHead = Boolean(options?.head);
          return builder;
        },
        insert(payload: unknown) {
          operation = "insert";
          values = payload;
          return builder;
        },
        upsert(payload: unknown) {
          operation = "upsert";
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
        lt(column: string, value: unknown) {
          filters.push({ kind: "lt", column, value });
          return builder;
        },
        is(column: string, value: unknown) {
          filters.push({ kind: "is", column, value });
          return builder;
        },
        in(column: string, value: unknown[]) {
          filters.push({ kind: "in", column, value });
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
        range(from: number, to: number) {
          rangeArgs = { from, to };
          return builder;
        },
        async fetch() {
          const store = (tables[table] ??= []);
          let working = applyFilters([...store], filters);

          if (operation === "insert" || operation === "upsert") {
            const payloads = Array.isArray(values) ? values : [values];
            const affected: Row[] = [];
            for (const payload of payloads) {
              const record: Row = { ...(payload as Row) };
              if (!record.id) {
                record.id = `id-${store.length + affected.length + 1}`;
              }
              if (!record.created_at) {
                record.created_at = new Date().toISOString();
              }

              if (operation === "upsert") {
                const key = record.user_id ?? record.id;
                const idx = store.findIndex(
                  (row) => (key && row.user_id === key) || (key && row.id === key),
                );
                if (idx >= 0) {
                  store[idx] = { ...store[idx], ...record };
                  affected.push(store[idx]);
                  continue;
                }
              }

              store.push(record);
              affected.push(record);
            }
            working = affected;
          } else if (operation === "update") {
            const updated: Row[] = [];
            for (const row of store) {
              if (applyFilters([row], filters).length) {
                const next: Row = { ...row, ...(values as Row) };
                Object.assign(row, next);
                updated.push(next);
              }
            }
            working = updated;
          } else if (operation === "delete") {
            const toDelete = new Set(
              applyFilters([...store], filters)
                .map((row) => row.id ?? row.user_id)
                .filter((id): id is string => typeof id === "string" && id.length > 0),
            );
            for (let i = store.length - 1; i >= 0; i -= 1) {
              const row = store[i]!;
              const key = (row.id ?? row.user_id) as string | undefined;
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

          if (rangeArgs) {
            working = working.slice(rangeArgs.from, rangeArgs.to + 1);
          } else if (typeof limitCount === "number") {
            working = working.slice(0, limitCount);
          }

          const count = selectCount ? applyFilters([...store], filters).length : null;
          const data = selectHead ? null : working;
          return { data, error: null, count };
        },
        async maybeSingle() {
          const res = await builder.fetch();
          return { data: (res.data ?? [])[0] ?? null, error: res.error, count: res.count };
        },
        async single() {
          const res = await builder.fetch();
          return { data: (res.data ?? [])[0] ?? null, error: res.error, count: res.count };
        },
      };

      return builder;
    },
  };

  return { client, tables, reset };
}

const tables: TableMap = {};
const { client, reset } = createFakeDatabase(tables);

vi.mock("@/config/database", () => ({
  getDatabaseAdminClient: () => client,
}));

vi.mock("@/lib/auth/payload", () => ({
  ensureUserFromRequest: vi.fn(async () => "user-1"),
}));

describe("notification settings + creation", () => {
  beforeEach(() => {
    reset();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it("merges updates without resetting other toggles", async () => {
    tables.user_notification_settings = [
      {
        user_id: "u1",
        comment_on_post: false,
        comment_reply: true,
        post_like: false,
        mention: true,
      },
    ];

    const result = await updateNotificationSettings("u1", { commentReply: false });

    expect(result.commentOnPost).toBe(false);
    expect(result.commentReply).toBe(false);
    expect(result.postLike).toBe(false);

    const stored = tables.user_notification_settings.find((row) => row.user_id === "u1")!;
    expect(stored.comment_on_post).toBe(false);
    expect(stored.post_like).toBe(false);
  });

  it("skips notifications when preference is disabled or actor matches user", async () => {
    tables.user_notification_settings = [
      { user_id: "u1", comment_on_post: false, post_like: true, mention: true },
    ];

    const skipped = await createNotification({
      userId: "u1",
      type: "comment_on_post",
      title: "should skip",
    });
    expect(skipped).toBeNull();
    expect(tables.user_notifications ?? []).toHaveLength(0);

    const selfSkip = await createNotification({
      userId: "u1",
      actorId: "u1",
      type: "post_like",
      title: "self",
    });
    expect(selfSkip).toBeNull();
    expect(tables.user_notifications ?? []).toHaveLength(0);

    const created = await createNotification({
      userId: "u1",
      type: "post_like",
      title: "ok",
    });
    expect(created?.type).toBe("post_like");
    expect(tables.user_notifications).toHaveLength(1);
  });

  it("prunes stale and excess notifications", async () => {
    vi.setSystemTime(new Date("2024-01-01T00:00:00.000Z"));
    await createNotification({ userId: "u2", type: "post_like", title: "old-1" });
    await createNotification({ userId: "u2", type: "post_like", title: "old-2" });

    vi.setSystemTime(new Date("2024-08-01T00:00:00.000Z"));
    for (let i = 0; i < 305; i += 1) {
      await createNotification({
        userId: "u2",
        type: "post_like",
        title: `recent-${i}`,
      });
    }

    await Promise.resolve(); // allow prune to complete

    const stored = (tables.user_notifications ?? []).filter((row) => row.user_id === "u2");
    expect(stored.length).toBeLessThanOrEqual(300);
    const cutoff = new Date("2024-02-03T00:00:00.000Z").getTime();
    expect(
      stored.every((row) => {
        const created = typeof row.created_at === "string" ? new Date(row.created_at).getTime() : 0;
        return created >= cutoff;
      }),
    ).toBe(true);
    expect(stored.some((row) => String(row.title).startsWith("old-"))).toBe(false);
  });
});

describe("notifications API PATCH", () => {
  beforeEach(() => {
    reset();
  });

  it("rejects empty bodies instead of marking all read", async () => {
    const req = new Request("http://localhost/api/notifications", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: "{}",
    });

    const res = await patchNotifications(req);
    const payload = await res.json();

    expect(res.status).toBe(400);
    expect(payload.error).toBe("invalid_request");
  });

  it("marks all unread notifications when all=true", async () => {
    tables.user_notifications = [
      {
        id: "n1",
        user_id: "user-1",
        type: "post_like",
        title: "one",
        body: null,
        href: null,
        data: null,
        created_at: new Date().toISOString(),
        read_at: null,
      },
      {
        id: "n2",
        user_id: "user-1",
        type: "mention",
        title: "two",
        body: null,
        href: null,
        data: null,
        created_at: new Date().toISOString(),
        read_at: null,
      },
    ];

    const req = new Request("http://localhost/api/notifications", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ all: true }),
    });

    const res = await patchNotifications(req);
    const payload = await res.json();

    expect(res.status).toBe(200);
    expect(payload.updated).toBe(2);
    expect(payload.unreadCount).toBe(0);

    const stored = tables.user_notifications.filter((row) => row.user_id === "user-1");
    expect(stored.every((row) => typeof row.read_at === "string" && row.read_at.length > 0)).toBe(
      true,
    );
  });
});
