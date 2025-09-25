-- 0001_initial.sql: Base schema for Capsules platform
-- Generated to replace ad-hoc schema dumps with ordered migrations.

-- Extensions
create extension if not exists pgcrypto;
create extension if not exists citext;

-- Enum types
create type if not exists public.post_kind as enum ('text','image','video','link','poll','system');
create type if not exists public.member_role as enum ('owner','admin','moderator','member','guest');
create type if not exists public.friend_request_status as enum ('pending','accepted','declined','cancelled');

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
  author_user_id uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  source text default 'web'
);

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
alter table public.friend_requests enable row level security;
alter table public.friendships enable row level security;
alter table public.user_follows enable row level security;
alter table public.user_blocks enable row level security;
alter table public.social_links enable row level security;
alter table public.publish_jobs enable row level security;

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
create trigger trg_users_updated_at
  before update on public.users
  for each row execute function public.set_updated_at();

create trigger trg_capsules_updated_at
  before update on public.capsules
  for each row execute function public.set_updated_at();

create trigger trg_posts_updated_at
  before update on public.posts
  for each row execute function public.set_updated_at();

create trigger trg_comments_updated_at
  before update on public.comments
  for each row execute function public.set_updated_at();

create trigger trg_subscribers_updated_at
  before update on public.subscribers
  for each row execute function public.set_updated_at();

create trigger trg_friend_requests_updated_at
  before update on public.friend_requests
  for each row execute function public.set_updated_at();

create trigger trg_friendships_updated_at
  before update on public.friendships
  for each row execute function public.set_updated_at();

create trigger trg_user_follows_updated_at
  before update on public.user_follows
  for each row execute function public.set_updated_at();

create trigger trg_user_blocks_updated_at
  before update on public.user_blocks
  for each row execute function public.set_updated_at();

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
