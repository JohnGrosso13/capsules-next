create table if not exists public.user_composer_settings (
  user_id uuid primary key references public.users(id) on delete cascade,
  image_quality text not null default 'standard' check (image_quality in ('low', 'standard', 'high')),
  image_size text not null default '768x768',
  updated_at timestamptz not null default timezone('utc', now())
);

alter table public.user_composer_settings enable row level security;

do $$
begin
  create policy "user_composer_settings_self_select"
    on public.user_composer_settings
    for select
    using (auth.uid() = user_id);
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create policy "user_composer_settings_self_insert"
    on public.user_composer_settings
    for insert
    with check (auth.uid() = user_id);
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create policy "user_composer_settings_self_update"
    on public.user_composer_settings
    for update
    using (auth.uid() = user_id)
    with check (auth.uid() = user_id);
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create trigger user_composer_settings_set_updated_at
    before update on public.user_composer_settings
    for each row
    execute procedure public.set_updated_at();
exception
  when duplicate_object then null;
end $$;
