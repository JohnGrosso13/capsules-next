-- Capsule store schema alignment
-- Goal: model the UI fields (products, variants, promos, confirmations) so buyers/creators
-- can persist real data and we can wire Stripe later.

-- ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::
-- Product catalog: columns to match UI (featured, sort order, media, sales)
-- ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::

alter table public.store_products
  add column if not exists image_url text,
  add column if not exists memory_id uuid references public.memories(id) on delete set null,
  add column if not exists featured boolean not null default false,
  add column if not exists sort_order integer not null default 0,
  add column if not exists sales_count integer not null default 0,
  add column if not exists published_at timestamptz,
  add column if not exists archived_at timestamptz,
  add column if not exists sku text,
  add column if not exists hero boolean not null default false;

create index if not exists idx_store_products_capsule_sort on public.store_products(capsule_id, featured desc, sort_order, created_at desc);

-- Variants: per-product options used by UI cart/checkout.
create table if not exists public.store_product_variants (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.store_products(id) on delete cascade,
  label text not null,
  price_cents integer not null default 0 check (price_cents >= 0),
  currency text not null default 'usd',
  inventory_count integer,
  sku text,
  active boolean not null default true,
  sort_order integer not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.store_product_variants enable row level security;

create index if not exists idx_store_product_variants_product on public.store_product_variants(product_id);
create index if not exists idx_store_product_variants_active on public.store_product_variants(active);
create unique index if not exists idx_store_product_variants_product_sku on public.store_product_variants(product_id, sku) where sku is not null;

-- Shipping options: configurable per capsule instead of hard-coded.
create table if not exists public.store_shipping_options (
  id uuid primary key default gen_random_uuid(),
  capsule_id uuid not null references public.capsules(id) on delete cascade,
  label text not null,
  detail text,
  price_cents integer not null default 0 check (price_cents >= 0),
  currency text not null default 'usd',
  eta_min_days integer,
  eta_max_days integer,
  active boolean not null default true,
  sort_order integer not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.store_shipping_options enable row level security;

create index if not exists idx_store_shipping_options_capsule on public.store_shipping_options(capsule_id, active);

-- Promo codes: allow percent/fixed discounts; track redemptions.
create type public.store_discount_type as enum ('percent', 'fixed');

create table if not exists public.store_promo_codes (
  id uuid primary key default gen_random_uuid(),
  capsule_id uuid not null references public.capsules(id) on delete cascade,
  code text not null,
  description text,
  discount_type public.store_discount_type not null default 'percent',
  discount_value integer not null default 0 check (discount_value >= 0),
  currency text not null default 'usd',
  max_uses integer,
  max_uses_per_user integer,
  min_subtotal_cents integer,
  starts_at timestamptz,
  ends_at timestamptz,
  active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (capsule_id, code)
);

alter table public.store_promo_codes enable row level security;

create table if not exists public.store_promo_redemptions (
  id uuid primary key default gen_random_uuid(),
  promo_id uuid references public.store_promo_codes(id) on delete set null,
  order_id uuid not null references public.store_orders(id) on delete cascade,
  buyer_user_id uuid references public.users(id) on delete set null,
  amount_cents integer not null default 0,
  created_at timestamptz not null default now()
);

alter table public.store_promo_redemptions enable row level security;

create index if not exists idx_store_promo_redemptions_order on public.store_promo_redemptions(order_id);
create index if not exists idx_store_promo_codes_capsule on public.store_promo_codes(capsule_id, active);

-- ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::
-- Orders: capture contact, billing, promo, confirmation snapshot.
-- ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::

alter table public.store_orders
  add column if not exists contact_email text,
  add column if not exists contact_phone text,
  add column if not exists confirmation_code text,
  add column if not exists submitted_at timestamptz default now(),
  add column if not exists terms_version text,
  add column if not exists terms_accepted_at timestamptz,
  add column if not exists payment_method text,
  add column if not exists billing_same_as_shipping boolean not null default true,
  add column if not exists billing_name text,
  add column if not exists billing_email text,
  add column if not exists billing_phone text,
  add column if not exists billing_address_line1 text,
  add column if not exists billing_address_line2 text,
  add column if not exists billing_city text,
  add column if not exists billing_region text,
  add column if not exists billing_postal_code text,
  add column if not exists billing_country text,
  add column if not exists shipping_option_id uuid references public.store_shipping_options(id) on delete set null,
  add column if not exists shipping_option_label text,
  add column if not exists shipping_option_detail text,
  add column if not exists shipping_option_price_cents integer not null default 0,
  add column if not exists promo_code_id uuid references public.store_promo_codes(id) on delete set null,
  add column if not exists promo_code text,
  add column if not exists discount_cents integer not null default 0,
  add column if not exists discount_details jsonb not null default '{}'::jsonb,
  add column if not exists receipt_url text;

create unique index if not exists idx_store_orders_confirmation_code on public.store_orders(confirmation_code) where confirmation_code is not null;

-- Order items: capture variant + media + fulfillment snapshots.
alter table public.store_order_items
  add column if not exists variant_id uuid references public.store_product_variants(id) on delete set null,
  add column if not exists sku text,
  add column if not exists image_url text,
  add column if not exists memory_id uuid references public.memories(id) on delete set null,
  add column if not exists kind public.store_product_kind,
  add column if not exists fulfillment_kind public.store_fulfillment_kind,
  add column if not exists fulfillment_url text;

-- Payments: store method + captured/refunded amounts for confirmations.
alter table public.store_payments
  add column if not exists payment_method text,
  add column if not exists payment_provider_customer_id text,
  add column if not exists captured_at timestamptz,
  add column if not exists refunded_cents integer not null default 0;

-- Payout linkage to payment intent.
alter table public.store_payouts
  add column if not exists payment_id uuid references public.store_payments(id) on delete set null;

-- ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::
-- RLS policies for creators/buyers (service_role already has full access).
-- These are permissive so the app can read/write without using service_role.
-- Helper policy predicates reference capsule membership; adjust role list if needed.

create policy "Owners manage store_products"
  on public.store_products
  for all
  to authenticated
  using (
    exists (
      select 1 from public.capsule_members m
      where m.capsule_id = store_products.capsule_id
        and m.user_id = auth.uid()
        and m.role in ('owner','admin','moderator')
    )
  )
  with check (
    exists (
      select 1 from public.capsule_members m
      where m.capsule_id = store_products.capsule_id
        and m.user_id = auth.uid()
        and m.role in ('owner','admin','moderator')
    )
  );

create policy "Anyone can view active store_products"
  on public.store_products
  for select
  to anon, authenticated
  using (active = true and (archived_at is null));

create policy "Owners manage store_product_variants"
  on public.store_product_variants
  for all
  to authenticated
  using (
    exists (
      select 1 from public.store_products p
      join public.capsule_members m on m.capsule_id = p.capsule_id
      where p.id = store_product_variants.product_id
        and m.user_id = auth.uid()
        and m.role in ('owner','admin','moderator')
    )
  )
  with check (
    exists (
      select 1 from public.store_products p
      join public.capsule_members m on m.capsule_id = p.capsule_id
      where p.id = store_product_variants.product_id
        and m.user_id = auth.uid()
        and m.role in ('owner','admin','moderator')
    )
  );

create policy "Anyone can view active store_shipping_options"
  on public.store_shipping_options
  for select
  to anon, authenticated
  using (active = true);

create policy "Anyone can view active store_promo_codes"
  on public.store_promo_codes
  for select
  to anon, authenticated
  using (
    active = true
    and (starts_at is null or starts_at <= now())
    and (ends_at is null or ends_at >= now())
  );

create policy "Owners manage store_shipping_options"
  on public.store_shipping_options
  for all
  to authenticated
  using (
    exists (
      select 1 from public.capsule_members m
      where m.capsule_id = store_shipping_options.capsule_id
        and m.user_id = auth.uid()
        and m.role in ('owner','admin','moderator')
    )
  )
  with check (
    exists (
      select 1 from public.capsule_members m
      where m.capsule_id = store_shipping_options.capsule_id
        and m.user_id = auth.uid()
        and m.role in ('owner','admin','moderator')
    )
  );

create policy "Owners manage store_promo_codes"
  on public.store_promo_codes
  for all
  to authenticated
  using (
    exists (
      select 1 from public.capsule_members m
      where m.capsule_id = store_promo_codes.capsule_id
        and m.user_id = auth.uid()
        and m.role in ('owner','admin','moderator')
    )
  )
  with check (
    exists (
      select 1 from public.capsule_members m
      where m.capsule_id = store_promo_codes.capsule_id
        and m.user_id = auth.uid()
        and m.role in ('owner','admin','moderator')
    )
  );

-- Buyers can see their own orders; owners can see orders for their capsule.
create policy "Order owners and buyers can select store_orders"
  on public.store_orders
  for select
  to authenticated
  using (
    buyer_user_id = auth.uid()
    or exists (
      select 1 from public.capsule_members m
      where m.capsule_id = store_orders.capsule_id
        and m.user_id = auth.uid()
        and m.role in ('owner','admin','moderator')
    )
  );

-- Inserts/updates remain service_role-driven; if you want app-side inserts with user tokens, add more policies later.

-- Order items visibility mirrors orders.
create policy "Order owners and buyers can select store_order_items"
  on public.store_order_items
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.store_orders o
      where o.id = store_order_items.order_id
        and (
          o.buyer_user_id = auth.uid()
          or exists (
            select 1 from public.capsule_members m
            where m.capsule_id = o.capsule_id
              and m.user_id = auth.uid()
              and m.role in ('owner','admin','moderator')
          )
        )
    )
  );

-- Promo redemptions visibility mirrors orders.
create policy "Order owners and buyers can select store_promo_redemptions"
  on public.store_promo_redemptions
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.store_orders o
      where o.id = store_promo_redemptions.order_id
        and (
          o.buyer_user_id = auth.uid()
          or exists (
            select 1 from public.capsule_members m
            where m.capsule_id = o.capsule_id
              and m.user_id = auth.uid()
              and m.role in ('owner','admin','moderator')
          )
        )
    )
  );

comment on table public.store_product_variants is 'Per-product options (size/color/plan) with price and inventory.';
comment on table public.store_shipping_options is 'Configurable shipping options per capsule.';
comment on table public.store_promo_codes is 'Capsule-scoped promo/discount codes.';
comment on table public.store_promo_redemptions is 'Promo redemption records tied to orders.';

-- ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::
-- Data hygiene: non-negative inventory, SKU uniqueness, updated_at triggers
-- ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::

alter table public.store_products
  add constraint store_products_inventory_nonnegative
  check (inventory_count is null or inventory_count >= 0);

alter table public.store_product_variants
  add constraint store_product_variants_inventory_nonnegative
  check (inventory_count is null or inventory_count >= 0);

create unique index if not exists idx_store_products_sku on public.store_products(sku) where sku is not null;

-- Simple updated_at trigger helper.
create function public.set_current_timestamp_updated_at() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger set_store_product_variants_updated_at
  before update on public.store_product_variants
  for each row
  execute procedure public.set_current_timestamp_updated_at();

create trigger set_store_shipping_options_updated_at
  before update on public.store_shipping_options
  for each row
  execute procedure public.set_current_timestamp_updated_at();

create trigger set_store_promo_codes_updated_at
  before update on public.store_promo_codes
  for each row
  execute procedure public.set_current_timestamp_updated_at();
