create or replace function public.poll_vote_counts(post_ids uuid[])
returns table (post_id uuid, option_index integer, vote_count bigint)
language sql
as $$
  select
    pv.post_id,
    pv.option_index,
    count(*)::bigint as vote_count
  from public.poll_votes pv
  where pv.post_id = any(post_ids)
  group by pv.post_id, pv.option_index
  order by pv.post_id, pv.option_index;
$$;
