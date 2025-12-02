-- Billing & wallet primitives for personal + capsule upgrades and donations
-- Schema introduces:
--   wallets                    : one per (owner_type, owner_id)
--   billing_plans              : catalog of personal/capsule plans tied to Stripe prices
--   subscriptions              : active Stripe subscriptions mapped to wallets
--   wallet_transactions        : append-only ledger (funding, usage, bonuses, transfers)
--   wallet_balances            : cached period balances for quick entitlement checks
--   wallet_transfers           : user-initiated donations between wallets

do $$
begin
  if not exists (select 1 from pg_type where typname = 'wallet_owner_type') then
    create type public.wallet_owner_type as enum ('user', 'capsule');
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'subscription_status') then
    create type public.subscription_status as enum (
      'trialing',
      'active',
      'past_due',
      'canceled',
      'incomplete'
    );
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'wallet_transaction_type') then
    create type public.wallet_transaction_type as enum (
      'funding',
      'usage',
      'bonus',
      'refund',
      'transfer_in',
      'transfer_out'
    );
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'wallet_metric') then
    create type public.wallet_metric as enum (
      'compute',
      'storage',
      'feature',
      'model_tier'
    );
  end if;
end $$;

create table if not exists public.wallets (
  id uuid primary key default gen_random_uuid(),
  owner_type public.wallet_owner_type not null,
  owner_id uuid not null,
  display_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_type, owner_id)
);

create index if not exists idx_wallets_owner on public.wallets(owner_type, owner_id);

create table if not exists public.billing_plans (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  scope public.wallet_owner_type not null,
  name text not null,
  description text,
  price_cents integer,
  currency text not null default 'usd',
  billing_interval text not null default 'monthly' check (billing_interval in ('monthly','yearly')),
  features jsonb not null default '{}'::jsonb,
  included_compute bigint not null default 0,
  included_storage_bytes bigint not null default 0,
  priority_tier integer,
  active boolean not null default true,
  stripe_price_id text unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_billing_plans_scope_active on public.billing_plans(scope, active);

create table if not exists public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  wallet_id uuid not null references public.wallets(id) on delete cascade,
  plan_id uuid references public.billing_plans(id) on delete set null,
  status public.subscription_status not null default 'incomplete',
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  stripe_subscription_id text unique,
  stripe_customer_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_subscriptions_wallet on public.subscriptions(wallet_id);
create index if not exists idx_subscriptions_plan on public.subscriptions(plan_id);

create table if not exists public.wallet_transactions (
  id uuid primary key default gen_random_uuid(),
  wallet_id uuid not null references public.wallets(id) on delete cascade,
  type public.wallet_transaction_type not null,
  metric public.wallet_metric not null,
  amount bigint not null,
  description text,
  source_type text,
  source_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_wallet_transactions_wallet on public.wallet_transactions(wallet_id);
create index if not exists idx_wallet_transactions_metric on public.wallet_transactions(metric);
create index if not exists idx_wallet_transactions_created on public.wallet_transactions(created_at desc);

create table if not exists public.wallet_balances (
  id uuid primary key default gen_random_uuid(),
  wallet_id uuid not null unique references public.wallets(id) on delete cascade,
  compute_granted bigint not null default 0,
  compute_used bigint not null default 0,
  storage_granted bigint not null default 0,
  storage_used bigint not null default 0,
  feature_tier text,
  model_tier text,
  period_start timestamptz,
  period_end timestamptz,
  updated_at timestamptz not null default now()
);

create table if not exists public.wallet_transfers (
  id uuid primary key default gen_random_uuid(),
  from_wallet_id uuid not null references public.wallets(id) on delete cascade,
  to_wallet_id uuid not null references public.wallets(id) on delete cascade,
  metric public.wallet_metric not null,
  amount bigint not null,
  message text,
  created_by uuid,
  created_at timestamptz not null default now()
);

create index if not exists idx_wallet_transfers_from on public.wallet_transfers(from_wallet_id);
create index if not exists idx_wallet_transfers_to on public.wallet_transfers(to_wallet_id);

-- ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::
-- Capsule commerce primitives (products, orders, payments, payouts)
-- ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::

do $$
begin
  if not exists (select 1 from pg_type where typname = 'store_product_kind') then
    create type public.store_product_kind as enum ('digital', 'physical', 'service');
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'store_fulfillment_kind') then
    create type public.store_fulfillment_kind as enum ('download', 'ship', 'external');
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'store_order_status') then
    create type public.store_order_status as enum (
      'pending',
      'requires_payment',
      'paid',
      'fulfillment_pending',
      'fulfilled',
      'canceled',
      'refunded',
      'partially_refunded'
    );
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'store_payment_status') then
    create type public.store_payment_status as enum (
      'requires_payment',
      'succeeded',
      'refunded',
      'failed'
    );
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'store_payout_status') then
    create type public.store_payout_status as enum ('pending', 'paid', 'failed');
  end if;
end $$;

create table if not exists public.store_products (
  id uuid primary key default gen_random_uuid(),
  capsule_id uuid not null references public.capsules(id) on delete cascade,
  created_by uuid references public.users(id) on delete set null,
  title text not null,
  description text,
  kind public.store_product_kind not null default 'digital',
  price_cents integer not null default 0,
  currency text not null default 'usd',
  active boolean not null default true,
  inventory_count integer,
  fulfillment_kind public.store_fulfillment_kind not null default 'download',
  fulfillment_url text,
  media_url text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_store_products_capsule on public.store_products(capsule_id);
create index if not exists idx_store_products_active on public.store_products(active);

create table if not exists public.store_orders (
  id uuid primary key default gen_random_uuid(),
  capsule_id uuid references public.capsules(id) on delete set null,
  buyer_user_id uuid references public.users(id) on delete set null,
  status public.store_order_status not null default 'pending',
  payment_status public.store_payment_status not null default 'requires_payment',
  subtotal_cents integer not null default 0,
  tax_cents integer not null default 0,
  fee_cents integer not null default 0,
  total_cents integer not null default 0,
  currency text not null default 'usd',
  stripe_checkout_session_id text,
  stripe_payment_intent_id text,
  tax_details jsonb not null default '{}'::jsonb,
  shipping_required boolean not null default false,
  shipping_status text not null default 'pending' check (shipping_status in ('pending','preparing','shipped','delivered','cancelled')),
  shipping_name text,
  shipping_email text,
  shipping_phone text,
  shipping_address_line1 text,
  shipping_address_line2 text,
  shipping_city text,
  shipping_region text,
  shipping_postal_code text,
  shipping_country text,
  shipping_notes text,
  shipping_carrier text,
  shipping_tracking text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz
);

create index if not exists idx_store_orders_capsule on public.store_orders(capsule_id);
create index if not exists idx_store_orders_buyer on public.store_orders(buyer_user_id);
create index if not exists idx_store_orders_status on public.store_orders(status);

create table if not exists public.store_order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.store_orders(id) on delete cascade,
  product_id uuid references public.store_products(id) on delete set null,
  title text not null,
  quantity integer not null default 1,
  unit_price_cents integer not null default 0,
  total_cents integer not null default 0,
  tax_cents integer not null default 0,
  currency text not null default 'usd',
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists idx_store_order_items_order on public.store_order_items(order_id);
create index if not exists idx_store_order_items_product on public.store_order_items(product_id);

create table if not exists public.store_payments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.store_orders(id) on delete cascade,
  provider text not null default 'stripe',
  status public.store_payment_status not null default 'requires_payment',
  amount_cents integer not null default 0,
  currency text not null default 'usd',
  stripe_payment_intent_id text,
  stripe_charge_id text,
  receipt_url text,
  raw_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_store_payments_order on public.store_payments(order_id);
create index if not exists idx_store_payments_status on public.store_payments(status);
create unique index if not exists idx_store_payments_intent on public.store_payments(stripe_payment_intent_id) where stripe_payment_intent_id is not null;

create table if not exists public.store_payouts (
  id uuid primary key default gen_random_uuid(),
  capsule_id uuid not null references public.capsules(id) on delete cascade,
  order_id uuid references public.store_orders(id) on delete set null,
  amount_cents integer not null default 0,
  fee_cents integer not null default 0,
  currency text not null default 'usd',
  status public.store_payout_status not null default 'pending',
  payout_ref text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_store_payouts_capsule on public.store_payouts(capsule_id);
create index if not exists idx_store_payouts_status on public.store_payouts(status);

-- RLS: gate access to service role; app-side access should flow through privileged RPCs
alter table public.wallets enable row level security;
alter table public.billing_plans enable row level security;
alter table public.subscriptions enable row level security;
alter table public.wallet_transactions enable row level security;
alter table public.wallet_balances enable row level security;
alter table public.wallet_transfers enable row level security;
alter table public.store_products enable row level security;
alter table public.store_orders enable row level security;
alter table public.store_order_items enable row level security;
alter table public.store_payments enable row level security;
alter table public.store_payouts enable row level security;

do $$ begin
  create policy "Service role full access wallets" on public.wallets for all to service_role using (true) with check (true);
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "Service role full access billing_plans" on public.billing_plans for all to service_role using (true) with check (true);
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "Service role full access subscriptions" on public.subscriptions for all to service_role using (true) with check (true);
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "Service role full access wallet_transactions" on public.wallet_transactions for all to service_role using (true) with check (true);
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "Service role full access wallet_balances" on public.wallet_balances for all to service_role using (true) with check (true);
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "Service role full access wallet_transfers" on public.wallet_transfers for all to service_role using (true) with check (true);
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "Service role full access store_products" on public.store_products for all to service_role using (true) with check (true);
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "Service role full access store_orders" on public.store_orders for all to service_role using (true) with check (true);
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "Service role full access store_order_items" on public.store_order_items for all to service_role using (true) with check (true);
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "Service role full access store_payments" on public.store_payments for all to service_role using (true) with check (true);
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "Service role full access store_payouts" on public.store_payouts for all to service_role using (true) with check (true);
exception when duplicate_object then null; end $$;

comment on table public.wallets is 'Per-owner wallet supporting personal and capsule balances.';
comment on table public.wallet_transactions is 'Append-only ledger of funding/usage/bonus/transfer rows.';
comment on table public.wallet_balances is 'Cached balance snapshot for entitlement checks.';
comment on table public.billing_plans is 'Plan catalog mapped to Stripe prices.';
comment on table public.subscriptions is 'Stripe subscription state keyed to wallets.';
comment on table public.wallet_transfers is 'User donations and internal transfers between wallets.';
comment on table public.store_products is 'Capsule-scoped products/listings for storefronts.';
comment on table public.store_orders is 'Orders for capsule storefront purchases.';
comment on table public.store_order_items is 'Line items per store order.';
comment on table public.store_payments is 'Payment intents/charges for store orders.';
comment on table public.store_payouts is 'Payouts/settlements to capsule owners.';
