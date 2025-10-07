-- 0003_memories.sql: Memories table, policies, and vector search RPC
-- This migration adds the core `public.memories` table expected by the app,
-- including pgvector support, indexes, RLS policies, and a cosine search RPC.

-- Enable pgvector extension (safe if already installed)
create extension if not exists vector;

-- Create memories table to store assets and descriptions
create table if not exists public.memories (
  id uuid default gen_random_uuid() primary key,
  owner_user_id uuid references public.users(id) on delete cascade,
  kind text check (kind in ('upload','generated','post')) default 'upload',
  title text,
  description text,
  media_url text,
  media_type text,
  post_id text,
  meta jsonb,
  embedding vector(1536),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Helpful indexes
create index if not exists idx_memories_owner on public.memories(owner_user_id, created_at desc);
create index if not exists idx_memories_kind on public.memories(kind);

-- Optional vector index (IVFFLAT); requires populated embeddings and <=2000 dims
do $$
declare
  v_dims int;
begin
  select a.atttypmod - 4 into v_dims
  from pg_attribute a
  join pg_class c on c.oid = a.attrelid
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relname = 'memories'
    and a.attname = 'embedding'
    and a.attnum > 0
    and not a.attisdropped
  limit 1;

  if v_dims is null or v_dims <= 2000 then
    begin
      create index idx_memories_embedding on public.memories using ivfflat (embedding vector_cosine_ops) with (lists = 100);
    exception when duplicate_table or duplicate_object then
      null;
    end;
  else
    raise notice 'Skipping ivfflat index for memories.embedding; dimension % exceeds 2000', v_dims;
  end if;
end $$;

-- RLS policies
alter table public.memories enable row level security;
do $$ begin
  create policy "Service role full access" on public.memories to service_role using (true) with check (true);
exception when duplicate_object then null; end $$;

-- Looser read policy for authenticated users (adjust as needed)
do $$ begin
  create policy "Authenticated read own" on public.memories for select to authenticated using (true);
exception when duplicate_object then null; end $$;

-- RPC for cosine search over embeddings
create or replace function public.search_memories_cosine(
  p_owner_id uuid,
  p_query_embedding vector(1536),
  p_match_threshold float,
  p_match_count int
) returns table (
  id uuid,
  kind text,
  media_url text,
  media_type text,
  title text,
  description text,
  created_at timestamptz,
  similarity float
) as $$
  select m.id, m.kind, m.media_url, m.media_type, m.title, m.description, m.created_at,
         1 - (m.embedding <=> p_query_embedding) as similarity
  from public.memories m
  where m.owner_user_id = p_owner_id
    and m.embedding is not null
    and (1 - (m.embedding <=> p_query_embedding)) >= coalesce(p_match_threshold, 0.0)
  order by m.embedding <=> p_query_embedding
  limit least(greatest(p_match_count, 1), 200);
$$ language sql stable;

