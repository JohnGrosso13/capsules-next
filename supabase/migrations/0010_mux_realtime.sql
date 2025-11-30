-- Ensure mux_* tables and streaming settings participate in realtime publications.

do $$ begin
  begin
    create publication supabase_realtime;
  exception when others then null; end;
end $$;

do $$ begin
  begin
    alter publication supabase_realtime add table public.mux_live_streams;
  exception when others then null; end;
end $$;

do $$ begin
  begin
    alter publication supabase_realtime add table public.mux_live_stream_sessions;
  exception when others then null; end;
end $$;

do $$ begin
  begin
    alter publication supabase_realtime add table public.mux_assets;
  exception when others then null; end;
end $$;

do $$ begin
  begin
    alter publication supabase_realtime add table public.mux_ai_jobs;
  exception when others then null; end;
end $$;

do $$ begin
  begin
    alter publication supabase_realtime add table public.capsule_stream_settings;
  exception when others then null; end;
end $$;
