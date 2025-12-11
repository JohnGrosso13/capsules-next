-- Pin search_path on functions flagged by Security Advisor
do $$
begin
  begin
    alter function public.set_current_timestamp_updated_at() set search_path = public, pg_temp;
  exception when undefined_function then null; end;

  begin
    alter function public.poll_vote_counts(uuid[]) set search_path = public, pg_temp;
  exception when undefined_function then null; end;

  begin
    alter function public.upsert_post_memory(uuid, text, text, text, text, text, uuid, jsonb) set search_path = public, pg_temp;
  exception when undefined_function then null; end;

  begin
    alter function public.analytics_overview_snapshot() set search_path = public, pg_temp;
  exception when undefined_function then null; end;

  begin
    alter function public.mark_memory_view(uuid, uuid) set search_path = public, pg_temp;
  exception when undefined_function then null; end;

  begin
    alter function public.mark_upload_session_access(uuid, uuid) set search_path = public, pg_temp;
  exception when undefined_function then null; end;

  begin
    alter function public.rank_posts(uuid, uuid, text[], integer, integer) set search_path = public, pg_temp;
  exception when undefined_function then null; end;

  begin
    alter function analytics.refresh_daily_posts() set search_path = public, pg_temp;
  exception when undefined_function then null; end;

  begin
    alter function analytics.refresh_overview() set search_path = public, pg_temp;
  exception when undefined_function then null; end;

  begin
    alter function analytics.refresh_daily_active_users() set search_path = public, pg_temp;
  exception when undefined_function then null; end;

  begin
    alter function public.update_theme_styles_updated_at() set search_path = public, pg_temp;
  exception when undefined_function then null; end;

  begin
    alter function public.set_updated_at() set search_path = public, pg_temp;
  exception when undefined_function then null; end;

  begin
    alter function public.list_capsule_history_refresh_candidates(integer, interval) set search_path = public, pg_temp;
  exception when undefined_function then null; end;

  begin
    alter function public.touch_updated_at() set search_path = public, pg_temp;
  exception when undefined_function then null; end;

  begin
    alter function public.set_created_at() set search_path = public, pg_temp;
  exception when undefined_function then null; end;
end $$;
