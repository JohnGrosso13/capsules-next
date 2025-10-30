create table if not exists ai_video_runs (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid null,
  capsule_id uuid null,
  mode text not null check (mode in ('generate', 'edit')),
  source_url text null,
  user_prompt text not null,
  resolved_prompt text not null,
  provider text not null default 'openai',
  model text null,
  status text not null default 'pending' check (status in ('pending', 'running', 'uploading', 'succeeded', 'failed')),
  error_code text null,
  error_message text null,
  error_meta jsonb,
  options jsonb not null default '{}'::jsonb,
  response_metadata jsonb,
  video_url text null,
  thumbnail_url text null,
  mux_asset_id text null,
  mux_playback_id text null,
  mux_poster_url text null,
  duration_seconds numeric null,
  size_bytes bigint null,
  retry_count integer not null default 0,
  attempts jsonb not null default '[]'::jsonb,
  started_at timestamptz not null default now(),
  completed_at timestamptz null
);

create index if not exists idx_ai_video_runs_owner on ai_video_runs(owner_user_id);
create index if not exists idx_ai_video_runs_capsule on ai_video_runs(capsule_id);
create index if not exists idx_ai_video_runs_started_at on ai_video_runs(started_at desc);
