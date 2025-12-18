-- Make analytics functions/views compute from live tables so the /admin
-- overview shows real data without requiring background jobs.

-- Live snapshot from base tables (users, capsules, posts, friendships).
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
language sql
as $$
  select
    (select count(*) from public.users) as total_users,
    (select count(*) from public.users where last_seen_at >= now() - interval '30 days') as active_users_30d,
    (select count(*) from public.users where last_seen_at >= now() - interval '7 days') as active_users_7d,
    (select count(*) from public.capsules) as capsules_created,
    (select count(*) from public.posts where created_at >= now() - interval '24 hours') as posts_created_24h,
    (select count(*) from public.friendships where deleted_at is null) as friend_edges,
    now() as last_calculated;
$$;

-- Live daily active users: group by last_seen_at day.
create or replace view analytics.daily_active_users_view as
select
  date_trunc('day', last_seen_at)::date as date,
  count(*)::int as active_count,
  now() as calculated_at
from public.users
where last_seen_at is not null
group by 1
order by 1 asc;

-- Live daily posts: group by created_at day.
create or replace view analytics.daily_posts_view as
select
  date_trunc('day', created_at)::date as date,
  count(*)::int as posts_count,
  now() as calculated_at
from public.posts
group by 1
order by 1 asc;

