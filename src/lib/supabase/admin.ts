import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { getDatabaseAdminClient } from "@/config/database";
import { serverEnv } from "@/lib/env/server";
import type {
  DatabaseClient,
  DatabaseError,
  DatabaseQueryBuilder,
  DatabaseResult,
  DatabaseTableBuilder,
} from "@/ports/database";

type SupabaseStyleError = {
  message: string;
  details: string | null;
  hint: string | null;
  code: string | null;
};

interface SupabaseArrayResult<T = unknown> {
  data: T[] | null;
  error: SupabaseStyleError | null;
  count: number | null;
  status: number;
  statusText: string;
}

interface SupabaseSingleResult<T = unknown> {
  data: T | null;
  error: SupabaseStyleError | null;
  count: number | null;
  status: number;
  statusText: string;
}

function toSupabaseError(error: DatabaseError | null): SupabaseStyleError | null {
  if (!error) return null;
  return {
    message: error.message,
    details: error.details ?? null,
    hint: error.hint ?? null,
    code: error.code ?? null,
  };
}

function toArrayResult<T>(result: DatabaseResult<T[]>): SupabaseArrayResult<T> {
  const supabaseError = toSupabaseError(result.error);
  const values = result.data ?? null;
  const count = Array.isArray(values) ? values.length : null;
  return {
    data: values,
    error: supabaseError,
    count,
    status: supabaseError ? 400 : 200,
    statusText: supabaseError ? "error" : "ok",
  };
}

function toSingleResult<T>(result: DatabaseResult<T | null>): SupabaseSingleResult<T> {
  const supabaseError = toSupabaseError(result.error);
  const value = result.data ?? null;
  return {
    data: value,
    error: supabaseError,
    count: value === null ? 0 : 1,
    status: supabaseError ? 400 : 200,
    statusText: supabaseError ? "error" : "ok",
  };
}

class SupabaseQueryShim<T = unknown> {
  constructor(private readonly builder: DatabaseQueryBuilder<T>) {}

  private wrap<TResult>(builder: DatabaseQueryBuilder<TResult>): SupabaseQueryShim<TResult> {
    return new SupabaseQueryShim<TResult>(builder);
  }

  private toArrayPromise(): Promise<SupabaseArrayResult<T>> {
    return this.builder.fetch().then((result) => toArrayResult(result));
  }

  select<TResult = T>(columns?: string): SupabaseQueryShim<TResult> {
    return this.wrap(this.builder.select<TResult>(columns ?? "*"));
  }

  eq(column: string, value: unknown): SupabaseQueryShim<T> {
    return this.wrap(this.builder.eq(column, value));
  }

  neq(column: string, value: unknown): SupabaseQueryShim<T> {
    return this.wrap(this.builder.neq(column, value));
  }

  gt(column: string, value: unknown): SupabaseQueryShim<T> {
    return this.wrap(this.builder.gt(column, value));
  }

  gte(column: string, value: unknown): SupabaseQueryShim<T> {
    return this.wrap(this.builder.gte(column, value));
  }

  lt(column: string, value: unknown): SupabaseQueryShim<T> {
    return this.wrap(this.builder.lt(column, value));
  }

  lte(column: string, value: unknown): SupabaseQueryShim<T> {
    return this.wrap(this.builder.lte(column, value));
  }

  is(column: string, value: unknown): SupabaseQueryShim<T> {
    return this.wrap(this.builder.is(column, value));
  }

  like(column: string, value: string): SupabaseQueryShim<T> {
    return this.wrap(this.builder.like(column, value));
  }

  ilike(column: string, value: string): SupabaseQueryShim<T> {
    return this.wrap(this.builder.ilike(column, value));
  }

  filter(column: string, operator: string, value: unknown): SupabaseQueryShim<T> {
    return this.wrap(this.builder.filter(column, operator, value));
  }

  in(column: string, values: readonly unknown[]): SupabaseQueryShim<T> {
    return this.wrap(this.builder.in(column, values));
  }

  contains(
    column: string,
    value: unknown,
    options?: Record<string, unknown>,
  ): SupabaseQueryShim<T> {
    return this.wrap(this.builder.contains(column, value, options));
  }

  or(filter: string, options?: { foreignTable?: string }): SupabaseQueryShim<T> {
    return this.wrap(this.builder.or(filter, options));
  }

  order(
    column: string,
    options?: { ascending?: boolean; nullsFirst?: boolean },
  ): SupabaseQueryShim<T> {
    return this.wrap(this.builder.order(column, options));
  }

  limit(count: number): SupabaseQueryShim<T> {
    return this.wrap(this.builder.limit(count));
  }

  range(from: number, to: number): SupabaseQueryShim<T> {
    return this.wrap(this.builder.range(from, to));
  }

  then<TResult1 = SupabaseArrayResult<T>, TResult2 = never>(
    onfulfilled?:
      | ((value: SupabaseArrayResult<T>) => TResult1 | PromiseLike<TResult1>)
      | undefined
      | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | undefined | null,
  ) {
    return this.toArrayPromise().then(onfulfilled, onrejected);
  }

  catch<TResult = never>(
    onrejected?: ((reason: unknown) => TResult | PromiseLike<TResult>) | undefined | null,
  ) {
    return this.toArrayPromise().catch(onrejected);
  }

  finally(onfinally?: (() => void) | undefined | null) {
    return this.toArrayPromise().finally(onfinally);
  }

  single(): Promise<SupabaseSingleResult<T>> {
    return this.builder.single().then((result) => toSingleResult(result));
  }

  maybeSingle(): Promise<SupabaseSingleResult<T>> {
    return this.builder.maybeSingle().then((result) => toSingleResult(result));
  }

  fetch(): Promise<DatabaseResult<T[]>> {
    return this.builder.fetch();
  }
}

class SupabaseTableShim {
  constructor(private readonly table: DatabaseTableBuilder) {}

  select<T = unknown>(columns?: string): SupabaseQueryShim<T> {
    return new SupabaseQueryShim<T>(this.table.select<T>(columns ?? "*"));
  }

  insert<T = unknown>(
    values: Record<string, unknown> | Array<Record<string, unknown>>,
    options?: Record<string, unknown>,
  ): SupabaseQueryShim<T> {
    return new SupabaseQueryShim<T>(this.table.insert<T>(values, options));
  }

  update<T = unknown>(values: Record<string, unknown>): SupabaseQueryShim<T> {
    return new SupabaseQueryShim<T>(this.table.update<T>(values));
  }

  upsert<T = unknown>(
    values: Record<string, unknown> | Array<Record<string, unknown>>,
    options?: Record<string, unknown>,
  ): SupabaseQueryShim<T> {
    return new SupabaseQueryShim<T>(this.table.upsert<T>(values, options));
  }

  delete<T = unknown>(options?: Record<string, unknown>): SupabaseQueryShim<T> {
    return new SupabaseQueryShim<T>(this.table.delete<T>(options));
  }
}

class SupabaseClientShim {
  constructor(
    private readonly dbClient: DatabaseClient,
    private readonly storageClient: SupabaseClient,
  ) {}

  get storage() {
    return this.storageClient.storage;
  }

  from(table: string): SupabaseTableShim {
    return new SupabaseTableShim(this.dbClient.from(table));
  }

  async rpc(fn: string, params?: Record<string, unknown>) {
    const result = await this.dbClient.rpc(fn, params);
    return toSingleResult(result);
  }
}

let cachedClient: SupabaseClientShim | null = null;

export function getSupabaseAdminClient() {
  if (!cachedClient) {
    const storageClient = createClient(
      serverEnv.SUPABASE_URL,
      serverEnv.SUPABASE_SERVICE_ROLE_KEY,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      },
    );
    cachedClient = new SupabaseClientShim(getDatabaseAdminClient(), storageClient);
  }
  return cachedClient;
}
