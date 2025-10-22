-- Mux streaming foundation: live streams, sessions, assets, webhooks, AI jobs

create table if not exists public.mux_live_streams (
  id uuid primary key default gen_random_uuid(),
  capsule_id uuid not null references public.capsules(id) on delete cascade,
  owner_user_id uuid not null references public.users(id) on delete cascade,
  mux_live_stream_id text not null unique,
  status text not null default 'idle',
  latency_mode text,
  is_low_latency boolean default true,
  reconnect_window_seconds integer,
  stream_key text not null,
  stream_key_backup text,
  ingest_url text,
  ingest_url_backup text,
  playback_id text,
  playback_url text,
  playback_policy text,
  active_asset_id text,
  recent_error text,
  metadata jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_seen_at timestamptz,
  last_active_at timestamptz,
  last_idle_at timestamptz,
  last_error_at timestamptz
);

create unique index if not exists idx_mux_live_streams_capsule
  on public.mux_live_streams(capsule_id);

create index if not exists idx_mux_live_streams_owner
  on public.mux_live_streams(owner_user_id);

create table if not exists public.mux_live_stream_sessions (
  id uuid primary key default gen_random_uuid(),
  live_stream_id uuid not null references public.mux_live_streams(id) on delete cascade,
  capsule_id uuid not null references public.capsules(id) on delete cascade,
  mux_live_stream_id text not null,
  mux_session_id text,
  mux_asset_id text,
  status text not null default 'initialized',
  started_at timestamptz,
  ended_at timestamptz,
  duration_seconds numeric,
  error_code text,
  error_message text,
  metadata jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_mux_live_stream_sessions_stream
  on public.mux_live_stream_sessions(live_stream_id);

create index if not exists idx_mux_live_stream_sessions_capsule
  on public.mux_live_stream_sessions(capsule_id);

create table if not exists public.mux_assets (
  id uuid primary key default gen_random_uuid(),
  live_stream_id uuid references public.mux_live_streams(id) on delete set null,
  capsule_id uuid not null references public.capsules(id) on delete cascade,
  mux_asset_id text not null unique,
  mux_live_stream_id text,
  status text not null default 'created',
  playback_id text,
  playback_url text,
  playback_policy text,
  duration_seconds numeric,
  aspect_ratio text,
  max_frame_rate numeric,
  resolution text,
  preview_image_url text,
  thumbnail_url text,
  storyboard_url text,
  media_json jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  ready_at timestamptz,
  errored_at timestamptz
);

create index if not exists idx_mux_assets_stream
  on public.mux_assets(live_stream_id);

create index if not exists idx_mux_assets_capsule
  on public.mux_assets(capsule_id);

create table if not exists public.mux_webhook_events (
  id uuid primary key default gen_random_uuid(),
  event_id text unique,
  event_type text not null,
  mux_object_type text,
  mux_object_id text,
  attempt integer,
  status text,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  data jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_mux_webhook_events_type
  on public.mux_webhook_events(event_type);

create index if not exists idx_mux_webhook_events_object
  on public.mux_webhook_events(mux_object_id);

create table if not exists public.mux_ai_jobs (
  id uuid primary key default gen_random_uuid(),
  capsule_id uuid not null references public.capsules(id) on delete cascade,
  live_stream_id uuid references public.mux_live_streams(id) on delete set null,
  asset_id uuid references public.mux_assets(id) on delete set null,
  job_type text not null,
  status text not null default 'pending',
  priority integer not null default 0,
  payload jsonb,
  result jsonb,
  error_message text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_mux_ai_jobs_capsule
  on public.mux_ai_jobs(capsule_id);

create index if not exists idx_mux_ai_jobs_stream
  on public.mux_ai_jobs(live_stream_id);

create index if not exists idx_mux_ai_jobs_asset
  on public.mux_ai_jobs(asset_id);

create index if not exists idx_mux_ai_jobs_status
  on public.mux_ai_jobs(status);

do $$
begin
  begin
    create trigger trg_mux_live_streams_updated_at
      before update on public.mux_live_streams
      for each row execute function public.set_updated_at();
  exception when duplicate_object then null; end;
end $$;

do $$
begin
  begin
    create trigger trg_mux_live_stream_sessions_updated_at
      before update on public.mux_live_stream_sessions
      for each row execute function public.set_updated_at();
  exception when duplicate_object then null; end;
end $$;

do $$
begin
  begin
    create trigger trg_mux_assets_updated_at
      before update on public.mux_assets
      for each row execute function public.set_updated_at();
  exception when duplicate_object then null; end;
end $$;

do $$
begin
  begin
    create trigger trg_mux_ai_jobs_updated_at
      before update on public.mux_ai_jobs
      for each row execute function public.set_updated_at();
  exception when duplicate_object then null; end;
end $$;

alter table public.mux_live_streams enable row level security;
alter table public.mux_live_stream_sessions enable row level security;
alter table public.mux_assets enable row level security;
alter table public.mux_webhook_events enable row level security;
alter table public.mux_ai_jobs enable row level security;

do $$ begin
  begin
    create policy "Service role full access mux_live_streams"
      on public.mux_live_streams
      to service_role
      using (true)
      with check (true);
  exception when others then null; end;
end $$;

do $$ begin
  begin
    create policy "Service role full access mux_live_stream_sessions"
      on public.mux_live_stream_sessions
      to service_role
      using (true)
      with check (true);
  exception when others then null; end;
end $$;

do $$ begin
  begin
    create policy "Service role full access mux_assets"
      on public.mux_assets
      to service_role
      using (true)
      with check (true);
  exception when others then null; end;
end $$;

do $$ begin
  begin
    create policy "Service role full access mux_webhook_events"
      on public.mux_webhook_events
      to service_role
      using (true)
      with check (true);
  exception when others then null; end;
end $$;

do $$ begin
  begin
    create policy "Service role full access mux_ai_jobs"
      on public.mux_ai_jobs
      to service_role
      using (true)
      with check (true);
  exception when others then null; end;
end $$;

do $$ begin
  begin
    create policy "Capsule owners read mux_live_streams"
      on public.mux_live_streams
      for select
      to authenticated
      using (auth.uid() = owner_user_id)
      with check (auth.uid() = owner_user_id);
  exception when others then null; end;
end $$;

do $$ begin
  begin
    create policy "Capsule owners read mux_live_stream_sessions"
      on public.mux_live_stream_sessions
      for select
      to authenticated
      using (
        exists (
          select 1
          from public.mux_live_streams mls
          where mls.id = mux_live_stream_sessions.live_stream_id
            and mls.owner_user_id = auth.uid()
        )
      )
      with check (true);
  exception when others then null; end;
end $$;

do $$ begin
  begin
    create policy "Capsule owners read mux_assets"
      on public.mux_assets
      for select
      to authenticated
      using (
        exists (
          select 1
          from public.mux_live_streams mls
          where mls.id = mux_assets.live_stream_id
            and mls.owner_user_id = auth.uid()
        )
        or exists (
          select 1
          from public.capsules c
          where c.id = mux_assets.capsule_id
            and c.created_by_id = auth.uid()
        )
      )
      with check (true);
  exception when others then null; end;
end $$;

do $$ begin
  begin
    create policy "Capsule owners read mux_ai_jobs"
      on public.mux_ai_jobs
      for select
      to authenticated
      using (
        exists (
          select 1
          from public.capsules c
          where c.id = mux_ai_jobs.capsule_id
            and c.created_by_id = auth.uid()
        )
      )
      with check (true);
  exception when others then null; end;
end $$;
