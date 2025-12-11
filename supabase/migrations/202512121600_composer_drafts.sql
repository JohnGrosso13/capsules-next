create table if not exists public.composer_drafts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  project_id uuid null,
  thread_id text not null default gen_random_uuid(),
  prompt text not null default '',
  message text null,
  draft jsonb not null default '{}'::jsonb,
  raw_post jsonb null,
  history jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

alter table public.composer_drafts enable row level security;

create unique index if not exists composer_drafts_thread_user_idx
  on public.composer_drafts (user_id, thread_id);

create index if not exists composer_drafts_user_updated_idx
  on public.composer_drafts (user_id, updated_at desc);

do $$
begin
  create policy "composer_drafts_self_select"
    on public.composer_drafts
    for select
    using (auth.uid() = user_id);
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create policy "composer_drafts_self_insert"
    on public.composer_drafts
    for insert
    with check (auth.uid() = user_id);
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create policy "composer_drafts_self_update"
    on public.composer_drafts
    for update
    using (auth.uid() = user_id)
    with check (auth.uid() = user_id);
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create policy "composer_drafts_self_delete"
    on public.composer_drafts
    for delete
    using (auth.uid() = user_id);
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create trigger composer_drafts_set_updated_at
    before update on public.composer_drafts
    for each row
    execute procedure public.set_updated_at();
exception
  when duplicate_object then null;
end $$;
