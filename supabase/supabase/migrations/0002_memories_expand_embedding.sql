-- Legacy migration retained for compatibility.
-- Prior versions expanded pgvector embeddings stored in Postgres. We now delegate
-- semantic search to Pinecone, so this migration becomes a no-op when the
-- `memories.embedding` column has already been removed.

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'memories'
      and column_name = 'embedding'
  ) then
    execute 'drop index if exists idx_memories_embedding';
  end if;
end;
$$;
