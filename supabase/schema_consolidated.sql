-- Consolidated schema snapshot (generated)
-- Source: supabase/migrations/*.sql
-- Generated at: 2025-09-28T02:59:02.121Z
-- Note: This file is for bootstrapping dev databases from scratch.
--       It concatenates ordered migrations and relies on IF NOT EXISTS guards.


-- ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::
-- BEGIN MIGRATION: 0001_initial.sql
-- ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::

-- 0001_initial.sql: Base schema for Capsules platform
-- Generated to replace ad-hoc schema dumps with ordered migrations.

-- Extensions
create extension if not exists pgcrypto;
create extension if not exists citext;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'post_kind') then
    create type public.post_kind as enum ('text','image','video','link','poll','system');
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'member_role') then
    create type public.member_role as enum ('owner','admin','moderator','member','guest');
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'friend_request_status') then
    create type public.friend_request_status as enum ('pending','accepted','declined','cancelled');
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'capsule_member_request_status') then
    create type public.capsule_member_request_status as enum ('pending','approved','declined','cancelled');
  end if;
end $$;

-- Core identity tables
create table if not exists public.users (
  id uuid primary key default gen_random_uuid(),
  user_key text not null unique,
  provider text not null default 'guest' check (provider in ('guest','clerk','email','other')),
  clerk_id text unique,
  email citext unique,
  full_name text,
  avatar_url text,
  bio text,
  last_seen_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint users_user_key_not_blank check (length(btrim(user_key)) > 0)
);

create table if not exists public.capsules (
  id uuid primary key default gen_random_uuid(),
  slug text unique,
  name text not null,
  description text,
  banner_url text,
  logo_url text,
  created_by_id uuid not null references public.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.capsule_members (
  capsule_id uuid not null references public.capsules(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  role public.member_role not null default 'member',
  joined_at timestamptz not null default now(),
  primary key (capsule_id, user_id)
);

create index if not exists idx_capsule_members_user on public.capsule_members(user_id);
create index if not exists idx_capsule_members_capsule on public.capsule_members(capsule_id);

create table if not exists public.capsule_member_requests (
  id uuid primary key default gen_random_uuid(),
  capsule_id uuid not null references public.capsules(id) on delete cascade,
  requester_id uuid not null references public.users(id) on delete cascade,
  status public.capsule_member_request_status not null default 'pending',
  role public.member_role not null default 'member',
  message text,
  responded_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  approved_at timestamptz,
  declined_at timestamptz,
  cancelled_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint capsule_member_requests_unique_requester unique (capsule_id, requester_id)
);

create index if not exists idx_capsule_member_requests_capsule
  on public.capsule_member_requests(capsule_id);

create index if not exists idx_capsule_member_requests_requester
  on public.capsule_member_requests(requester_id);

create index if not exists idx_capsule_member_requests_status_pending
  on public.capsule_member_requests(status)
  where status = 'pending';

-- Content tables
create table if not exists public.posts (
  id uuid primary key default gen_random_uuid(),
  client_id text unique,
  capsule_id uuid references public.capsules(id) on delete cascade,
  kind public.post_kind not null default 'text',
  content text not null default '',
  media_url text,
  media_prompt text,
  user_name text,
  user_avatar text,
  tags text[] default array[]::text[],
  visibility text default 'public',
  author_user_id uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  source text default 'web'
);

alter table public.posts add column if not exists visibility text default 'public';
alter table public.posts add column if not exists deleted_at timestamptz;

create index if not exists idx_posts_capsule on public.posts(capsule_id) where deleted_at is null;
create index if not exists idx_posts_author on public.posts(author_user_id) where deleted_at is null;
create index if not exists idx_posts_created_at on public.posts(created_at desc);

create table if not exists public.comments (
  id uuid primary key default gen_random_uuid(),
  client_id text unique,
  post_id uuid not null references public.posts(id) on delete cascade,
  capsule_id uuid references public.capsules(id) on delete cascade,
  content text not null,
  user_id uuid references public.users(id) on delete set null,
  user_name text,
  user_avatar text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  source text default 'web'
);

alter table public.comments add column if not exists deleted_at timestamptz;

create index if not exists idx_comments_post on public.comments(post_id) where deleted_at is null;
create index if not exists idx_comments_capsule on public.comments(capsule_id) where deleted_at is null;

create table if not exists public.post_likes (
  post_id uuid not null references public.posts(id) on delete cascade,
  user_id uuid references public.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);

-- Social graph tables
create table if not exists public.friend_requests (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references public.users(id) on delete cascade,
  recipient_id uuid not null references public.users(id) on delete cascade,
  status public.friend_request_status not null default 'pending',
  message text,
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  accepted_at timestamptz,
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint friend_requests_not_self check (requester_id <> recipient_id)
);

alter table public.friend_requests add column if not exists deleted_at timestamptz;

create table if not exists public.friendships (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  friend_user_id uuid not null references public.users(id) on delete cascade,
  request_id uuid references public.friend_requests(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint friendships_not_self check (user_id <> friend_user_id)
);

alter table public.friendships add column if not exists deleted_at timestamptz;

create table if not exists public.user_follows (
  id uuid primary key default gen_random_uuid(),
  follower_user_id uuid not null references public.users(id) on delete cascade,
  followee_user_id uuid not null references public.users(id) on delete cascade,
  muted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint user_follows_not_self check (follower_user_id <> followee_user_id)
);

alter table public.user_follows add column if not exists deleted_at timestamptz;

create table if not exists public.user_blocks (
  id uuid primary key default gen_random_uuid(),
  blocker_user_id uuid not null references public.users(id) on delete cascade,
  blocked_user_id uuid not null references public.users(id) on delete cascade,
  reason text,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint user_blocks_not_self check (blocker_user_id <> blocked_user_id)
);

alter table public.user_blocks add column if not exists deleted_at timestamptz;

create unique index if not exists uniq_friend_requests_active
  on public.friend_requests(requester_id, recipient_id)
  where deleted_at is null and status = 'pending';
create index if not exists idx_friend_requests_recipient
  on public.friend_requests(recipient_id)
  where deleted_at is null;
create index if not exists idx_friend_requests_requester
  on public.friend_requests(requester_id)
  where deleted_at is null;

create unique index if not exists uniq_friendships_active
  on public.friendships(user_id, friend_user_id)
  where deleted_at is null;
create index if not exists idx_friendships_user
  on public.friendships(user_id)
  where deleted_at is null;
create index if not exists idx_friendships_friend
  on public.friendships(friend_user_id)
  where deleted_at is null;

create unique index if not exists uniq_user_follows_active
  on public.user_follows(follower_user_id, followee_user_id)
  where deleted_at is null;
create index if not exists idx_user_follows_followee
  on public.user_follows(followee_user_id)
  where deleted_at is null;
create index if not exists idx_user_follows_follower
  on public.user_follows(follower_user_id)
  where deleted_at is null;

create unique index if not exists uniq_user_blocks_active
  on public.user_blocks(blocker_user_id, blocked_user_id)
  where deleted_at is null;
create index if not exists idx_user_blocks_blocker
  on public.user_blocks(blocker_user_id)
  where deleted_at is null;
create index if not exists idx_user_blocks_blocked
  on public.user_blocks(blocked_user_id)
  where deleted_at is null;

-- Subscriber + confirmation tables
create table if not exists public.subscribers (
  id uuid default gen_random_uuid() primary key,
  email varchar(255) unique not null,
  source varchar(100) default 'landing-page',
  status varchar(50) default 'active',
  confirmed boolean default false,
  confirmed_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_subscribers_email on public.subscribers(email);
create index if not exists idx_subscribers_created_at on public.subscribers(created_at);

create table if not exists public.email_confirmations (
  id uuid default gen_random_uuid() primary key,
  subscriber_id uuid references public.subscribers(id) on delete cascade,
  email varchar(255) not null,
  token_hash text not null,
  status varchar(20) default 'pending',
  sent_at timestamptz default now(),
  expires_at timestamptz not null,
  confirmed_at timestamptz,
  ip text,
  user_agent text,
  source varchar(100)
);

-- Optional social integrations
create table if not exists public.social_links (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references public.users(id) on delete cascade,
  provider text not null check (char_length(provider) between 2 and 40),
  remote_user_id text,
  remote_username text,
  access_token text,
  refresh_token text,
  expires_at timestamptz,
  scope text,
  meta jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_user_id, provider)
);

create index if not exists idx_social_links_owner on public.social_links(owner_user_id);
create index if not exists idx_social_links_provider on public.social_links(provider);

create table if not exists public.publish_jobs (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references public.users(id) on delete cascade,
  post_client_id text,
  provider text not null,
  payload jsonb not null,
  status text not null default 'queued',
  remote_id text,
  remote_url text,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_publish_jobs_user on public.publish_jobs(owner_user_id);
create index if not exists idx_publish_jobs_status on public.publish_jobs(status);

-- Row level security policies for service role automation
alter table public.capsule_member_requests enable row level security;
alter table public.friend_requests enable row level security;
alter table public.friendships enable row level security;
alter table public.user_follows enable row level security;
alter table public.user_blocks enable row level security;
alter table public.social_links enable row level security;
alter table public.publish_jobs enable row level security;

do $$ begin
  begin
    create policy "Service role full access capsule_member_requests"
      on public.capsule_member_requests
      to service_role
      using (true)
      with check (true);
  exception when others then null; end;
end $$;

do $$ begin
  begin
    create policy "Service role full access friend_requests"
      on public.friend_requests
      to service_role
      using (true)
      with check (true);
  exception when others then null; end;
end $$;

do $$ begin
  begin
    create policy "Service role full access friendships"
      on public.friendships
      to service_role
      using (true)
      with check (true);
  exception when others then null; end;
end $$;

do $$ begin
  begin
    create policy "Service role full access user_follows"
      on public.user_follows
      to service_role
      using (true)
      with check (true);
  exception when others then null; end;
end $$;

do $$ begin
  begin
    create policy "Service role full access user_blocks"
      on public.user_blocks
      to service_role
      using (true)
      with check (true);
  exception when others then null; end;
end $$;

do $$ begin
  begin
    create policy "Service role full access social"
      on public.social_links
      to service_role
      using (true)
      with check (true);
  exception when others then null; end;
end $$;

do $$ begin
  begin
    create policy "Service role full access publish_jobs"
      on public.publish_jobs
      to service_role
      using (true)
      with check (true);
  exception when others then null; end;
end $$;

-- Updated_at trigger helper
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

create or replace function public.set_created_at()
returns trigger language plpgsql as $$
begin
  if new.created_at is null then
    new.created_at = now();
  end if;
  return new;
end $$;

-- Attach triggers
do $$
begin
  begin
    create trigger trg_users_updated_at
      before update on public.users
      for each row execute function public.set_updated_at();
  exception when duplicate_object then null;
  end;
end $$;

do $$
begin
  begin
    create trigger trg_capsules_updated_at
      before update on public.capsules
      for each row execute function public.set_updated_at();
  exception when duplicate_object then null;
  end;
end $$;

do $$
begin
  begin
    create trigger trg_posts_updated_at
      before update on public.posts
      for each row execute function public.set_updated_at();
  exception when duplicate_object then null;
  end;
end $$;

do $$
begin
  begin
    create trigger trg_comments_updated_at
      before update on public.comments
      for each row execute function public.set_updated_at();
  exception when duplicate_object then null;
  end;
end $$;

do $$
begin
  begin
    create trigger trg_subscribers_updated_at
      before update on public.subscribers
      for each row execute function public.set_updated_at();
  exception when duplicate_object then null;
  end;
end $$;

do $$
begin
  begin
    create trigger trg_capsule_member_requests_updated_at
      before update on public.capsule_member_requests
      for each row execute function public.set_updated_at();
  exception when duplicate_object then null;
  end;
end $$;

do $$
begin
  begin
    create trigger trg_friend_requests_updated_at
      before update on public.friend_requests
      for each row execute function public.set_updated_at();
  exception when duplicate_object then null;
  end;
end $$;

do $$
begin
  begin
    create trigger trg_friendships_updated_at
      before update on public.friendships
      for each row execute function public.set_updated_at();
  exception when duplicate_object then null;
  end;
end $$;

do $$
begin
  begin
    create trigger trg_user_follows_updated_at
      before update on public.user_follows
      for each row execute function public.set_updated_at();
  exception when duplicate_object then null;
  end;
end $$;

do $$
begin
  begin
    create trigger trg_user_blocks_updated_at
      before update on public.user_blocks
      for each row execute function public.set_updated_at();
  exception when duplicate_object then null;
  end;
end $$;

drop view if exists public.posts_ranked_global;
drop function if exists public.rank_posts(uuid, uuid, text[], integer, integer);
drop view if exists public.posts_view;

-- Materialized views & ranking helpers
create or replace view public.posts_view as
select
  p.id,
  p.client_id,
  p.capsule_id,
  p.kind,
  p.visibility,
  p.content,
  p.media_url,
  p.media_prompt,
  p.user_name,
  p.user_avatar,
  p.tags,
  p.created_at,
  p.updated_at,
  p.deleted_at,
  p.source,
  p.author_user_id,
  (select count(*) from public.post_likes pl where pl.post_id = p.id) as likes_count,
  (select count(*) from public.comments c where c.post_id = p.id and c.deleted_at is null) as comments_count,
  coalesce((select 1.0 * count(*) from public.post_likes pl where pl.post_id = p.id and pl.created_at > now() - interval '72 hours'), 0) * 0.4
  + coalesce((select 1.0 * count(*) from public.comments c where c.post_id = p.id and c.created_at > now() - interval '72 hours'), 0) * 0.6
    as hot_score
from public.posts p;

create or replace function public.rank_posts(
  p_viewer_id uuid,
  p_capsule_id uuid,
  p_tags text[],
  p_limit integer default 60,
  p_offset integer default 0
) returns setof public.posts_view language plpgsql as $$
begin
  return query
  with affinity as (
    select
      f.friend_user_id as author_id,
      count(*)::double precision as viewer_like_count
    from public.friendships f
    where f.user_id = p_viewer_id
      and f.deleted_at is null
    group by f.friend_user_id
  ), affinity_comments as (
    select
      c.user_id as author_id,
      count(*)::double precision as viewer_comment_count
    from public.comments c
    where p_viewer_id is not null
      and c.user_id = p_viewer_id
      and c.created_at > now() - interval '90 days'
    group by c.user_id
  ), base as (
    select pv.*, a.viewer_like_count, ac.viewer_comment_count
    from public.posts_view pv
    left join affinity a on a.author_id = pv.author_user_id
    left join affinity_comments ac on ac.author_id = pv.author_user_id
    where pv.deleted_at is null
      and (p_capsule_id is null or pv.capsule_id = p_capsule_id)
  )
  select * from base
  order by
    coalesce(
      0.35 * (1.0 / pow(greatest(extract(epoch from (now() - created_at)) / 3600.0, 0.0) + 2.0, 1.25))
      + 0.30 * least(1.0, coalesce(hot_score, 0.0) * 10.0)
      + 0.25 * coalesce(
          least(
            1.0,
            ln(1 + greatest(coalesce(viewer_like_count, 0) + 0.5 * coalesce(viewer_comment_count, 0), 0)) / ln(10)
          ),
          0.0
        )
      + 0.10 * (
          case when p_capsule_id is not null and capsule_id = p_capsule_id then 0.7 else 0.0 end
          + case when p_tags is not null and array_length(p_tags, 1) is not null then
              least(0.3,
                0.3 * coalesce((
                  select count(*)::double precision
                  from unnest(tags) t join unnest(p_tags) pt on pt = t
                ), 0.0) / 3.0
              )
            else 0.0 end
        ),
      0.0
    ) desc,
    created_at desc
  limit greatest(1, coalesce(p_limit, 60))
  offset greatest(0, coalesce(p_offset, 0));
end;
$$;

create or replace view public.posts_ranked_global as
  select * from public.rank_posts(null, null, null, 200, 0);

-- Helpful indexes for user lookup
create index if not exists users_user_key_idx on public.users(user_key);
create index if not exists users_email_idx on public.users(email);
create index if not exists capsules_owner_idx on public.capsules(created_by_id);

-- ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::
-- END MIGRATION: 0001_initial.sql
-- ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::


-- ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::
-- BEGIN MIGRATION: 0002_analytics.sql
-- ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::

-- Authoritative analytics snapshot objects
create schema if not exists analytics;

create materialized view if not exists analytics.overview as
select
  (select count(*) from public.users) as total_users,
  (select count(*) from public.users where last_seen_at >= now() - interval '30 days') as active_users_30d,
  (select count(*) from public.users where last_seen_at >= now() - interval '7 days') as active_users_7d,
  (select count(*) from public.capsules) as capsules_created,
  (select count(*) from public.posts where created_at >= now() - interval '24 hours') as posts_created_24h,
  (select count(*) from public.friendships where deleted_at is null) as friend_edges,
  now() as last_calculated;

create table if not exists analytics.daily_active_users (
  date date primary key,
  active_count integer not null default 0,
  calculated_at timestamptz not null default now()
);

create table if not exists analytics.daily_posts (
  date date primary key,
  posts_count integer not null default 0,
  calculated_at timestamptz not null default now()
);

create or replace view analytics.daily_active_users_view as
select * from analytics.daily_active_users order by date asc;

create or replace view analytics.daily_posts_view as
select * from analytics.daily_posts order by date asc;

create or replace function analytics.refresh_overview()
returns void language plpgsql as $$
begin
  refresh materialized view analytics.overview;
end;
$$;

create or replace function analytics.refresh_daily_active_users()
returns void language plpgsql as $$
begin
  insert into analytics.daily_active_users(date, active_count, calculated_at)
  select current_date, count(*)::int, now()
  from public.users
  where last_seen_at >= current_date;
end;
$$;

create or replace function analytics.refresh_daily_posts()
returns void language plpgsql as $$
begin
  insert into analytics.daily_posts(date, posts_count, calculated_at)
  select current_date, count(*)::int, now()
  from public.posts
  where created_at >= current_date;
end;
$$;

create or replace function analytics_overview_snapshot()
returns table (
  total_users integer,
  active_users_30d integer,
  active_users_7d integer,
  capsules_created integer,
  posts_created_24h integer,
  friend_edges integer,
  last_calculated timestamptz
)
language sql as $$
  select
    total_users,
    active_users_30d,
    active_users_7d,
    capsules_created,
    posts_created_24h,
    friend_edges,
    last_calculated
  from analytics.overview
  limit 1;
$$;

create or replace view analytics_daily_active_users as
select date, active_count from analytics.daily_active_users_view;

create or replace view analytics_daily_posts as
select date, posts_count from analytics.daily_posts_view;

-- ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::
-- END MIGRATION: 0002_analytics.sql
-- ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::


-- ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::
-- BEGIN MIGRATION: 0003_memories.sql
-- ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::

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

-- ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::
-- END MIGRATION: 0003_memories.sql
-- ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::


-- ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::
-- BEGIN MIGRATION: 0004_memories_allow_theme.sql
-- ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::

-- 0004_memories_allow_theme.sql: allow theme entries in memories
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'memories'
  ) THEN
    BEGIN
      ALTER TABLE public.memories DROP CONSTRAINT IF EXISTS memories_kind_check;
      ALTER TABLE public.memories
        ADD CONSTRAINT memories_kind_check
        CHECK (kind IN ('upload', 'generated', 'post', 'theme'));
    EXCEPTION
      WHEN undefined_table THEN NULL;
    END;
  END IF;
END;
$$;

-- ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::
-- END MIGRATION: 0004_memories_allow_theme.sql
-- ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::


-- ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::
-- BEGIN MIGRATION: 0005_memories_vector_3072.sql
-- ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::

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

-- ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::
-- END MIGRATION: 0005_memories_vector_3072.sql
-- ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::


-- ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::
-- BEGIN MIGRATION: 0006_memories_allow_theme_and_video.sql
-- ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::

-- 0006_memories_allow_theme_and_video.sql: restore theme entries after vector upgrade
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'memories'
  ) THEN
    BEGIN
      ALTER TABLE public.memories DROP CONSTRAINT IF EXISTS memories_kind_check;
      ALTER TABLE public.memories
        ADD CONSTRAINT memories_kind_check
        CHECK (kind IN ('upload', 'generated', 'post', 'video', 'theme'));
    EXCEPTION
      WHEN undefined_table THEN NULL;
    END;
  END IF;
END;
$$;

-- ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::
-- END MIGRATION: 0006_memories_allow_theme_and_video.sql
-- ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::


-- ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::
-- BEGIN MIGRATION: 0007_memories_post_memory_indexes.sql
-- ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::

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

-- ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::
-- END MIGRATION: 0007_memories_post_memory_indexes.sql
-- ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::

--
-- Name: media_upload_sessions; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.media_upload_sessions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    owner_user_id uuid NOT NULL,
    upload_id text NOT NULL,
    r2_key text NOT NULL,
    r2_bucket text NOT NULL,
    absolute_url text,
    content_type text,
    content_length bigint,
    part_size bigint,
    total_parts integer,
    checksum text,
    metadata jsonb,
    derived_assets jsonb,
    parts jsonb,
    status text DEFAULT 'initialized'::text NOT NULL,
    client_ip text,
    turnstile_action text,
    turnstile_cdata text,
    memory_id uuid,
    error_reason text,
    created_at timestamptz DEFAULT now() NOT NULL,
    updated_at timestamptz DEFAULT now() NOT NULL,
    uploaded_at timestamptz,
    completed_at timestamptz
);

ALTER TABLE ONLY public.media_upload_sessions
    ADD CONSTRAINT media_upload_sessions_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.media_upload_sessions
    ADD CONSTRAINT media_upload_sessions_owner_fkey FOREIGN KEY (owner_user_id) REFERENCES public.users(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.media_upload_sessions
    ADD CONSTRAINT media_upload_sessions_memory_fkey FOREIGN KEY (memory_id) REFERENCES public.memories(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.media_upload_sessions
    ADD CONSTRAINT media_upload_sessions_status_check CHECK (status = ANY (ARRAY['initialized'::text, 'uploading'::text, 'uploaded'::text, 'processing'::text, 'completed'::text, 'failed'::text]));

CREATE INDEX idx_media_upload_sessions_owner_created ON public.media_upload_sessions USING btree (owner_user_id, created_at DESC);

CREATE UNIQUE INDEX idx_media_upload_sessions_upload_id ON public.media_upload_sessions USING btree (upload_id);

CREATE INDEX idx_media_upload_sessions_status ON public.media_upload_sessions USING btree (status);
do $$
begin
  create trigger trg_media_upload_sessions_updated_at
    before update on public.media_upload_sessions
    for each row execute function public.set_updated_at();
exception when duplicate_object then null;
end $$;
ALTER TABLE public.media_upload_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY media_upload_sessions_service ON public.media_upload_sessions
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

CREATE POLICY media_upload_sessions_owner_read ON public.media_upload_sessions
    FOR SELECT
    USING (auth.uid() = owner_user_id);

-- artifacts core tables
create table if not exists public.artifact_artifacts (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references public.users(id) on delete cascade,
  artifact_type text not null,
  status text not null default 'draft' check (status in ('draft', 'published', 'archived')),
  title text not null,
  description text,
  version integer not null default 1,
  metadata jsonb not null default '{}'::jsonb,
  blocks jsonb not null default '[]'::jsonb,
  context jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  committed_at timestamptz
);

create index if not exists idx_artifact_owner_updated
  on public.artifact_artifacts(owner_user_id, updated_at desc);

create index if not exists idx_artifact_type_status
  on public.artifact_artifacts(artifact_type, status);

create table if not exists public.artifact_assets (
  id uuid primary key default gen_random_uuid(),
  artifact_id uuid not null references public.artifact_artifacts(id) on delete cascade,
  block_id text not null,
  slot_id text not null,
  r2_bucket text not null,
  r2_key text not null,
  content_type text,
  descriptor jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists idx_artifact_assets_slot
  on public.artifact_assets(artifact_id, block_id, slot_id);

create table if not exists public.artifact_events (
  id uuid primary key default gen_random_uuid(),
  artifact_id uuid not null references public.artifact_artifacts(id) on delete cascade,
  event_type text not null,
  origin text not null default 'system',
  payload jsonb not null default '{}'::jsonb,
  emitted_at timestamptz not null default now()
);

create index if not exists idx_artifact_events_artifact
  on public.artifact_events(artifact_id, emitted_at desc);

create trigger trg_artifact_artifacts_updated_at
  before update on public.artifact_artifacts
  for each row execute function public.set_updated_at();

create trigger trg_artifact_assets_updated_at
  before update on public.artifact_assets
  for each row execute function public.set_updated_at();

alter table public.artifact_artifacts enable row level security;
alter table public.artifact_assets enable row level security;
alter table public.artifact_events enable row level security;
do $$ begin
  create policy "Artifact service access" on public.artifact_artifacts
    to service_role using (true) with check (true);
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "Artifact owner read" on public.artifact_artifacts
    for select using (auth.uid() = owner_user_id);
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "Artifact owner modify" on public.artifact_artifacts
    for all using (auth.uid() = owner_user_id) with check (auth.uid() = owner_user_id);
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "Artifact assets service" on public.artifact_assets
    to service_role using (true) with check (true);
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "Artifact assets owner" on public.artifact_assets
    for all using (
      exists (
        select 1 from public.artifact_artifacts a
        where a.id = artifact_id and a.owner_user_id = auth.uid()
      )
    ) with check (
      exists (
        select 1 from public.artifact_artifacts a
        where a.id = artifact_id and a.owner_user_id = auth.uid()
      )
    );
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "Artifact events service" on public.artifact_events
    to service_role using (true) with check (true);
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "Artifact events owner read" on public.artifact_events
    for select using (
      exists (
        select 1 from public.artifact_artifacts a
        where a.id = artifact_id and a.owner_user_id = auth.uid()
      )
    );
exception when duplicate_object then null; end $$;
