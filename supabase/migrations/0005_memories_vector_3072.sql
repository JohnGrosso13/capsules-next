-- 0005_memories_vector_3072.sql: expand memory embeddings to 3,072 dimensions
-- Switches pgvector column and search RPC to the larger dimension returned by
-- OpenAI text-embedding-3-large and broadens the kind constraint to include videos.

-- Drop legacy IVFFLAT index (max dimension 2000) before switching to 3072.
drop index if exists idx_memories_embedding;

alter table public.memories
  drop constraint if exists memories_kind_check;

alter table public.memories
  alter column embedding type vector(3072) using NULL::vector(3072);

alter table public.memories
  alter column kind drop default;

-- Normalize existing rows so the new check constraint can be applied safely
update public.memories set kind = lower(kind) where kind is not null;
update public.memories set kind = 'upload' where kind is null or kind not in ('upload','generated','post','video');

alter table public.memories
  add constraint memories_kind_check check (kind in ('upload','generated','post','video'));

alter table public.memories
  alter column kind set default 'upload';

create or replace function public.search_memories_cosine(
  p_owner_id uuid,
  p_query_embedding vector(3072),
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
