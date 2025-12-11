-- Security Advisor hardening
-- Address errors about security definer views and tables without RLS in public schema.

-- 1) Make frequently used views run as invoker so they honor underlying RLS.
alter view if exists public.posts_view set (security_invoker = true);
alter view if exists public.posts_ranked_global set (security_invoker = true);
alter view if exists public.poll_vote_counts set (security_invoker = true);
alter view if exists public.analytics_daily_active_users set (security_invoker = true);
alter view if exists public.analytics_daily_posts set (security_invoker = true);

-- Helper block creator to avoid duplicate policy errors.
create or replace function public.__ensure_policy(name text, ddl text) returns void
language plpgsql
as $$
begin
  execute ddl;
exception
  when duplicate_object then
    null;
end;
$$;

-- 2) Core identity tables
alter table if exists public.users enable row level security;
select public.__ensure_policy('users_service_all', $ddl$
  create policy "Users service role full" on public.users
    for all to service_role using (true) with check (true);
$ddl$);
select public.__ensure_policy('users_self_read', $ddl$
  create policy "Users self read" on public.users
    for select to authenticated using (id = auth.uid());
$ddl$);
select public.__ensure_policy('users_self_write', $ddl$
  create policy "Users self write" on public.users
    for update to authenticated
    using (id = auth.uid())
    with check (id = auth.uid());
$ddl$);

-- 3) Capsules and membership
alter table if exists public.capsules enable row level security;
select public.__ensure_policy('capsules_service_all', $ddl$
  create policy "Capsules service role full" on public.capsules
    for all to service_role using (true) with check (true);
$ddl$);
select public.__ensure_policy('capsules_member_read', $ddl$
  create policy "Capsules member/readable" on public.capsules
    for select to authenticated
    using (
      membership_policy = 'open'
      or created_by_id = auth.uid()
      or exists (
        select 1
        from public.capsule_members cm
        where cm.capsule_id = capsules.id
          and cm.user_id = auth.uid()
      )
    );
$ddl$);
select public.__ensure_policy('capsules_creator_write', $ddl$
  create policy "Capsules creator manage" on public.capsules
    for all to authenticated
    using (created_by_id = auth.uid())
    with check (created_by_id = auth.uid());
$ddl$);

alter table if exists public.capsule_members enable row level security;
select public.__ensure_policy('capsule_members_service_all', $ddl$
  create policy "Capsule members service role full" on public.capsule_members
    for all to service_role using (true) with check (true);
$ddl$);
select public.__ensure_policy('capsule_members_member_read', $ddl$
  create policy "Capsule members member read" on public.capsule_members
    for select to authenticated
    using (
      exists (
        select 1
        from public.capsule_members cm2
        where cm2.capsule_id = capsule_members.capsule_id
          and cm2.user_id = auth.uid()
      )
    );
$ddl$);
select public.__ensure_policy('capsule_members_self_insert', $ddl$
  create policy "Capsule members self insert" on public.capsule_members
    for insert to authenticated
    with check (user_id = auth.uid());
$ddl$);
select public.__ensure_policy('capsule_members_self_delete', $ddl$
  create policy "Capsule members self delete" on public.capsule_members
    for delete to authenticated
    using (user_id = auth.uid());
$ddl$);

-- 4) Posts and interactions
alter table if exists public.posts enable row level security;
select public.__ensure_policy('posts_service_all', $ddl$
  create policy "Posts service role full" on public.posts
    for all to service_role using (true) with check (true);
$ddl$);
select public.__ensure_policy('posts_public_read', $ddl$
  create policy "Posts public readable" on public.posts
    for select using (visibility = 'public' and deleted_at is null);
$ddl$);
select public.__ensure_policy('posts_member_read', $ddl$
  create policy "Posts capsule member readable" on public.posts
    for select to authenticated
    using (
      deleted_at is null and (
        visibility = 'public'
        or exists (
          select 1
          from public.capsule_members cm
          where cm.capsule_id = posts.capsule_id
            and cm.user_id = auth.uid()
        )
        or author_user_id = auth.uid()
      )
    );
$ddl$);
select public.__ensure_policy('posts_author_write', $ddl$
  create policy "Posts author manage" on public.posts
    for insert to authenticated
    with check (author_user_id = auth.uid());
$ddl$);
select public.__ensure_policy('posts_author_update', $ddl$
  create policy "Posts author update" on public.posts
    for update to authenticated
    using (author_user_id = auth.uid())
    with check (author_user_id = auth.uid());
$ddl$);
select public.__ensure_policy('posts_author_delete', $ddl$
  create policy "Posts author delete" on public.posts
    for delete to authenticated
    using (author_user_id = auth.uid());
$ddl$);

alter table if exists public.comments enable row level security;
select public.__ensure_policy('comments_service_all', $ddl$
  create policy "Comments service role full" on public.comments
    for all to service_role using (true) with check (true);
$ddl$);
select public.__ensure_policy('comments_read', $ddl$
  create policy "Comments readable with post visibility" on public.comments
    for select using (
      exists (
        select 1
        from public.posts p
        where p.id = comments.post_id
          and p.deleted_at is null
          and (
            p.visibility = 'public'
            or p.author_user_id = auth.uid()
            or exists (
              select 1
              from public.capsule_members cm
              where cm.capsule_id = p.capsule_id
                and cm.user_id = auth.uid()
            )
          )
      )
    );
$ddl$);
select public.__ensure_policy('comments_author_write', $ddl$
  create policy "Comments author manage" on public.comments
    for all to authenticated
    using (user_id = auth.uid())
    with check (user_id = auth.uid());
$ddl$);

alter table if exists public.post_likes enable row level security;
select public.__ensure_policy('post_likes_service_all', $ddl$
  create policy "Post likes service role full" on public.post_likes
    for all to service_role using (true) with check (true);
$ddl$);
select public.__ensure_policy('post_likes_read', $ddl$
  create policy "Post likes readable with post visibility" on public.post_likes
    for select using (
      exists (
        select 1
        from public.posts p
        where p.id = post_likes.post_id
          and p.deleted_at is null
          and (
            p.visibility = 'public'
            or p.author_user_id = auth.uid()
            or exists (
              select 1
              from public.capsule_members cm
              where cm.capsule_id = p.capsule_id
                and cm.user_id = auth.uid()
            )
          )
      )
    );
$ddl$);
select public.__ensure_policy('post_likes_owner_write', $ddl$
  create policy "Post likes owner manage" on public.post_likes
    for all to authenticated
    using (user_id = auth.uid())
    with check (user_id = auth.uid());
$ddl$);

-- 5) Capsule style personas
alter table if exists public.capsule_style_personas enable row level security;
select public.__ensure_policy('csp_service_all', $ddl$
  create policy "Capsule style personas service role full" on public.capsule_style_personas
    for all to service_role using (true) with check (true);
$ddl$);
select public.__ensure_policy('csp_owner_read', $ddl$
  create policy "Capsule style personas owner/read" on public.capsule_style_personas
    for select to authenticated
    using (
      owner_user_id = auth.uid()
      or (
        capsule_id is not null and exists (
          select 1
          from public.capsule_members cm
          where cm.capsule_id = capsule_style_personas.capsule_id
            and cm.user_id = auth.uid()
        )
      )
    );
$ddl$);
select public.__ensure_policy('csp_owner_write', $ddl$
  create policy "Capsule style personas owner manage" on public.capsule_style_personas
    for all to authenticated
    using (owner_user_id = auth.uid())
    with check (owner_user_id = auth.uid());
$ddl$);

-- 6) AI run tables
alter table if exists public.ai_image_runs enable row level security;
select public.__ensure_policy('ai_image_runs_service_all', $ddl$
  create policy "AI image runs service role full" on public.ai_image_runs
    for all to service_role using (true) with check (true);
$ddl$);
select public.__ensure_policy('ai_image_runs_owner_read', $ddl$
  create policy "AI image runs owner read" on public.ai_image_runs
    for select to authenticated using (owner_user_id = auth.uid());
$ddl$);
select public.__ensure_policy('ai_image_runs_owner_write', $ddl$
  create policy "AI image runs owner write" on public.ai_image_runs
    for all to authenticated
    using (owner_user_id = auth.uid())
    with check (owner_user_id = auth.uid());
$ddl$);

alter table if exists public.ai_image_variants enable row level security;
select public.__ensure_policy('ai_image_variants_service_all', $ddl$
  create policy "AI image variants service role full" on public.ai_image_variants
    for all to service_role using (true) with check (true);
$ddl$);
select public.__ensure_policy('ai_image_variants_owner_read', $ddl$
  create policy "AI image variants owner read" on public.ai_image_variants
    for select to authenticated using (owner_user_id = auth.uid());
$ddl$);
select public.__ensure_policy('ai_image_variants_owner_write', $ddl$
  create policy "AI image variants owner write" on public.ai_image_variants
    for all to authenticated
    using (owner_user_id = auth.uid())
    with check (owner_user_id = auth.uid());
$ddl$);

alter table if exists public.ai_video_runs enable row level security;
select public.__ensure_policy('ai_video_runs_service_all', $ddl$
  create policy "AI video runs service role full" on public.ai_video_runs
    for all to service_role using (true) with check (true);
$ddl$);
select public.__ensure_policy('ai_video_runs_owner_read', $ddl$
  create policy "AI video runs owner read" on public.ai_video_runs
    for select to authenticated using (owner_user_id = auth.uid());
$ddl$);
select public.__ensure_policy('ai_video_runs_owner_write', $ddl$
  create policy "AI video runs owner write" on public.ai_video_runs
    for all to authenticated
    using (owner_user_id = auth.uid())
    with check (owner_user_id = auth.uid());
$ddl$);

-- 7) Capsule history/topic tables (default to service role only; adjust if client access is needed)
alter table if exists public.capsule_history_snapshots enable row level security;
alter table if exists public.capsule_history_section_settings enable row level security;
alter table if exists public.capsule_history_edits enable row level security;
alter table if exists public.capsule_history_pins enable row level security;
alter table if exists public.capsule_history_exclusions enable row level security;
alter table if exists public.capsule_topic_pages enable row level security;
alter table if exists public.capsule_topic_page_posts enable row level security;
alter table if exists public.capsule_topic_page_backlinks enable row level security;

select public.__ensure_policy('capsule_history_service_all', $ddl$
  create policy "Capsule history service role only" on public.capsule_history_snapshots
    for all to service_role using (true) with check (true);
$ddl$);
select public.__ensure_policy('capsule_history_settings_service_all', $ddl$
  create policy "Capsule history settings service role only" on public.capsule_history_section_settings
    for all to service_role using (true) with check (true);
$ddl$);
select public.__ensure_policy('capsule_history_edits_service_all', $ddl$
  create policy "Capsule history edits service role only" on public.capsule_history_edits
    for all to service_role using (true) with check (true);
$ddl$);
select public.__ensure_policy('capsule_history_pins_service_all', $ddl$
  create policy "Capsule history pins service role only" on public.capsule_history_pins
    for all to service_role using (true) with check (true);
$ddl$);
select public.__ensure_policy('capsule_history_exclusions_service_all', $ddl$
  create policy "Capsule history exclusions service role only" on public.capsule_history_exclusions
    for all to service_role using (true) with check (true);
$ddl$);

select public.__ensure_policy('capsule_topic_pages_service_all', $ddl$
  create policy "Capsule topic pages service role full" on public.capsule_topic_pages
    for all to service_role using (true) with check (true);
$ddl$);
select public.__ensure_policy('capsule_topic_pages_member_read', $ddl$
  create policy "Capsule topic pages member read" on public.capsule_topic_pages
    for select to authenticated
    using (
      exists (
        select 1
        from public.capsules c
        where c.id = capsule_topic_pages.capsule_id
          and (
            c.membership_policy = 'open'
            or c.created_by_id = auth.uid()
            or exists (
              select 1
              from public.capsule_members cm
              where cm.capsule_id = c.id
                and cm.user_id = auth.uid()
            )
          )
      )
    );
$ddl$);
select public.__ensure_policy('capsule_topic_pages_creator_write', $ddl$
  create policy "Capsule topic pages creator manage" on public.capsule_topic_pages
    for all to authenticated
    using (created_by = auth.uid())
    with check (created_by = auth.uid());
$ddl$);

select public.__ensure_policy('capsule_topic_page_posts_service_all', $ddl$
  create policy "Capsule topic page posts service role full" on public.capsule_topic_page_posts
    for all to service_role using (true) with check (true);
$ddl$);
select public.__ensure_policy('capsule_topic_page_posts_member_read', $ddl$
  create policy "Capsule topic page posts member read" on public.capsule_topic_page_posts
    for select to authenticated
    using (
      exists (
        select 1
        from public.capsule_members cm
        join public.capsule_topic_pages tp on tp.id = capsule_topic_page_posts.topic_page_id
        where cm.capsule_id = tp.capsule_id
          and cm.user_id = auth.uid()
      )
    );
$ddl$);

select public.__ensure_policy('capsule_topic_page_backlinks_service_all', $ddl$
  create policy "Capsule topic page backlinks service role full" on public.capsule_topic_page_backlinks
    for all to service_role using (true) with check (true);
$ddl$);
select public.__ensure_policy('capsule_topic_page_backlinks_member_read', $ddl$
  create policy "Capsule topic page backlinks member read" on public.capsule_topic_page_backlinks
    for select to authenticated
    using (
      exists (
        select 1
        from public.capsule_members cm
        where cm.capsule_id = capsule_topic_page_backlinks.capsule_id
          and cm.user_id = auth.uid()
      )
    );
$ddl$);

-- 8) Newsletter tables (lock to service role by default)
alter table if exists public.subscribers enable row level security;
alter table if exists public.email_confirmations enable row level security;
select public.__ensure_policy('subscribers_service_all', $ddl$
  create policy "Subscribers service role only" on public.subscribers
    for all to service_role using (true) with check (true);
$ddl$);
select public.__ensure_policy('email_confirmations_service_all', $ddl$
  create policy "Email confirmations service role only" on public.email_confirmations
    for all to service_role using (true) with check (true);
$ddl$);
revoke all on table public.subscribers from anon, authenticated;
revoke all on table public.email_confirmations from anon, authenticated;

-- 9) Prompter chip events (log table; restrict to service role)
alter table if exists public.prompter_chip_events enable row level security;
select public.__ensure_policy('prompter_chip_events_service_all', $ddl$
  create policy "Prompter chip events service role only" on public.prompter_chip_events
    for all to service_role using (true) with check (true);
$ddl$);
do $$
begin
  begin
    revoke all on table public.prompter_chip_events from anon, authenticated;
  exception
    when undefined_table then
      null;
  end;
end;
$$;

-- 10) Internal migrations table safeguard
alter table if exists public.__migrations enable row level security;
select public.__ensure_policy('internal_migrations_service_all', $ddl$
  create policy "Internal migrations service role only" on public.__migrations
    for all to service_role using (true) with check (true);
$ddl$);
revoke all on table public.__migrations from anon, authenticated;

-- Cleanup helper
drop function if exists public.__ensure_policy(text, text);
