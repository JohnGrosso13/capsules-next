create table if not exists ai_image_runs (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid null,
  capsule_id uuid null,
  mode text not null check (mode in ('generate', 'edit')),
  asset_kind text not null,
  user_prompt text not null,
  resolved_prompt text not null,
  style_preset text null,
  provider text not null default 'openai',
  model text null,
  options jsonb not null default '{}'::jsonb,
  retry_count integer not null default 0,
  status text not null default 'pending' check (status in ('pending', 'running', 'succeeded', 'failed')),
  error_code text null,
  error_message text null,
  error_meta jsonb,
  image_url text null,
  response_metadata jsonb,
  attempts jsonb not null default '[]'::jsonb,
  started_at timestamptz not null default now(),
  completed_at timestamptz null
);

create index if not exists idx_ai_image_runs_owner on ai_image_runs(owner_user_id);
create index if not exists idx_ai_image_runs_capsule on ai_image_runs(capsule_id);
create index if not exists idx_ai_image_runs_started_at on ai_image_runs(started_at desc);
