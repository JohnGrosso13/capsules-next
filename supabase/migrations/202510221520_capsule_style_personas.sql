create table if not exists capsule_style_personas (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null,
  capsule_id uuid null,
  name text not null,
  palette text null,
  medium text null,
  camera text null,
  notes text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_capsule_style_personas_owner on capsule_style_personas(owner_user_id);
create index if not exists idx_capsule_style_personas_capsule on capsule_style_personas(capsule_id);
