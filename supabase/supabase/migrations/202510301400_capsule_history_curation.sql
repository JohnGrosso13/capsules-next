-- Capsule history curation schema upgrades

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'capsule_history_snapshots'
      and column_name = 'generated_at'
  ) and not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'capsule_history_snapshots'
      and column_name = 'suggested_generated_at'
  ) then
    execute 'alter table public.capsule_history_snapshots rename column generated_at to suggested_generated_at';
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'capsule_history_snapshots'
      and column_name = 'latest_post_at'
  ) and not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'capsule_history_snapshots'
      and column_name = 'suggested_latest_post_at'
  ) then
    execute 'alter table public.capsule_history_snapshots rename column latest_post_at to suggested_latest_post_at';
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'capsule_history_snapshots'
      and column_name = 'snapshot'
  ) and not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'capsule_history_snapshots'
      and column_name = 'suggested_snapshot'
  ) then
    execute 'alter table public.capsule_history_snapshots rename column snapshot to suggested_snapshot';
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'capsule_history_snapshots'
      and column_name = 'period_hashes'
  ) and not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'capsule_history_snapshots'
      and column_name = 'suggested_period_hashes'
  ) then
    execute 'alter table public.capsule_history_snapshots rename column period_hashes to suggested_period_hashes';
  end if;
end $$;

alter table if exists public.capsule_history_snapshots
  alter column suggested_snapshot set not null,
  alter column suggested_snapshot set default '{}'::jsonb,
  alter column suggested_period_hashes set default '{}'::jsonb,
  add column if not exists published_snapshot jsonb,
  add column if not exists published_generated_at timestamptz,
  add column if not exists published_latest_post_at timestamptz,
  add column if not exists published_period_hashes jsonb not null default '{}'::jsonb,
  add column if not exists published_editor_id uuid references public.users(id) on delete set null,
  add column if not exists published_editor_reason text,
  add column if not exists prompt_memory jsonb not null default '{}'::jsonb,
  add column if not exists template_presets jsonb not null default '[]'::jsonb,
  add column if not exists coverage_meta jsonb not null default '{}'::jsonb;

create table if not exists public.capsule_history_section_settings (
  capsule_id uuid not null references public.capsules(id) on delete cascade,
  period text not null check (period in ('weekly', 'monthly', 'all_time')),
  editor_notes text null,
  excluded_post_ids jsonb not null default '[]'::jsonb,
  template_id text null,
  tone_recipe_id text null,
  prompt_overrides jsonb not null default '{}'::jsonb,
  coverage_snapshot jsonb not null default '{}'::jsonb,
  discussion_thread_id uuid null,
  metadata jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.users(id) on delete set null,
  primary key (capsule_id, period)
);

create table if not exists public.capsule_history_edits (
  id uuid primary key default gen_random_uuid(),
  capsule_id uuid not null references public.capsules(id) on delete cascade,
  period text not null check (period in ('weekly', 'monthly', 'all_time')),
  editor_id uuid not null references public.users(id) on delete cascade,
  change_type text not null default 'manual',
  reason text null,
  payload jsonb not null default '{}'::jsonb,
  snapshot jsonb,
  created_at timestamptz not null default now()
);

create index if not exists capsule_history_edits_capsule_idx
  on public.capsule_history_edits (capsule_id, period, created_at desc);

create table if not exists public.capsule_history_pins (
  id uuid primary key default gen_random_uuid(),
  capsule_id uuid not null references public.capsules(id) on delete cascade,
  period text not null check (period in ('weekly', 'monthly', 'all_time')),
  pin_type text not null check (pin_type in ('summary', 'highlight', 'timeline', 'next_focus')),
  post_id uuid references public.posts(id) on delete set null,
  quote text null,
  source jsonb not null default '{}'::jsonb,
  rank integer not null default 0,
  created_by uuid not null references public.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists capsule_history_pins_capsule_idx
  on public.capsule_history_pins (capsule_id, period, pin_type, rank);

create table if not exists public.capsule_history_exclusions (
  capsule_id uuid not null references public.capsules(id) on delete cascade,
  period text not null check (period in ('weekly', 'monthly', 'all_time')),
  post_id uuid not null references public.posts(id) on delete cascade,
  created_by uuid not null references public.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (capsule_id, period, post_id)
);

create table if not exists public.capsule_topic_pages (
  id uuid primary key default gen_random_uuid(),
  capsule_id uuid not null references public.capsules(id) on delete cascade,
  slug text not null,
  title text not null,
  description text null,
  created_by uuid not null references public.users(id) on delete cascade,
  updated_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (capsule_id, slug)
);

create table if not exists public.capsule_topic_page_posts (
  topic_page_id uuid not null references public.capsule_topic_pages(id) on delete cascade,
  post_id uuid not null references public.posts(id) on delete cascade,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (topic_page_id, post_id)
);

create table if not exists public.capsule_topic_page_backlinks (
  id uuid primary key default gen_random_uuid(),
  topic_page_id uuid not null references public.capsule_topic_pages(id) on delete cascade,
  capsule_id uuid not null references public.capsules(id) on delete cascade,
  source_type text not null,
  source_id text not null,
  period text null,
  created_at timestamptz not null default now()
);

create index if not exists capsule_topic_page_backlinks_topic_idx
  on public.capsule_topic_page_backlinks (topic_page_id, created_at desc);

create or replace function public.list_capsule_history_refresh_candidates(
  limit_count integer default 24,
  stale_after interval default interval '6 hours'
)
returns table (
  capsule_id uuid,
  owner_user_id uuid,
  snapshot_generated_at timestamptz,
  snapshot_latest_post timestamptz,
  latest_post timestamptz
)
language sql
stable
as $$
  select
    c.id,
    c.created_by_id,
    s.suggested_generated_at,
    s.suggested_latest_post_at,
    activity.latest_post_at
  from public.capsules c
  left join public.capsule_history_snapshots s on s.capsule_id = c.id
  left join lateral (
    select max(created_at) as latest_post_at
    from public.posts_view pv
    where pv.capsule_id = c.id
  ) activity on true
  where c.id is not null
    and (
      s.capsule_id is null
      or (
        activity.latest_post_at is not null
        and (s.suggested_latest_post_at is null or s.suggested_latest_post_at < activity.latest_post_at)
      )
      or (
        s.suggested_generated_at is null
        or s.suggested_generated_at < now() - coalesce(stale_after, interval '6 hours')
      )
    )
  order by coalesce(s.suggested_generated_at, to_timestamp(0)) asc
  limit greatest(1, coalesce(limit_count, 24));
$$;

comment on table public.capsule_history_section_settings is
  'Per-period curation settings including editor guidance and exclusions.';

comment on table public.capsule_history_edits is
  'Audit log for capsule history curation actions with optional rollback payload.';

comment on table public.capsule_history_pins is
  'Pinned quotes and posts that must be preserved during AI rewrites.';

comment on table public.capsule_history_exclusions is
  'Posts explicitly excluded from AI consideration for a capsule period.';

comment on table public.capsule_topic_pages is
  'Evergreen wiki-style topic pages curated by capsule founders.';

comment on table public.capsule_topic_page_posts is
  'Mapping between topic pages and supporting posts for backlink coverage.';

comment on table public.capsule_topic_page_backlinks is
  'References from history sections or other sources back to topic pages.';
