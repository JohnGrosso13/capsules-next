-- Add capsule follower support and track invite origins

do $$
begin
  if not exists (
    select 1 from pg_type where typname = 'capsule_member_request_origin'
  ) then
    create type public.capsule_member_request_origin as enum ('viewer_request', 'owner_invite');
  end if;
end
$$;

alter table public.capsule_member_requests
  add column if not exists origin public.capsule_member_request_origin not null default 'viewer_request';

alter table public.capsule_member_requests
  add column if not exists initiator_id uuid references public.users(id) on delete set null;

update public.capsule_member_requests
  set origin = 'viewer_request'
  where origin is null;

update public.capsule_member_requests
  set initiator_id = coalesce(initiator_id, requester_id);

create table if not exists public.capsule_followers (
  id uuid primary key default gen_random_uuid(),
  capsule_id uuid not null references public.capsules(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint capsule_followers_unique unique (capsule_id, user_id)
);

create index if not exists idx_capsule_followers_capsule
  on public.capsule_followers(capsule_id);

create index if not exists idx_capsule_followers_user
  on public.capsule_followers(user_id);

alter table public.capsule_followers enable row level security;

do $$
begin
  begin
    create policy "Service role full access capsule_followers"
      on public.capsule_followers
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
    create trigger trg_capsule_followers_updated_at
      before update on public.capsule_followers
      for each row execute function public.set_updated_at();
  exception
    when duplicate_object then null;
  end;
end
$$;
