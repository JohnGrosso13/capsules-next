export type SearchIndexRecord = {
  id: string;
  ownerId: string;
  ownerType?: "user" | "capsule" | null;
  title?: string | null;
  description?: string | null;
  kind?: string | null;
  mediaUrl?: string | null;
  createdAt?: string | null;
  tags?: string[] | null;
  facets?: Record<string, string | number | boolean | null | undefined> | null;
  extra?: Record<string, unknown> | null;
};

export type SearchIndexQuery = {
  ownerId: string;
  ownerType?: "user" | "capsule" | null;
  text: string;
  limit: number;
  filters?: {
    kinds?: string[];
    since?: string | null;
    until?: string | null;
    tags?: string[];
  } | null;
};

export type SearchIndexMatch = {
  id: string;
  score: number;
  highlight?: string | null;
  record?: SearchIndexRecord;
};

export interface SearchIndex {
  upsert(records: SearchIndexRecord[]): Promise<void>;
  delete(ids: string[]): Promise<void>;
  search(query: SearchIndexQuery): Promise<SearchIndexMatch[]>;
}
