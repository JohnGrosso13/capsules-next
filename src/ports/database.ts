export type DatabaseError = {
  message: string;
  details?: string | null;
  hint?: string | null;
  code?: string | null;
};

export type DatabaseResult<T> = {
  data: T | null;
  error: DatabaseError | null;
  count?: number | null;
};

export interface DatabaseQueryBuilder<T = unknown> {
  select<TResult = T>(columns?: string, options?: Record<string, unknown>): DatabaseQueryBuilder<TResult>;
  eq(column: string, value: unknown): DatabaseQueryBuilder<T>;
  neq(column: string, value: unknown): DatabaseQueryBuilder<T>;
  gt(column: string, value: unknown): DatabaseQueryBuilder<T>;
  gte(column: string, value: unknown): DatabaseQueryBuilder<T>;
  lt(column: string, value: unknown): DatabaseQueryBuilder<T>;
  lte(column: string, value: unknown): DatabaseQueryBuilder<T>;
  is(column: string, value: unknown): DatabaseQueryBuilder<T>;
  like(column: string, value: string): DatabaseQueryBuilder<T>;
  ilike(column: string, value: string): DatabaseQueryBuilder<T>;
  in(column: string, values: readonly unknown[]): DatabaseQueryBuilder<T>;
  contains(
    column: string,
    value: unknown,
    options?: Record<string, unknown>,
  ): DatabaseQueryBuilder<T>;
  in(column: string, values: readonly unknown[]): DatabaseQueryBuilder<T>;
  filter(column: string, operator: string, value: unknown): DatabaseQueryBuilder<T>;
  or(filters: string, options?: { foreignTable?: string }): DatabaseQueryBuilder<T>;
  order(
    column: string,
    options?: {
      ascending?: boolean;
      nullsFirst?: boolean;
    },
  ): DatabaseQueryBuilder<T>;
  limit(count: number): DatabaseQueryBuilder<T>;
  range(from: number, to: number): DatabaseQueryBuilder<T>;
  fetch(): Promise<DatabaseResult<T[]>>;
  maybeSingle(): Promise<DatabaseResult<T | null>>;
  single(): Promise<DatabaseResult<T>>;
}

export interface DatabaseTableBuilder {
  select<T = unknown>(columns?: string, options?: Record<string, unknown>): DatabaseQueryBuilder<T>;
  insert<T = unknown>(
    values: Record<string, unknown> | Array<Record<string, unknown>>,
    options?: Record<string, unknown>,
  ): DatabaseQueryBuilder<T>;
  update<T = unknown>(values: Record<string, unknown>): DatabaseQueryBuilder<T>;
  upsert<T = unknown>(
    values: Record<string, unknown> | Array<Record<string, unknown>>,
    options?: Record<string, unknown>,
  ): DatabaseQueryBuilder<T>;
  delete<T = unknown>(options?: Record<string, unknown>): DatabaseQueryBuilder<T>;
}

export interface DatabaseClient {
  from(table: string): DatabaseTableBuilder;
  rpc<T = unknown>(fn: string, params?: Record<string, unknown>): Promise<DatabaseResult<T>>;
}

export interface DatabaseAdapter {
  getAdminClient(): DatabaseClient;
  getVendor(): string;
}
