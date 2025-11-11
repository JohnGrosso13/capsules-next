create table if not exists public.user_profile_settings (
  user_id uuid primary key references public.users(id) on delete cascade,
  stats_visibility text not null default 'public' check (stats_visibility in ('public', 'private')),
  updated_at timestamptz not null default timezone('utc', now())
);

alter table public.user_profile_settings enable row level security;

create policy "user_profile_settings_self_select"
  on public.user_profile_settings
  for select
  using (auth.uid() = user_id);

create policy "user_profile_settings_self_insert"
  on public.user_profile_settings
  for insert
  with check (auth.uid() = user_id);

create policy "user_profile_settings_self_update"
  on public.user_profile_settings
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create trigger user_profile_settings_set_updated_at
  before update on public.user_profile_settings
  for each row
  execute procedure public.set_updated_at();
