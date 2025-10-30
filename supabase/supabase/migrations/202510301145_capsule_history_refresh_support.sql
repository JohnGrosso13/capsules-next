alter table if exists public.capsule_history_snapshots
  add column if not exists period_hashes jsonb not null default '{}'::jsonb;

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
    s.generated_at,
    s.latest_post_at,
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
      or (activity.latest_post_at is not null and (s.latest_post_at is null or s.latest_post_at < activity.latest_post_at))
      or (s.generated_at is null or s.generated_at < now() - coalesce(stale_after, interval '6 hours'))
    )
  order by coalesce(s.generated_at, to_timestamp(0)) asc
  limit greatest(1, coalesce(limit_count, 24));
$$;

