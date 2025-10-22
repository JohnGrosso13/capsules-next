create table if not exists ai_image_variants (
  id uuid primary key default gen_random_uuid(),
  run_id uuid null references ai_image_runs(id) on delete set null,
  owner_user_id uuid null,
  capsule_id uuid null,
  asset_kind text not null,
  branch_key text not null default 'main',
  version integer not null,
  image_url text not null,
  thumb_url text null,
  metadata jsonb not null default '{}'::jsonb,
  parent_variant_id uuid null references ai_image_variants(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists idx_ai_image_variants_owner_asset on ai_image_variants (
  owner_user_id,
  capsule_id,
  asset_kind,
  branch_key,
  version desc
);

create index if not exists idx_ai_image_variants_run on ai_image_variants(run_id);

create unique index if not exists uq_ai_image_variants_version on ai_image_variants (
  asset_kind,
  branch_key,
  coalesce(owner_user_id::text, ''),
  coalesce(capsule_id::text, ''),
  version
);
