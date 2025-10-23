-- Phase 4: Memories audit trails and document versioning support
-- 1. Extend media_upload_sessions with audit columns
alter table if exists public.media_upload_sessions
  add column if not exists uploaded_by uuid references public.users(id) on delete set null;

alter table if exists public.media_upload_sessions
  add column if not exists last_accessed_by uuid references public.users(id) on delete set null;

alter table if exists public.media_upload_sessions
  add column if not exists last_accessed_at timestamptz;

alter table if exists public.media_upload_sessions
  add column if not exists access_count bigint not null default 0;

update public.media_upload_sessions
  set uploaded_by = owner_user_id
  where uploaded_by is null;

create index if not exists idx_media_upload_sessions_uploaded_by
  on public.media_upload_sessions(uploaded_by);

create index if not exists idx_media_upload_sessions_last_accessed
  on public.media_upload_sessions(last_accessed_at desc nulls last);

-- 2. Extend memories with audit + versioning columns
alter table if exists public.memories
  add column if not exists uploaded_by uuid references public.users(id) on delete set null;

alter table if exists public.memories
  add column if not exists last_viewed_by uuid references public.users(id) on delete set null;

alter table if exists public.memories
  add column if not exists last_viewed_at timestamptz;

alter table if exists public.memories
  add column if not exists view_count bigint not null default 0;

alter table if exists public.memories
  add column if not exists version_group_id uuid;

alter table if exists public.memories
  add column if not exists version_of uuid references public.memories(id) on delete set null;

alter table if exists public.memories
  add column if not exists version_index integer;

alter table if exists public.memories
  add column if not exists is_latest boolean not null default true;

update public.memories
  set uploaded_by = owner_user_id
  where uploaded_by is null;

update public.memories
  set version_group_id = id
  where version_group_id is null;

update public.memories
  set version_index = 1
  where version_index is null;

update public.memories
  set is_latest = true
  where is_latest is null;

alter table if exists public.memories
  alter column version_group_id set not null;

alter table if exists public.memories
  alter column version_index set not null;

alter table if exists public.memories
  alter column version_group_id set default gen_random_uuid();

alter table if exists public.memories
  alter column version_index set default 1;

create index if not exists idx_memories_uploaded_by
  on public.memories(uploaded_by);

create index if not exists idx_memories_last_viewed
  on public.memories(last_viewed_at desc nulls last);

create index if not exists idx_memories_version_group
  on public.memories(version_group_id, version_index desc);

create index if not exists idx_memories_is_latest
  on public.memories(id)
  where is_latest is true;

-- 3. Helper RPCs for atomic audit updates
create or replace function public.mark_memory_view(p_memory_id uuid, p_viewer_id uuid)
returns void
language sql
security definer
as $$
  update public.memories
  set
    last_viewed_by = p_viewer_id,
    last_viewed_at = now(),
    view_count = coalesce(view_count, 0) + 1
  where id = p_memory_id;
$$;

grant execute on function public.mark_memory_view(uuid, uuid) to service_role;

create or replace function public.mark_upload_session_access(p_session_id uuid, p_user_id uuid)
returns void
language sql
security definer
as $$
  update public.media_upload_sessions
  set
    last_accessed_by = p_user_id,
    last_accessed_at = now(),
    access_count = coalesce(access_count, 0) + 1
  where id = p_session_id;
$$;

grant execute on function public.mark_upload_session_access(uuid, uuid) to service_role;
