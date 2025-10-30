-- Capture per-user panel layout state for the AI Stream studio experience.
-- Layout state stores serialized JSON segments keyed by view/segment identifiers.

create table if not exists public.user_panel_layouts (
  user_id uuid not null references public.users(id) on delete cascade,
  view text not null,
  storage_key text not null,
  state jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint user_panel_layouts_user_storage_key_unique unique (user_id, storage_key)
);

create index if not exists idx_user_panel_layouts_user_view
  on public.user_panel_layouts (user_id, view);

create index if not exists idx_user_panel_layouts_view
  on public.user_panel_layouts (view);

alter table public.user_panel_layouts enable row level security;

do $$
begin
  begin
    create policy "Service role full access user_panel_layouts"
      on public.user_panel_layouts
      to service_role
      using (true)
      with check (true);
  exception
    when others then null;
  end;
end
$$;

do $$
begin
  begin
    create trigger trg_user_panel_layouts_updated_at
      before update on public.user_panel_layouts
      for each row execute function public.set_updated_at();
  exception
    when duplicate_object then null;
  end;
end
$$;
