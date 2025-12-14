-- Track post shares and expose share_count in posts_view

create table if not exists public.post_shares (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete cascade,
  capsule_id uuid references public.capsules(id) on delete cascade,
  user_id uuid references public.users(id) on delete set null,
  channel text,
  created_at timestamptz not null default now()
);

create index if not exists idx_post_shares_post on public.post_shares(post_id);
create index if not exists idx_post_shares_user on public.post_shares(user_id);

-- Recreate posts_view to include share_count
drop view if exists public.posts_ranked_global;
drop function if exists public.rank_posts(uuid, uuid, text[], integer, integer);
drop view if exists public.posts_view;

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
  p.poll,
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
  (select count(*) from public.post_shares ps where ps.post_id = p.id) as share_count,
  coalesce(
    (select 1.0 * count(*) from public.post_likes pl where pl.post_id = p.id and pl.created_at > now() - interval '72 hours'),
    0
  ) * 0.4
  + coalesce(
      (select 1.0 * count(*) from public.comments c where c.post_id = p.id and c.created_at > now() - interval '72 hours'),
      0
    ) * 0.6
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
