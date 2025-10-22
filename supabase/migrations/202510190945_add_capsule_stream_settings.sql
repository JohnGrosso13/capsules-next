-- Capsule stream settings to persist encoder preferences for AI Stream Studio

create table if not exists public.capsule_stream_settings (
  capsule_id uuid primary key references public.capsules(id) on delete cascade,
  owner_user_id uuid not null references public.users(id) on delete cascade,
  latency_mode text,
  disconnect_protection boolean not null default true,
  audio_warnings boolean not null default true,
  store_past_broadcasts boolean not null default true,
  always_publish_vods boolean not null default true,
  auto_clips boolean not null default false,
  metadata jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

do $$
begin
  create trigger trg_capsule_stream_settings_updated_at
    before update on public.capsule_stream_settings
    for each row execute function public.set_updated_at();
exception when duplicate_object then
  null;
end $$;

alter table public.capsule_stream_settings enable row level security;

do $$
begin
  create policy "Service role full access capsule_stream_settings"
    on public.capsule_stream_settings
    to service_role
    using (true)
    with check (true);
exception when others then
  null;
end $$;

do $$
begin
  create policy "Capsule owners manage capsule_stream_settings"
    on public.capsule_stream_settings
    for all
    to authenticated
    using (
      exists (
        select 1
        from public.capsules c
        where c.id = capsule_stream_settings.capsule_id
          and c.created_by_id = auth.uid()
      )
    )
    with check (
      exists (
        select 1
        from public.capsules c
        where c.id = capsule_stream_settings.capsule_id
          and c.created_by_id = auth.uid()
      )
    );
exception when others then
  null;
end $$;
