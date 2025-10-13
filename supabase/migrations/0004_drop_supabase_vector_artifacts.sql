-- Cleanup migration to ensure all legacy Supabase vector artifacts are removed.

do $cleanup$
begin
  if exists (select 1 from pg_extension where extname = 'vector') then
    execute 'drop extension vector cascade';
  end if;
exception
  when others then
    raise notice 'Failed to drop pgvector extension (may already be absent): %', sqlerrm;
end
$cleanup$;

drop table if exists public.memory_embeddings cascade;
drop table if exists public.memory_vectors cascade;

drop index if exists idx_memories_embedding;
drop index if exists idx_memories_embedding_cosine;

drop function if exists public.search_memories_cosine(uuid, vector, float, int);
drop function if exists public.search_memories_cosine(uuid, vector, double precision, integer);

-- Legacy helper that accepted an embedding argument.
drop function if exists public.upsert_post_memory(
  uuid,
  text,
  text,
  text,
  text,
  text,
  text,
  jsonb,
  float4[]
);
