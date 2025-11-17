create table if not exists public.user_profile_settings (
  user_id uuid primary key references public.users(id) on delete cascade,
  stats_visibility text not null default 'public' check (stats_visibility in ('public', 'private')),
  updated_at timestamptz not null default timezone('utc', now())
);

alter table public.user_profile_settings enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies p
    where p.schemaname = 'public'
      and p.tablename = 'user_profile_settings'
      and p.policyname = 'user_profile_settings_self_select'
  ) then
    create policy "user_profile_settings_self_select"
      on public.user_profile_settings
      for select
      using (auth.uid() = user_id);
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1 from pg_policies p
    where p.schemaname = 'public'
      and p.tablename = 'user_profile_settings'
      and p.policyname = 'user_profile_settings_self_insert'
  ) then
    create policy "user_profile_settings_self_insert"
      on public.user_profile_settings
      for insert
      with check (auth.uid() = user_id);
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1 from pg_policies p
    where p.schemaname = 'public'
      and p.tablename = 'user_profile_settings'
      and p.policyname = 'user_profile_settings_self_update'
  ) then
    create policy "user_profile_settings_self_update"
      on public.user_profile_settings
      for update
      using (auth.uid() = user_id)
      with check (auth.uid() = user_id);
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1 from pg_trigger t
    join pg_class c on c.oid = t.tgrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = 'user_profile_settings'
      and t.tgname = 'user_profile_settings_set_updated_at'
  ) then
    create trigger user_profile_settings_set_updated_at
      before update on public.user_profile_settings
      for each row
      execute procedure public.set_updated_at();
  end if;
end
$$;
