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
