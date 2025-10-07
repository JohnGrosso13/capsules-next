-- 0007_memories_post_memory_indexes.sql
-- Add/verify indexes and idempotent upsert support for post save ("remember")

-- Ensure pgvector extension exists (safe no-op if already installed)
create extension if not exists vector;

-- Choose index method based on vector dimension and availability
do $$
declare
  v_dims int := null;
  v_has_hnsw boolean := false;
  v_exists boolean := false;
begin
  -- does the index already exist?
  select exists (
    select 1 from pg_indexes
    where schemaname = 'public' and indexname = 'idx_memories_embedding'
  ) into v_exists;
  if v_exists then
    return;
  end if;

  -- read declared dimension of memories.embedding (vector(n))
  select
    coalesce(
      nullif(
        regexp_replace(format_type(a.atttypid, a.atttypmod), '^vector\((\d+)\)$', '\1'),
        ''
      )::int,
      case when a.atttypmod > 0 then a.atttypmod - 4 else null end
    )
  into v_dims
  from pg_attribute a
  join pg_class c on c.oid = a.attrelid
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relname = 'memories'
    and a.attname = 'embedding'
    and a.attnum > 0
    and not a.attisdropped
  limit 1;

  -- check if HNSW access method is available (pgvector >= 0.7)
  select exists (select 1 from pg_am where amname = 'hnsw') into v_has_hnsw;

  if v_dims is null then
    return; -- column missing; skip
  end if;

  if v_dims > 2000 then
    raise notice 'Skipping embedding index: dimension % exceeds local pgvector limit', v_dims;
    return;
  end if;

  if v_has_hnsw then
    execute 'create index idx_memories_embedding on public.memories using hnsw (embedding vector_cosine_ops)';
  else
    execute 'create index idx_memories_embedding on public.memories using ivfflat (embedding vector_cosine_ops) with (lists = 100)';
  end if;
exception when undefined_table then
  null;
end $$;

-- 2) Partial indexes around post saves (source = 'post_memory') for fast lookups
do $$
begin
  perform 1 from pg_indexes where schemaname='public' and indexname='idx_memories_post_save_lookup';
  if not found then
    create index idx_memories_post_save_lookup
      on public.memories(owner_user_id, post_id, kind)
      where (meta->>'source') = 'post_memory';
  end if;
exception when undefined_table then
  null;
end $$;

-- 3) Enforce idempotency for saves: unique per (owner, post, kind) when source='post_memory'
do $$
begin
  perform 1 from pg_indexes where schemaname='public' and indexname='uniq_memories_post_save';
  if not found then
    create unique index uniq_memories_post_save
      on public.memories(owner_user_id, post_id, kind)
      where (meta->>'source') = 'post_memory';
  end if;
exception when undefined_table then
  null;
end $$;

-- 4) Broaden kind check to optionally allow 'text' items
do $$
begin
  begin
    alter table public.memories drop constraint if exists memories_kind_check;
  exception when undefined_table then
    null;
  end;
  begin
    alter table public.memories
      add constraint memories_kind_check
      check (kind in ('upload','generated','post','video','theme','text'));
  exception when undefined_table then
    null;
  end;
end $$;

-- 5) RPC to upsert a saved post (source='post_memory') using partial unique index
--    Accepts optional embedding as float4[] and casts to vector(3072) when provided
create or replace function public.upsert_post_memory(
  p_owner_user_id uuid,
  p_post_id text,
  p_kind text default 'post',
  p_title text default null,
  p_description text default null,
  p_media_url text default null,
  p_media_type text default null,
  p_meta jsonb default jsonb_build_object('source','post_memory'),
  p_embedding float4[] default null
) returns void as $$
begin
  insert into public.memories (
    owner_user_id,
    kind,
    title,
    description,
    media_url,
    media_type,
    post_id,
    meta,
    embedding
  ) values (
    p_owner_user_id,
    coalesce(p_kind, 'post'),
    p_title,
    p_description,
    p_media_url,
    p_media_type,
    p_post_id,
    coalesce(p_meta, jsonb_build_object('source','post_memory')),
    case when p_embedding is null then null else (p_embedding::vector(3072)) end
  )
  on conflict (owner_user_id, post_id, kind)
    where ((memories.meta->>'source') = 'post_memory')
  do update set
    title = excluded.title,
    description = excluded.description,
    media_url = excluded.media_url,
    media_type = excluded.media_type,
    meta = excluded.meta,
    embedding = coalesce(excluded.embedding, memories.embedding),
    updated_at = now();
end;
$$ language plpgsql security definer;

-- Optional: analyze to prime planner post-index creation
analyze public.memories;

