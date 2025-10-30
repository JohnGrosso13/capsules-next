-- Capsule ladders and participant tables

create table if not exists public.capsule_ladders (
  id uuid primary key default gen_random_uuid(),
  capsule_id uuid not null references public.capsules(id) on delete cascade,
  created_by_id uuid not null references public.users(id) on delete cascade,
  published_by_id uuid references public.users(id) on delete set null,
  name text not null,
  slug text unique,
  summary text,
  status text not null default 'draft' check (status in ('draft','active','archived')),
  visibility text not null default 'capsule' check (visibility in ('private','capsule','public')),
  game jsonb not null default '{}'::jsonb,
  config jsonb not null default '{}'::jsonb,
  sections jsonb not null default '{}'::jsonb,
  ai_plan jsonb,
  meta jsonb,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_capsule_ladders_capsule on public.capsule_ladders(capsule_id);
create index if not exists idx_capsule_ladders_creator on public.capsule_ladders(created_by_id);
create unique index if not exists idx_capsule_ladders_slug on public.capsule_ladders(slug) where slug is not null;

do $$
begin
  create trigger trg_capsule_ladders_updated_at
    before update on public.capsule_ladders
    for each row execute function public.set_updated_at();
exception when duplicate_object then
  null;
end $$;

alter table public.capsule_ladders enable row level security;

do $$
begin
  create policy "Service role full access capsule_ladders"
    on public.capsule_ladders
    to service_role
    using (true)
    with check (true);
exception when others then
  null;
end $$;

do $$
begin
  create policy "Capsule members view capsule_ladders"
    on public.capsule_ladders
    for select
    to authenticated
    using (
      exists (
        select 1
        from public.capsule_members cm
        where cm.capsule_id = capsule_ladders.capsule_id
          and cm.user_id = auth.uid()
      )
      or exists (
        select 1
        from public.capsules c
        where c.id = capsule_ladders.capsule_id
          and c.created_by_id = auth.uid()
      )
      or visibility = 'public'
    );
exception when others then
  null;
end $$;

do $$
begin
  create policy "Capsule managers create capsule_ladders"
    on public.capsule_ladders
    for insert
    to authenticated
    with check (
      created_by_id = auth.uid()
      and exists (
        select 1
        from public.capsules c
        left join public.capsule_members cm
          on cm.capsule_id = c.id
         and cm.user_id = auth.uid()
        where c.id = capsule_ladders.capsule_id
          and (
            c.created_by_id = auth.uid()
            or cm.role in ('owner','admin','moderator')
          )
      )
    );
exception when others then
  null;
end $$;

do $$
begin
  create policy "Capsule managers update capsule_ladders"
    on public.capsule_ladders
    for update
    to authenticated
    using (
      exists (
        select 1
        from public.capsules c
        left join public.capsule_members cm
          on cm.capsule_id = c.id
         and cm.user_id = auth.uid()
        where c.id = capsule_ladders.capsule_id
          and (
            c.created_by_id = auth.uid()
            or cm.role in ('owner','admin','moderator')
          )
      )
    )
    with check (
      exists (
        select 1
        from public.capsules c
        left join public.capsule_members cm
          on cm.capsule_id = c.id
         and cm.user_id = auth.uid()
        where c.id = capsule_ladders.capsule_id
          and (
            c.created_by_id = auth.uid()
            or cm.role in ('owner','admin','moderator')
          )
      )
    );
exception when others then
  null;
end $$;

do $$
begin
  create policy "Capsule managers delete capsule_ladders"
    on public.capsule_ladders
    for delete
    to authenticated
    using (
      exists (
        select 1
        from public.capsules c
        left join public.capsule_members cm
          on cm.capsule_id = c.id
         and cm.user_id = auth.uid()
        where c.id = capsule_ladders.capsule_id
          and (
            c.created_by_id = auth.uid()
            or cm.role in ('owner','admin','moderator')
          )
      )
    );
exception when others then
  null;
end $$;

create table if not exists public.capsule_ladder_members (
  id uuid primary key default gen_random_uuid(),
  ladder_id uuid not null references public.capsule_ladders(id) on delete cascade,
  user_id uuid references public.users(id) on delete set null,
  display_name text not null,
  handle text,
  seed integer,
  rank integer,
  rating integer not null default 1200 check (rating >= 0),
  wins integer not null default 0 check (wins >= 0),
  losses integer not null default 0 check (losses >= 0),
  draws integer not null default 0 check (draws >= 0),
  streak integer not null default 0,
  metadata jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_capsule_ladder_members_ladder on public.capsule_ladder_members(ladder_id);
create unique index if not exists idx_capsule_ladder_members_user on public.capsule_ladder_members(ladder_id, user_id) where user_id is not null;

do $$
begin
  create trigger trg_capsule_ladder_members_updated_at
    before update on public.capsule_ladder_members
    for each row execute function public.set_updated_at();
exception when duplicate_object then
  null;
end $$;

alter table public.capsule_ladder_members enable row level security;

do $$
begin
  create policy "Service role full access capsule_ladder_members"
    on public.capsule_ladder_members
    to service_role
    using (true)
    with check (true);
exception when others then
  null;
end $$;

do $$
begin
  create policy "Capsule members view capsule_ladder_members"
    on public.capsule_ladder_members
    for select
    to authenticated
    using (
      exists (
        select 1
        from public.capsule_ladders l
        where l.id = capsule_ladder_members.ladder_id
          and (
            l.visibility = 'public'
            or l.created_by_id = auth.uid()
            or exists (
              select 1
              from public.capsule_members cm
              where cm.capsule_id = l.capsule_id
                and cm.user_id = auth.uid()
            )
          )
      )
    );
exception when others then
  null;
end $$;

do $$
begin
  create policy "Capsule managers insert capsule_ladder_members"
    on public.capsule_ladder_members
    for insert
    to authenticated
    with check (
      exists (
        select 1
        from public.capsule_ladders l
        left join public.capsule_members cm
          on cm.capsule_id = l.capsule_id
         and cm.user_id = auth.uid()
        where l.id = capsule_ladder_members.ladder_id
          and (
            l.created_by_id = auth.uid()
            or cm.role in ('owner','admin','moderator')
          )
      )
    );
exception when others then
  null;
end $$;

do $$
begin
  create policy "Capsule managers update capsule_ladder_members"
    on public.capsule_ladder_members
    for update
    to authenticated
    using (
      exists (
        select 1
        from public.capsule_ladders l
        left join public.capsule_members cm
          on cm.capsule_id = l.capsule_id
         and cm.user_id = auth.uid()
        where l.id = capsule_ladder_members.ladder_id
          and (
            l.created_by_id = auth.uid()
            or cm.role in ('owner','admin','moderator')
          )
      )
    )
    with check (
      exists (
        select 1
        from public.capsule_ladders l
        left join public.capsule_members cm
          on cm.capsule_id = l.capsule_id
         and cm.user_id = auth.uid()
        where l.id = capsule_ladder_members.ladder_id
          and (
            l.created_by_id = auth.uid()
            or cm.role in ('owner','admin','moderator')
          )
      )
    );
exception when others then
  null;
end $$;

do $$
begin
  create policy "Capsule managers delete capsule_ladder_members"
    on public.capsule_ladder_members
    for delete
    to authenticated
    using (
      exists (
        select 1
        from public.capsule_ladders l
        left join public.capsule_members cm
          on cm.capsule_id = l.capsule_id
         and cm.user_id = auth.uid()
        where l.id = capsule_ladder_members.ladder_id
          and (
            l.created_by_id = auth.uid()
            or cm.role in ('owner','admin','moderator')
          )
      )
    );
exception when others then
  null;
end $$;

