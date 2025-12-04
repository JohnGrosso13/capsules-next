export type CacheSetOptions = {
  ex?: number;
};

export type SortedSetEntry = {
  score: number;
  member: string;
};

export interface CacheClient {
  get<T = unknown>(key: string): Promise<T | null>;
  set(key: string, value: unknown, options?: CacheSetOptions): Promise<void>;
  del(key: string): Promise<void>;
  zadd(key: string, entries: SortedSetEntry[]): Promise<number>;
  zrange(key: string, start: number, stop: number, options?: { rev?: boolean }): Promise<string[]>;
  zremrangebyscore(key: string, min: number, max: number): Promise<number>;
  zrem(key: string, members: string | string[]): Promise<number>;
}
