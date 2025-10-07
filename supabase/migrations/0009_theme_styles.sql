-- 0009_theme_styles.sql: dedicated table for user theme styles
create table if not exists public.theme_styles (
  id uuid default gen_random_uuid() primary key,
  owner_user_id uuid references public.users(id) on delete cascade,
  title text not null default '',
  summary text,
  description text,
  prompt text,
  details text,
  theme_mode text check (theme_mode in ('light','dark')),
  vars jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_theme_styles_owner on public.theme_styles(owner_user_id, created_at desc);
create index if not exists idx_theme_styles_mode on public.theme_styles(theme_mode);

create or replace function public.update_theme_styles_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists theme_styles_set_updated_at on public.theme_styles;
create trigger theme_styles_set_updated_at
  before update on public.theme_styles
  for each row execute function public.update_theme_styles_updated_at();

alter table public.theme_styles enable row level security;

do $$ begin
  create policy "Theme styles service" on public.theme_styles
    to service_role using (true) with check (true);
exception when duplicate_object then null; end $$;


do $$ begin
  create policy "Theme styles owner" on public.theme_styles
    for all to authenticated
    using (owner_user_id = auth.uid())
    with check (owner_user_id = auth.uid());
exception when duplicate_object then null; end $$;
