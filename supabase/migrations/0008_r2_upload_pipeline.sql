-- 0008_r2_upload_pipeline.sql: Cloudflare R2 direct upload sessions
create table if not exists public.media_upload_sessions (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references public.users(id) on delete cascade,
  upload_id text not null,
  r2_key text not null,
  r2_bucket text not null,
  absolute_url text,
  content_type text,
  content_length bigint,
  part_size bigint,
  total_parts integer,
  checksum text,
  metadata jsonb,
  derived_assets jsonb,
  parts jsonb,
  status text not null default 'initialized' check (status in (
    'initialized',
    'uploading',
    'uploaded',
    'processing',
    'completed',
    'failed'
  )),
  client_ip text,
  turnstile_action text,
  turnstile_cdata text,
  memory_id uuid references public.memories(id) on delete set null,
  error_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  uploaded_at timestamptz,
  completed_at timestamptz
);

create index if not exists idx_media_upload_sessions_owner_created
  on public.media_upload_sessions(owner_user_id, created_at desc);

create index if not exists idx_media_upload_sessions_status
  on public.media_upload_sessions(status);

create unique index if not exists idx_media_upload_sessions_upload_id
  on public.media_upload_sessions(upload_id);

alter table public.media_upload_sessions enable row level security;

do $$ begin
  create policy "Media upload sessions service" on public.media_upload_sessions
    to service_role using (true) with check (true);
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "Media upload sessions owner read" on public.media_upload_sessions
    for select using (auth.uid() = owner_user_id);
exception when duplicate_object then null; end $$;

-- Keep updated_at current
create trigger trg_media_upload_sessions_updated_at
  before update on public.media_upload_sessions
  for each row execute function public.set_updated_at();
