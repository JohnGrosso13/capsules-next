do $$
begin
  if not exists (select 1 from pg_type where typname = 'party_invite_status') then
    create type public.party_invite_status as enum ('pending','accepted','declined','cancelled','expired');
  end if;
end $$;

create table if not exists public.party_invites (
  id uuid primary key default gen_random_uuid(),
  party_id text not null,
  sender_id uuid not null references public.users(id) on delete cascade,
  recipient_id uuid not null references public.users(id) on delete cascade,
  status public.party_invite_status not null default 'pending',
  topic text,
  message text,
  metadata jsonb,
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  accepted_at timestamptz,
  declined_at timestamptz,
  cancelled_at timestamptz,
  updated_at timestamptz not null default now(),
  expires_at timestamptz,
  constraint party_invites_not_self check (sender_id <> recipient_id)
);

-- Partial indexes must only use immutable predicates; drop `now()` usage.
create index if not exists idx_party_invites_recipient_pending
  on public.party_invites(recipient_id, expires_at)
  where status = 'pending';

create index if not exists idx_party_invites_sender_pending
  on public.party_invites(sender_id, expires_at)
  where status = 'pending';

create unique index if not exists uniq_party_invites_pending
  on public.party_invites(party_id, recipient_id)
  where status = 'pending';

do $$
begin
  begin
    create trigger trg_party_invites_updated_at
      before update on public.party_invites
      for each row execute function public.set_updated_at();
  exception
    when duplicate_object then null;
  end;
end $$;

alter table public.party_invites enable row level security;

do $$
begin
  begin
    create policy "Service role full access party_invites"
      on public.party_invites
      to service_role
      using (true)
      with check (true);
  exception
    when others then null;
  end;
end $$;
