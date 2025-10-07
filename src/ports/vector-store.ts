export type VectorRecord<TMeta extends object = Record<string, unknown>> = {
  id: string;
  values: number[];
  metadata?: TMeta;
};

export type VectorMatch<TMeta extends object = Record<string, unknown>> = {
  id: string;
  score: number;
  metadata?: TMeta;
};

export type VectorQuery<TMeta extends object = Record<string, unknown>> = {
  vector: number[];
  topK: number;
  filter?: Partial<TMeta>;
};

export interface VectorStore<TMeta extends object = Record<string, unknown>> {
  upsert(records: VectorRecord<TMeta>[]): Promise<void>;
  query(params: VectorQuery<TMeta>): Promise<VectorMatch<TMeta>[]>;
  delete(ids: string[]): Promise<void>;
}
