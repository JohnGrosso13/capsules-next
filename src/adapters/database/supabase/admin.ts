import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { serverEnv } from "@/lib/env/server";
import type {
  DatabaseAdapter,
  DatabaseClient,
  DatabaseError,
  DatabaseQueryBuilder,
  DatabaseResult,
  DatabaseTableBuilder,
} from "@/ports/database";

function mapError(error: unknown): DatabaseError {
  if (!error || typeof error !== "object") {
    return { message: String(error ?? "Unknown database error") };
  }
  const record = error as Record<string, unknown>;
  return {
    message: typeof record.message === "string" ? record.message : "Database error",
    details: typeof record.details === "string" ? record.details : null,
    hint: typeof record.hint === "string" ? record.hint : null,
    code: typeof record.code === "string" ? record.code : null,
  };
}

type SupabaseQueryResponse<T> = {
  data: T[] | null;
  error: unknown;
  [key: string]: unknown;
};

type SupabaseSingleQueryResponse<T> = {
  data: T | null;
  error: unknown;
  [key: string]: unknown;
};

type SupabaseFilterLike<T> = PromiseLike<SupabaseQueryResponse<T>> & {
  select<TResult = T>(columns?: string): SupabaseFilterLike<TResult>;
  eq(column: string, value: unknown): SupabaseFilterLike<T>;
  neq(column: string, value: unknown): SupabaseFilterLike<T>;
  gt(column: string, value: unknown): SupabaseFilterLike<T>;
  gte(column: string, value: unknown): SupabaseFilterLike<T>;
  lt(column: string, value: unknown): SupabaseFilterLike<T>;
  lte(column: string, value: unknown): SupabaseFilterLike<T>;
  is(column: string, value: unknown): SupabaseFilterLike<T>;
  like(column: string, value: string): SupabaseFilterLike<T>;
  ilike(column: string, value: string): SupabaseFilterLike<T>;
  in(column: string, values: readonly unknown[]): SupabaseFilterLike<T>;
  contains(column: string, value: unknown, options?: Record<string, unknown>): SupabaseFilterLike<T>;
  filter(column: string, operator: string, value: unknown): SupabaseFilterLike<T>;
  or(filters: string, options?: { foreignTable?: string }): SupabaseFilterLike<T>;
  order(column: string, options?: { ascending?: boolean; nullsFirst?: boolean }): SupabaseFilterLike<T>;
  limit(count: number): SupabaseFilterLike<T>;
  range(from: number, to: number): SupabaseFilterLike<T>;
  maybeSingle(): Promise<SupabaseSingleQueryResponse<T>>;
  single(): Promise<SupabaseSingleQueryResponse<T>>;
};

function toSupabaseFilter<T>(builder: unknown): SupabaseFilterLike<T> {
  return builder as SupabaseFilterLike<T>;
}

class SupabaseQueryBuilder<T> implements DatabaseQueryBuilder<T> {
  constructor(private readonly builder: SupabaseFilterLike<T>) {}

  select<TResult = T>(columns?: string): DatabaseQueryBuilder<TResult> {
    return new SupabaseQueryBuilder<TResult>(this.builder.select<TResult>(columns));
  }

  eq(column: string, value: unknown): DatabaseQueryBuilder<T> {
    return new SupabaseQueryBuilder<T>(this.builder.eq(column, value));
  }

  neq(column: string, value: unknown): DatabaseQueryBuilder<T> {
    return new SupabaseQueryBuilder<T>(this.builder.neq(column, value));
  }

  gt(column: string, value: unknown): DatabaseQueryBuilder<T> {
    return new SupabaseQueryBuilder<T>(this.builder.gt(column, value));
  }

  gte(column: string, value: unknown): DatabaseQueryBuilder<T> {
    return new SupabaseQueryBuilder<T>(this.builder.gte(column, value));
  }

  lt(column: string, value: unknown): DatabaseQueryBuilder<T> {
    return new SupabaseQueryBuilder<T>(this.builder.lt(column, value));
  }

  lte(column: string, value: unknown): DatabaseQueryBuilder<T> {
    return new SupabaseQueryBuilder<T>(this.builder.lte(column, value));
  }

  is(column: string, value: unknown): DatabaseQueryBuilder<T> {
    return new SupabaseQueryBuilder<T>(this.builder.is(column, value));
  }

  like(column: string, value: string): DatabaseQueryBuilder<T> {
    return new SupabaseQueryBuilder<T>(this.builder.like(column, value));
  }

  ilike(column: string, value: string): DatabaseQueryBuilder<T> {
    return new SupabaseQueryBuilder<T>(this.builder.ilike(column, value));
  }

  in(column: string, values: readonly unknown[]): DatabaseQueryBuilder<T> {
    return new SupabaseQueryBuilder<T>(this.builder.in(column, values));
  }

  contains(column: string, value: unknown, options?: Record<string, unknown>): DatabaseQueryBuilder<T> {
    return new SupabaseQueryBuilder<T>(this.builder.contains(column, value, options));
  }

  filter(column: string, operator: string, value: unknown): DatabaseQueryBuilder<T> {
    return new SupabaseQueryBuilder<T>(this.builder.filter(column, operator, value));
  }

  or(filters: string, options?: { foreignTable?: string }): DatabaseQueryBuilder<T> {
    return new SupabaseQueryBuilder<T>(this.builder.or(filters, options));
  }

  order(
    column: string,
    options?: { ascending?: boolean; nullsFirst?: boolean },
  ): DatabaseQueryBuilder<T> {
    return new SupabaseQueryBuilder<T>(this.builder.order(column, options));
  }

  limit(count: number): DatabaseQueryBuilder<T> {
    return new SupabaseQueryBuilder<T>(this.builder.limit(count));
  }

  range(from: number, to: number): DatabaseQueryBuilder<T> {
    return new SupabaseQueryBuilder<T>(this.builder.range(from, to));
  }

  async fetch(): Promise<DatabaseResult<T[]>> {
    const { data, error } = await this.builder;
    return {
      data: (data ?? null) as T[] | null,
      error: error ? mapError(error) : null,
    };
  }

  async maybeSingle(): Promise<DatabaseResult<T | null>> {
    const { data, error } = await this.builder.maybeSingle();
    return {
      data: (data ?? null) as T | null,
      error: error ? mapError(error) : null,
    };
  }

  async single(): Promise<DatabaseResult<T>> {
    const { data, error } = await this.builder.single();
    return {
      data: data as T,
      error: error ? mapError(error) : null,
    };
  }
}

class SupabaseTableBuilder implements DatabaseTableBuilder {
  constructor(private readonly client: SupabaseClient, private readonly table: string) {}

  select<T = unknown>(columns?: string): DatabaseQueryBuilder<T> {
    const query = this.client.from(this.table).select(columns);
    return new SupabaseQueryBuilder<T>(toSupabaseFilter<T>(query));
  }

  insert<T = unknown>(
    values: Record<string, unknown> | Array<Record<string, unknown>>,
    options?: Record<string, unknown>,
  ): DatabaseQueryBuilder<T> {
    const query = this.client.from(this.table).insert(values as never, options);
    return new SupabaseQueryBuilder<T>(toSupabaseFilter<T>(query));
  }

  update<T = unknown>(values: Record<string, unknown>): DatabaseQueryBuilder<T> {
    const query = this.client.from(this.table).update(values);
    return new SupabaseQueryBuilder<T>(toSupabaseFilter<T>(query));
  }

  upsert<T = unknown>(
    values: Record<string, unknown> | Array<Record<string, unknown>>,
    options?: Record<string, unknown>,
  ): DatabaseQueryBuilder<T> {
    const query = this.client.from(this.table).upsert(values as never, options);
    return new SupabaseQueryBuilder<T>(toSupabaseFilter<T>(query));
  }

  delete<T = unknown>(options?: Record<string, unknown>): DatabaseQueryBuilder<T> {
    const query = this.client.from(this.table).delete(options);
    return new SupabaseQueryBuilder<T>(toSupabaseFilter<T>(query));
  }
}

class SupabaseDatabaseClient implements DatabaseClient {
  constructor(private readonly client: SupabaseClient) {}

  from(table: string): DatabaseTableBuilder {
    return new SupabaseTableBuilder(this.client, table);
  }

  async rpc<T = unknown>(fn: string, params?: Record<string, unknown>): Promise<DatabaseResult<T>> {
    const { data, error } = await this.client.rpc(fn, params ?? {});
    return {
      data: (data ?? null) as T | null,
      error: error ? mapError(error) : null,
    };
  }
}

let cachedClient: DatabaseClient | null = null;

export function getSupabaseDatabaseClient(): DatabaseClient {
  if (!cachedClient) {
    const supabase = createClient(serverEnv.SUPABASE_URL, serverEnv.SUPABASE_SERVICE_ROLE_KEY, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });
    cachedClient = new SupabaseDatabaseClient(supabase);
  }
  return cachedClient;
}

class SupabaseDatabaseAdapter implements DatabaseAdapter {
  private adminClient: DatabaseClient | null = null;

  getAdminClient(): DatabaseClient {
    if (!this.adminClient) {
      this.adminClient = getSupabaseDatabaseClient();
    }
    return this.adminClient;
  }

  getVendor(): string {
    return "supabase";
  }
}

let cachedAdapter: DatabaseAdapter | null = null;

export function getSupabaseDatabaseAdapter(): DatabaseAdapter {
  if (!cachedAdapter) {
    cachedAdapter = new SupabaseDatabaseAdapter();
  }
  return cachedAdapter;
}


