-- START FRESH (aligned with current app usage)
begin;

-- Extensions
create extension if not exists pgcrypto; -- gen_random_uuid()
create extension if not exists citext;   -- case-insensitive emails

-- Drop old objects (safe to re-run)
drop table if exists public.post_likes cascade;
drop table if exists public.comments cascade;
drop table if exists public.posts cascade;
drop table if exists public.capsule_members cascade;
drop table if exists public.capsules cascade;
drop table if exists public.friends cascade;
drop table if exists public.users cascade;
drop table if exists public.subscribers cascade;
drop table if exists public.email_confirmations cascade;

-- Types (kept for forward compatibility)
drop type if exists public.post_kind cascade;
create type public.post_kind as enum ('text','image','video','link','poll','system');

drop type if exists public.post_visibility cascade;
create type public.post_visibility as enum ('public','unlisted','private');

drop type if exists public.member_role cascade;
create type public.member_role as enum ('owner','admin','moderator','member','guest');

-- Users (not directly used by current server endpoints, kept for future)
create table public.users (
  id uuid primary key default gen_random_uuid(),
  user_key text not null unique, -- 'clerk:<id>' or 'guest:<key>'
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

-- Capsules (kept for future use)
create table public.capsules (
  id uuid primary key default gen_random_uuid(),
  slug text unique, -- optional human handle
  name text not null,
  description text,
  banner_url text,
  logo_url text,
  created_by_id uuid not null references public.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Capsule membership (many-to-many with roles)
create table public.capsule_members (
  capsule_id uuid not null references public.capsules(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  role public.member_role not null default 'member',
  joined_at timestamptz not null default now(),
  primary key (capsule_id, user_id)
);

-- Posts (normalized IDs; client_id used for idempotency)
create table public.posts (
  id uuid primary key default gen_random_uuid(),
  client_id text unique,
  kind public.post_kind not null default 'text',
  content text not null default '',
  media_url text,
  media_prompt text,
  user_name text,
  user_avatar text,
  capsule_id text,
  tags text[] default array[]::text[],
  author_user_id uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  source text default 'web'
);

-- Comments (aligned with server expectations)
create table public.comments (
  id uuid primary key default gen_random_uuid(),
  client_id text unique,
  post_id uuid not null references public.posts(id) on delete cascade,
  content text not null,
  user_id uuid references public.users(id) on delete set null,
  user_name text,
  user_avatar text,
  capsule_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  source text default 'web'
);

-- Post likes (normalized)
create table public.post_likes (
  post_id uuid not null references public.posts(id) on delete cascade,
  user_id uuid references public.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);

-- Friends (optional; not currently used by server endpoints)
create table public.friends (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.users(id) on delete cascade,
  friend_user_id uuid not null references public.users(id) on delete cascade,
  display_name text, -- optional override for friend’s shown name
  created_at timestamptz not null default now(),
  unique (owner_id, friend_user_id)
);

-- Email subscribers (used by landing/admin flows)
create table public.subscribers (
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

create table public.email_confirmations (
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

-- Trigger: update updated_at on change
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists trg_users_updated_at on public.users;
create trigger trg_users_updated_at
before update on public.users
for each row execute function public.set_updated_at();

drop trigger if exists trg_capsules_updated_at on public.capsules;
create trigger trg_capsules_updated_at
before update on public.capsules
for each row execute function public.set_updated_at();

drop trigger if exists trg_posts_updated_at on public.posts;
create trigger trg_posts_updated_at
before update on public.posts
for each row execute function public.set_updated_at();

drop trigger if exists trg_comments_updated_at on public.comments;
create trigger trg_comments_updated_at
before update on public.comments
for each row execute function public.set_updated_at();

drop trigger if exists trg_subscribers_updated_at on public.subscribers;
create trigger trg_subscribers_updated_at
before update on public.subscribers
for each row execute function public.set_updated_at();

-- Helpful indexes
create index if not exists users_user_key_idx on public.users(user_key);
  create index if not exists users_email_idx on public.users(email);
  create index if not exists capsules_owner_idx on public.capsules(created_by_id);
  
  -- Optional ownership on posts: track author for server-side permissions
  alter table public.posts
    add column if not exists author_user_id uuid references public.users(id) on delete set null;
  create index if not exists idx_posts_author_user on public.posts(author_user_id);
create index if not exists capsules_slug_idx on public.capsules(slug);

create index if not exists posts_capsule_idx on public.posts(capsule_id);
create index if not exists posts_tags_gin on public.posts using gin (tags);
create index if not exists posts_created_idx on public.posts(created_at desc);
create index if not exists posts_not_deleted_idx on public.posts(created_at desc) where deleted_at is null;
create index if not exists likes_post_idx on public.post_likes(post_id);
create index if not exists likes_user_idx on public.post_likes(user_id);

create index if not exists comments_post_idx on public.comments(post_id);
create index if not exists comments_created_idx on public.comments(created_at);
create index if not exists comments_user_idx on public.comments(user_id);

-- RLS: enabled; server uses service_role and bypasses RLS by design.
alter table public.users enable row level security;
alter table public.capsules enable row level security;
alter table public.capsule_members enable row level security;
alter table public.posts enable row level security;
alter table public.comments enable row level security;
alter table public.post_likes enable row level security;
alter table public.friends enable row level security;
alter table public.subscribers enable row level security;
alter table public.email_confirmations enable row level security;

-- Minimal policies for tables used by app
-- Service role full access (server)
do $$ begin
  begin
    create policy "service_role_all_posts" on public.posts to service_role using (true) with check (true);
  exception when duplicate_object then null; end;
  begin
    create policy "service_role_all_comments" on public.comments to service_role using (true) with check (true);
  exception when duplicate_object then null; end;
  begin
    create policy "service_role_all_post_likes" on public.post_likes to service_role using (true) with check (true);
  exception when duplicate_object then null; end;
  begin
    create policy "service_role_all_subscribers" on public.subscribers to service_role using (true) with check (true);
  exception when duplicate_object then null; end;
  begin
    create policy "service_role_all_email_conf" on public.email_confirmations to service_role using (true) with check (true);
  exception when duplicate_object then null; end;
end $$;

-- Optional read access for authenticated clients
do $$ begin
  begin
    create policy "authenticated_read_posts" on public.posts for select to authenticated using (true);
  exception when duplicate_object then null; end;
  begin
    create policy "authenticated_read_comments" on public.comments for select to authenticated using (true);
  exception when duplicate_object then null; end;
end $$;

-- Public insert for subscribers (landing page form)
do $$ begin
  begin
    create policy "anon_insert_subscribers" on public.subscribers for insert to anon with check (true);
  exception when duplicate_object then null; end;
end $$;

commit;

-- Convenience view: posts with like count
do $$ begin
  begin
    create or replace view public.posts_view as
    with like_counts as (
      select pl.post_id, count(*)::int as likes_count
      from public.post_likes pl
      group by pl.post_id
    ),
    comment_counts as (
      select c.post_id, count(*)::int as comments_count
      from public.comments c
      group by c.post_id
    )
    select
      p.*,
      coalesce(lc.likes_count, 0) as likes_count,
      coalesce(cc.comments_count, 0) as comments_count,
      -- Hot/trending score: favors recent posts with engagement
      -- score = (likes + 1) / (hours_since + 2)^1.5
      (
        (coalesce(lc.likes_count, 0) + 1)::double precision
        /
        pow(
          greatest(extract(epoch from (now() - p.created_at)) / 3600.0, 0.0) + 2.0,
          1.5
        )
      ) as hot_score
    from public.posts p
    left join like_counts lc on lc.post_id = p.id
    left join comment_counts cc on cc.post_id = p.id;
  exception when others then null; end;
end $$;

-- Personalized ranking: mix of recency, author affinity, similarity, and popularity
do $$ begin
  begin
    create or replace function public.rank_posts(
      p_viewer_id uuid default null,
      p_capsule_id text default null,
      p_tags text[] default null,
      p_limit int default 60,
      p_offset int default 0
    ) returns table (
      id uuid,
      client_id text,
      kind public.post_kind,
      content text,
      media_url text,
      media_prompt text,
      user_name text,
      user_avatar text,
      capsule_id text,
      tags text[],
      created_at timestamptz,
      updated_at timestamptz,
      deleted_at timestamptz,
      source text,
      author_user_id uuid,
      likes_count int,
      comments_count int,
      hot_score double precision,
      rank_score double precision
    )
    language sql
    stable
    as $rank$
    with affinity as (
      select p.author_user_id as author_id, count(*)::int as viewer_like_count
      from public.post_likes pl
      join public.posts p on p.id = pl.post_id
      where p_viewer_id is not null
        and pl.user_id = p_viewer_id
        and p.author_user_id is not null
        and p.created_at > now() - interval '180 days'
      group by p.author_user_id
      ),
      affinity_comments as (
        select p.author_user_id as author_id, count(*)::int as viewer_comment_count
        from public.comments c
        join public.posts p on p.id = c.post_id
        where p_viewer_id is not null
          and c.user_id = p_viewer_id
          and p.author_user_id is not null
          and c.created_at > now() - interval '180 days'
        group by p.author_user_id
      ),
      base as (
        select pv.*, a.viewer_like_count, ac.viewer_comment_count
        from public.posts_view pv
        left join affinity a on a.author_id = pv.author_user_id
        left join affinity_comments ac on ac.author_id = pv.author_user_id
        where pv.deleted_at is null
          and (p_capsule_id is null or pv.capsule_id = p_capsule_id)
      )
      select
        b.id,
        b.client_id,
        b.kind,
        b.content,
        b.media_url,
        b.media_prompt,
        b.user_name,
        b.user_avatar,
        b.capsule_id,
        b.tags,
        b.created_at,
        b.updated_at,
        b.deleted_at,
        b.source,
        b.author_user_id,
        b.likes_count,
        b.comments_count,
        b.hot_score,
        -- Components
        (
          -- Recency (0..~0.5+): newer = higher
          0.35 * (1.0 / pow(greatest(extract(epoch from (now() - b.created_at)) / 3600.0, 0.0) + 2.0, 1.25))
          +
          -- Popularity (scaled hot_score)
          0.30 * least(1.0, coalesce(b.hot_score, 0.0) * 10.0)
          +
          -- Author affinity (viewer engagement: likes + 0.5 * comments in recent window)
          0.25 * coalesce(
            least(
              1.0,
              ln(1 + greatest(coalesce(b.viewer_like_count,0) + 0.5 * coalesce(b.viewer_comment_count,0), 0)) / ln(10)
            ),
            0.0
          )
          +
          -- Similarity: same capsule and overlapping tags (if preferences provided)
          0.10 * (
            case when p_capsule_id is not null and b.capsule_id = p_capsule_id then 0.7 else 0.0 end
            + case when p_tags is not null and array_length(p_tags,1) is not null then
                least(0.3,
                  0.3 * coalesce((
                    select count(*)::double precision
                    from unnest(b.tags) t join unnest(p_tags) pt on pt = t
                  ), 0.0) / 3.0
                )
              else 0.0 end
          )
        )
        *
        -- Quality filter: boost if meaningful content/media
        (case when (coalesce(length(btrim(b.content)),0) >= 35 or b.media_url is not null) then 1.0 else 0.7 end)
        as rank_score
      from base b
      order by rank_score desc, b.created_at desc
      limit greatest(1, coalesce(p_limit, 60)) offset greatest(0, coalesce(p_offset, 0));
    $rank$;
  exception when others then null; end;
end $$;

-- Convenience global ranked view (non-personalized)
do $$ begin
  begin
    create or replace view public.posts_ranked_global as
      select * from public.rank_posts(null, null, null, 200, 0);
  exception when others then null; end;
end $$;
-- Social account links for cross-posting
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

alter table public.social_links enable row level security;
DO $$ BEGIN
  CREATE POLICY "Service role full access social"
    ON public.social_links TO service_role USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Optional: background jobs for publishing
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
alter table public.publish_jobs enable row level security;
DO $$ BEGIN
  CREATE POLICY "Service role full access publish_jobs"
    ON public.publish_jobs TO service_role USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
