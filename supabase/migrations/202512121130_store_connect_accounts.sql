-- Stripe Connect support for capsule storefront payouts

create table if not exists public.store_connect_accounts (
  id uuid primary key default gen_random_uuid(),
  capsule_id uuid not null references public.capsules(id) on delete cascade,
  stripe_account_id text not null,
  charges_enabled boolean not null default false,
  payouts_enabled boolean not null default false,
  details_submitted boolean not null default false,
  requirements jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (capsule_id),
  unique (stripe_account_id)
);

create index if not exists idx_store_connect_accounts_capsule on public.store_connect_accounts(capsule_id);

do $$
begin
  if exists (select 1 from pg_proc where proname = 'set_updated_at') then
    begin
      create trigger trg_store_connect_accounts_updated_at
        before update on public.store_connect_accounts
        for each row execute function public.set_updated_at();
    exception when duplicate_object then null;
    end;
  end if;
exception when others then null;
end $$;

alter table public.store_connect_accounts enable row level security;

do $$ begin
  create policy "Service role full access store_connect_accounts"
    on public.store_connect_accounts
    for all
    to service_role
    using (true)
    with check (true);
exception when duplicate_object then null; end $$;

-- Ensure payouts remain idempotent per order
create unique index if not exists uniq_store_payouts_order
  on public.store_payouts(order_id)
  where order_id is not null;
