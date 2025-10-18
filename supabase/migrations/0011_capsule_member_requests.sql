-- Capsule member requests support

do $$
begin
  if not exists (
    select 1
    from pg_type
    where typname = 'capsule_member_request_status'
  ) then
    create type public.capsule_member_request_status as enum (
      'pending',
      'approved',
      'declined',
      'cancelled'
    );
  end if;
end
$$;
create table if not exists public.capsule_member_requests (
  id uuid primary key default gen_random_uuid(),
  capsule_id uuid not null references public.capsules(id) on delete cascade,
  requester_id uuid not null references public.users(id) on delete cascade,
  status public.capsule_member_request_status not null default 'pending',
  role public.member_role not null default 'member',
  message text,
  responded_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  approved_at timestamptz,
  declined_at timestamptz,
  cancelled_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint capsule_member_requests_unique_requester unique (capsule_id, requester_id)
);
create index if not exists idx_capsule_member_requests_capsule
  on public.capsule_member_requests(capsule_id);
create index if not exists idx_capsule_member_requests_requester
  on public.capsule_member_requests(requester_id);
create index if not exists idx_capsule_member_requests_status_pending
  on public.capsule_member_requests(status)
  where status = 'pending';
alter table public.capsule_member_requests enable row level security;
do $$
begin
  begin
    create policy "Service role full access capsule_member_requests"
      on public.capsule_member_requests
      to service_role
      using (true)
      with check (true);
  exception when others then
    null;
  end;
end
$$;
do $$
begin
  begin
    create trigger trg_capsule_member_requests_updated_at
      before update on public.capsule_member_requests
      for each row execute function public.set_updated_at();
  exception when duplicate_object then
    null;
  end;
end
$$;
