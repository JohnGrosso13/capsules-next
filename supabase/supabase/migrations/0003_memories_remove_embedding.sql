-- Remove the Postgres-backed memory embedding column now that Pinecone handles vector search.

do $$
declare
  fn_oid oid;
begin
  select p.oid
  into fn_oid
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'search_memories_cosine';

  if fn_oid is not null then
    execute 'drop function ' || fn_oid::regprocedure;
  end if;
end;
$$;

-- Drop the previous upsert helper that accepted embeddings.
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

-- Remove the embedding column and any lingering index.
alter table public.memories drop column if exists embedding;
drop index if exists idx_memories_embedding;

-- Recreate the upsert helper without embedding support.
create or replace function public.upsert_post_memory(
  p_owner_user_id uuid,
  p_post_id text,
  p_kind text default 'post',
  p_title text default null,
  p_description text default null,
  p_media_url text default null,
  p_media_type text default null,
  p_meta jsonb default jsonb_build_object('source','post_memory')
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
    meta
  ) values (
    p_owner_user_id,
    coalesce(p_kind, 'post'),
    p_title,
    p_description,
    p_media_url,
    p_media_type,
    p_post_id,
    coalesce(p_meta, jsonb_build_object('source','post_memory'))
  )
  on conflict (owner_user_id, post_id, kind)
    where ((memories.meta->>'source') = 'post_memory')
  do update set
    title = excluded.title,
    description = excluded.description,
    media_url = excluded.media_url,
    media_type = excluded.media_type,
    meta = excluded.meta,
    updated_at = now();
end;
$$ language plpgsql security definer;
