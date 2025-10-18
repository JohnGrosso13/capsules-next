-- 0010_artifacts_core.sql: core artifact storage
create table if not exists public.artifact_artifacts (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references public.users(id) on delete cascade,
  artifact_type text not null,
  status text not null default 'draft' check (status in ('draft', 'published', 'archived')),
  title text not null,
  description text,
  version integer not null default 1,
  metadata jsonb not null default '{}'::jsonb,
  blocks jsonb not null default '[]'::jsonb,
  context jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  committed_at timestamptz
);
create index if not exists idx_artifact_owner_updated
  on public.artifact_artifacts(owner_user_id, updated_at desc);
create index if not exists idx_artifact_type_status
  on public.artifact_artifacts(artifact_type, status);
create table if not exists public.artifact_assets (
  id uuid primary key default gen_random_uuid(),
  artifact_id uuid not null references public.artifact_artifacts(id) on delete cascade,
  block_id text not null,
  slot_id text not null,
  r2_bucket text not null,
  r2_key text not null,
  content_type text,
  descriptor jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists idx_artifact_assets_slot
  on public.artifact_assets(artifact_id, block_id, slot_id);
create table if not exists public.artifact_events (
  id uuid primary key default gen_random_uuid(),
  artifact_id uuid not null references public.artifact_artifacts(id) on delete cascade,
  event_type text not null,
  origin text not null default 'system',
  payload jsonb not null default '{}'::jsonb,
  emitted_at timestamptz not null default now()
);
create index if not exists idx_artifact_events_artifact
  on public.artifact_events(artifact_id, emitted_at desc);
create trigger trg_artifact_artifacts_updated_at
  before update on public.artifact_artifacts
  for each row execute function public.set_updated_at();
create trigger trg_artifact_assets_updated_at
  before update on public.artifact_assets
  for each row execute function public.set_updated_at();
alter table public.artifact_artifacts enable row level security;
alter table public.artifact_assets enable row level security;
alter table public.artifact_events enable row level security;
do $$ begin
  create policy "Artifact service access" on public.artifact_artifacts
    to service_role using (true) with check (true);
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "Artifact owner read" on public.artifact_artifacts
    for select using (auth.uid() = owner_user_id);
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "Artifact owner modify" on public.artifact_artifacts
    for all using (auth.uid() = owner_user_id) with check (auth.uid() = owner_user_id);
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "Artifact assets service" on public.artifact_assets
    to service_role using (true) with check (true);
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "Artifact assets owner" on public.artifact_assets
    for all using (
      exists (
        select 1 from public.artifact_artifacts a
        where a.id = artifact_id and a.owner_user_id = auth.uid()
      )
    ) with check (
      exists (
        select 1 from public.artifact_artifacts a
        where a.id = artifact_id and a.owner_user_id = auth.uid()
      )
    );
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "Artifact events service" on public.artifact_events
    to service_role using (true) with check (true);
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "Artifact events owner read" on public.artifact_events
    for select using (
      exists (
        select 1 from public.artifact_artifacts a
        where a.id = artifact_id and a.owner_user_id = auth.uid()
      )
    );
exception when duplicate_object then null; end $$;
